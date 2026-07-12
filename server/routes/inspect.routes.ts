import { Router } from 'express';
import type { Request, Response } from 'express';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { inspectBridgeScript } from '../services/inspect-bridge-script.js';
import { getSharedBrowser } from '../services/browser.service.js';
import {
  inspectService,
  type InspectDeviceContext,
  type InspectSelection,
  type InspectStackFrame,
  type RawElementSourceResult,
} from '../services/inspect.service.js';
import { proxyService } from '../services/proxy.service.js';
import { isInspectableLocalUrl } from '../utils/security.js';
import { sendError } from '../utils/http.js';
import { resolveSourceDirectory } from '../utils/path-policy.js';
import { logServerError } from '../utils/logger.js';

const router = Router();
const require = createRequire(import.meta.url);
const elementSourceEntryPath = require.resolve('element-source');
const elementSourceBundlePath = path.resolve(path.dirname(elementSourceEntryPath), 'index.global.js');
const elementSourceBundle = readFileSync(elementSourceBundlePath, 'utf8');

interface InspectDiscoveryCandidate {
  selector: string;
  tagName: string;
  text: string | null;
  role: string | null;
  attributes: {
    id: string | null;
    className: string | null;
    ariaLabel: string | null;
    title: string | null;
    name: string | null;
    placeholder: string | null;
    testId: string | null;
  };
  score: number;
  reasons: string[];
}

function isStackFrame(value: unknown): value is InspectStackFrame {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<InspectStackFrame>;
  return typeof candidate.filePath === 'string';
}

function normalizeElementSource(value: unknown): RawElementSourceResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    componentName?: unknown;
    source?: unknown;
    stack?: unknown;
    error?: unknown;
  };

  return {
    componentName: typeof candidate.componentName === 'string' ? candidate.componentName : null,
    source: isStackFrame(candidate.source)
      ? {
          filePath: candidate.source.filePath,
          lineNumber: typeof candidate.source.lineNumber === 'number' ? candidate.source.lineNumber : null,
          columnNumber: typeof candidate.source.columnNumber === 'number' ? candidate.source.columnNumber : null,
          componentName: typeof candidate.source.componentName === 'string' ? candidate.source.componentName : null,
        }
      : null,
    stack: Array.isArray(candidate.stack)
      ? candidate.stack
          .filter(isStackFrame)
          .map((frame) => ({
            filePath: frame.filePath,
            lineNumber: typeof frame.lineNumber === 'number' ? frame.lineNumber : null,
            columnNumber: typeof frame.columnNumber === 'number' ? frame.columnNumber : null,
            componentName: typeof frame.componentName === 'string' ? frame.componentName : null,
          }))
      : [],
    error: typeof candidate.error === 'string' ? candidate.error : null,
  };
}

function normalizeSelection(value: unknown): InspectSelection | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as {
    selector?: unknown;
    tagName?: unknown;
    text?: unknown;
    title?: unknown;
    pageUrl?: unknown;
    elementSource?: unknown;
  };

  if (typeof candidate.tagName !== 'string' || candidate.tagName.trim().length === 0) {
    return null;
  }

  return {
    selector: typeof candidate.selector === 'string' && candidate.selector.trim().length > 0
      ? candidate.selector
      : null,
    tagName: candidate.tagName,
    text: typeof candidate.text === 'string' && candidate.text.trim().length > 0
      ? candidate.text
      : null,
    title: typeof candidate.title === 'string' && candidate.title.trim().length > 0
      ? candidate.title
      : null,
    pageUrl: typeof candidate.pageUrl === 'string' && candidate.pageUrl.trim().length > 0
      ? candidate.pageUrl
      : null,
    elementSource: normalizeElementSource(candidate.elementSource),
  };
}

function normalizeDevice(value: unknown): InspectDeviceContext | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<InspectDeviceContext>;
  if (
    typeof candidate.id !== 'string'
    || typeof candidate.name !== 'string'
    || (candidate.type !== 'mobile' && candidate.type !== 'tablet' && candidate.type !== 'desktop')
    || typeof candidate.width !== 'number'
    || typeof candidate.height !== 'number'
  ) {
    return null;
  }

  return {
    id: candidate.id,
    name: candidate.name,
    type: candidate.type,
    width: candidate.width,
    height: candidate.height,
  };
}

async function inspectSelectionBySelector(
  url: string,
  selector: string,
  device: InspectDeviceContext | null,
): Promise<InspectSelection | null> {
  const browser = await getSharedBrowser();
  const page = await browser.newPage();

  try {
    if (device) {
      await page.setViewportSize({ width: device.width, height: device.height });
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(250);
    await page.addScriptTag({ path: elementSourceBundlePath });

    const selection = await page.evaluate(async (targetSelector) => {
      const element = document.querySelector(targetSelector);
      if (!(element instanceof Element)) {
        return null;
      }

      const api = (window as Window & {
        ElementSource?: {
          resolveElementInfo?: (target: Element) => Promise<unknown>;
        };
      }).ElementSource;

      let elementSource: unknown = null;
      if (api && typeof api.resolveElementInfo === 'function') {
        try {
          elementSource = await Promise.race([
            api.resolveElementInfo(element),
            new Promise<unknown>((resolve) => {
              window.setTimeout(() => {
                resolve({
                  componentName: null,
                  source: null,
                  stack: [],
                  error: 'Timed out while resolving runtime element metadata.',
                });
              }, 1500);
            }),
          ]);
        } catch (error) {
          elementSource = {
            componentName: null,
            source: null,
            stack: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      return {
        selector: targetSelector,
        tagName: element.tagName.toLowerCase(),
        text: (() => {
          const text = (element.textContent || '').trim().replace(/\s+/g, ' ');
          return text ? text.slice(0, 140) : null;
        })(),
        title: document.title || null,
        pageUrl: window.location.href,
        elementSource,
      };
    }, selector);

    return normalizeSelection(selection);
  } finally {
    await page.close();
  }
}

async function discoverInspectableElements(
  url: string,
  query: string,
  device: InspectDeviceContext | null,
  limit: number,
): Promise<{
  page: { title: string | null; url: string | null };
  candidates: InspectDiscoveryCandidate[];
}> {
  const browser = await getSharedBrowser();
  const page = await browser.newPage();

  try {
    if (device) {
      await page.setViewportSize({ width: device.width, height: device.height });
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(250);
    const normalize = (value: string | null | undefined) => {
      if (!value) {
        return null;
      }

      const normalized = value.trim().replace(/\s+/g, ' ');
      return normalized.length > 0 ? normalized : null;
    };

    const pageMetadata = {
      title: (await page.title()) || null,
      url: page.url() || null,
    };

    const normalizedQuery = query.trim().toLowerCase();
    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const elementHandles = await page.locator('body *').elementHandles();
    const candidates: InspectDiscoveryCandidate[] = [];

    try {
      for (const handle of elementHandles) {
        const snapshot = await handle.evaluate((element: Element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) {
            return null;
          }

          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return null;
          }

          const tagName = element.tagName.toLowerCase();
          const textContent = (element.textContent || '').trim().replace(/\s+/g, ' ');
          const classTokens: string[] = [];

          if (typeof element.className === 'string') {
            const rawTokens = element.className.trim().split(/\s+/);
            for (const token of rawTokens) {
              if (!token) {
                continue;
              }

              if (window.CSS && typeof window.CSS.escape === 'function') {
                classTokens.push(window.CSS.escape(token));
              } else {
                classTokens.push(String(token).replace(/[^a-zA-Z0-9_-]/g, '\\$&'));
              }

              if (classTokens.length === 2) {
                break;
              }
            }
          }

          const escapedId = element.id
            ? ((window.CSS && typeof window.CSS.escape === 'function')
              ? window.CSS.escape(element.id)
              : String(element.id).replace(/[^a-zA-Z0-9_-]/g, '\\$&'))
            : null;

          return {
            selector: escapedId ? `#${escapedId}` : `${tagName}${classTokens.length > 0 ? `.${classTokens.join('.')}` : ''}`,
            tagName,
            text: textContent.length > 0 ? textContent.slice(0, 140) : null,
            role: element.getAttribute('role'),
            id: element.id || null,
            className: typeof element.className === 'string' ? element.className : null,
            ariaLabel: element.getAttribute('aria-label'),
            title: element.getAttribute('title'),
            name: element.getAttribute('name'),
            placeholder: element.getAttribute('placeholder'),
            testId: element.getAttribute('data-testid'),
          };
        });

        await handle.dispose();

        if (!snapshot) {
          continue;
        }

        const candidate: InspectDiscoveryCandidate = {
          selector: snapshot.selector,
          tagName: snapshot.tagName,
          text: normalize(snapshot.text)?.slice(0, 140) ?? null,
          role: normalize(snapshot.role),
          attributes: {
            id: normalize(snapshot.id),
            className: normalize(snapshot.className),
            ariaLabel: normalize(snapshot.ariaLabel),
            title: normalize(snapshot.title),
            name: normalize(snapshot.name),
            placeholder: normalize(snapshot.placeholder),
            testId: normalize(snapshot.testId),
          },
          score: 0,
          reasons: [],
        };

        const haystacks = [
          { label: 'text', value: candidate.text },
          { label: 'aria-label', value: candidate.attributes.ariaLabel },
          { label: 'title', value: candidate.attributes.title },
          { label: 'name', value: candidate.attributes.name },
          { label: 'placeholder', value: candidate.attributes.placeholder },
          { label: 'data-testid', value: candidate.attributes.testId },
          { label: 'id', value: candidate.attributes.id },
          { label: 'class', value: candidate.attributes.className },
          { label: 'role', value: candidate.role },
          { label: 'tag', value: candidate.tagName },
        ];

        for (const haystack of haystacks) {
          if (!haystack.value) {
            continue;
          }

          const normalizedValue = haystack.value.toLowerCase();
          if (normalizedValue === normalizedQuery) {
            candidate.score += haystack.label === 'text' ? 120 : 90;
            candidate.reasons.push(`exact ${haystack.label} match`);
            continue;
          }

          if (normalizedValue.includes(normalizedQuery)) {
            candidate.score += haystack.label === 'text' ? 70 : 45;
            candidate.reasons.push(`${haystack.label} contains query`);
          }

          let matchedTokens = 0;
          for (const token of queryTokens) {
            if (normalizedValue.includes(token)) {
              matchedTokens += 1;
            }
          }

          if (matchedTokens > 0) {
            candidate.score += matchedTokens * (haystack.label === 'text' ? 18 : 10);
            candidate.reasons.push(`${matchedTokens} token match${matchedTokens > 1 ? 'es' : ''} in ${haystack.label}`);
          }
        }

        if (['button', 'a', 'input', 'label', 'section', 'article', 'main', 'nav', 'header', 'footer', 'h1', 'h2', 'h3'].includes(candidate.tagName)) {
          candidate.score += 6;
        }

        if (candidate.role === 'button' || candidate.role === 'link') {
          candidate.score += 8;
        }

        if (
          !candidate.text
          && !candidate.attributes.ariaLabel
          && !candidate.attributes.title
          && !candidate.attributes.name
          && !candidate.attributes.placeholder
          && !candidate.attributes.testId
          && !candidate.attributes.id
          && !candidate.attributes.className
        ) {
          candidate.score = 0;
        }

        if (candidate.score > 0) {
          candidate.reasons = Array.from(new Set(candidate.reasons)).slice(0, 4);
          candidates.push(candidate);
        }
      }
    } finally {
      await Promise.all(elementHandles.map((handle) => handle.dispose().catch(() => undefined)));
    }

    candidates.sort((left, right) => right.score - left.score);

    return {
      page: pageMetadata,
      candidates: candidates.slice(0, Math.max(1, Math.min(limit, 10))),
    };
  } finally {
    await page.close();
  }
}

router.post('/session', (req: Request, res: Response) => {
  const { url } = req.body as { url?: unknown };

  if (typeof url !== 'string' || url.trim().length === 0) {
    return sendError(res, 400, 'url is required');
  }

  if (!isInspectableLocalUrl(url)) {
    return sendError(res, 400, 'Inspect mode only supports local/dev loopback URLs.');
  }

  const session = proxyService.createSession(url);

  return res.json({
    success: true,
    session: {
      id: session.id,
      proxyUrl: `/api/proxy/${session.id}`,
      targetUrl: session.targetUrl,
    },
  });
});

router.get('/element-source.js', (_req: Request, res: Response) => {
  res.type('application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(elementSourceBundle);
});

router.get('/bridge.js', (_req: Request, res: Response) => {
  res.type('application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  res.send(inspectBridgeScript);
});

router.post('/resolve', (req: Request, res: Response) => {
  const { url, sourceDir, selection, device } = req.body as {
    url?: unknown;
    sourceDir?: unknown;
    selection?: unknown;
    device?: unknown;
  };

  if (typeof url !== 'string' || url.trim().length === 0) {
    return sendError(res, 400, 'url is required');
  }

  if (!isInspectableLocalUrl(url)) {
    return sendError(res, 400, 'Inspect mode only supports local/dev loopback URLs.');
  }

  if (sourceDir !== undefined && typeof sourceDir !== 'string') {
    return sendError(res, 400, 'sourceDir must be a string when provided');
  }

  const normalizedSelection = normalizeSelection(selection);
  if (!normalizedSelection) {
    return sendError(res, 400, 'selection payload is invalid');
  }

  const normalizedDevice = device === undefined ? null : normalizeDevice(device);
  if (device !== undefined && !normalizedDevice) {
    return sendError(res, 400, 'device payload is invalid');
  }

  let resolvedSourceDir: string | undefined;
  if (typeof sourceDir === 'string' && sourceDir.trim().length > 0) {
    const result = resolveSourceDirectory(sourceDir);
    if (!result.ok || !result.path) {
      return sendError(res, 400, result.error ?? 'sourceDir is invalid');
    }
    resolvedSourceDir = result.path;
  }

  const result = inspectService.resolve({
    url,
    sourceDir: resolvedSourceDir,
    device: normalizedDevice,
    selection: normalizedSelection,
  });

  return res.json({ success: true, result });
});

router.post('/selector', async (req: Request, res: Response) => {
  const { url, selector, sourceDir, device } = req.body as {
    url?: unknown;
    selector?: unknown;
    sourceDir?: unknown;
    device?: unknown;
  };

  if (typeof url !== 'string' || url.trim().length === 0) {
    return sendError(res, 400, 'url is required');
  }

  if (!isInspectableLocalUrl(url)) {
    return sendError(res, 400, 'Inspect mode only supports local/dev loopback URLs.');
  }

  if (typeof selector !== 'string' || selector.trim().length === 0) {
    return sendError(res, 400, 'selector is required');
  }

  if (sourceDir !== undefined && typeof sourceDir !== 'string') {
    return sendError(res, 400, 'sourceDir must be a string when provided');
  }

  const normalizedDevice = device === undefined ? null : normalizeDevice(device);
  if (device !== undefined && !normalizedDevice) {
    return sendError(res, 400, 'device payload is invalid');
  }

  let resolvedSourceDir: string | undefined;
  if (typeof sourceDir === 'string' && sourceDir.trim().length > 0) {
    const result = resolveSourceDirectory(sourceDir);
    if (!result.ok || !result.path) {
      return sendError(res, 400, result.error ?? 'sourceDir is invalid');
    }
    resolvedSourceDir = result.path;
  }

  try {
    const selection = await inspectSelectionBySelector(url, selector.trim(), normalizedDevice);
    if (!selection) {
      return sendError(res, 404, 'No element matched the provided selector');
    }

    const result = inspectService.resolve({
      url,
      sourceDir: resolvedSourceDir,
      device: normalizedDevice,
      selection,
    });

    return res.json({ success: true, result });
  } catch (error) {
    logServerError(error, {
      requestId: res.locals.requestId as string | undefined,
      path: req.path,
      method: req.method,
    });
    return sendError(res, 500, 'Failed to inspect selector');
  }
});

router.post('/discover', async (req: Request, res: Response) => {
  const { url, query, device, limit } = req.body as {
    url?: unknown;
    query?: unknown;
    device?: unknown;
    limit?: unknown;
  };

  if (typeof url !== 'string' || url.trim().length === 0) {
    return sendError(res, 400, 'url is required');
  }

  if (!isInspectableLocalUrl(url)) {
    return sendError(res, 400, 'Inspect mode only supports local/dev loopback URLs.');
  }

  if (typeof query !== 'string' || query.trim().length === 0) {
    return sendError(res, 400, 'query is required');
  }

  if (limit !== undefined && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 10)) {
    return sendError(res, 400, 'limit must be an integer between 1 and 10');
  }

  const normalizedDevice = device === undefined ? null : normalizeDevice(device);
  if (device !== undefined && !normalizedDevice) {
    return sendError(res, 400, 'device payload is invalid');
  }

  try {
    const discovery = await discoverInspectableElements(url, query.trim(), normalizedDevice, limit ?? 5);

    return res.json({
      success: true,
      page: discovery.page,
      device: normalizedDevice,
      query: query.trim(),
      candidates: discovery.candidates,
    });
  } catch (error) {
    logServerError(error, {
      requestId: res.locals.requestId as string | undefined,
      path: req.path,
      method: req.method,
    });
    return sendError(res, 500, 'Failed to discover inspect candidates');
  }
});

export default router;
