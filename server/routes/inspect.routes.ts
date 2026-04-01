import { Router } from 'express';
import type { Request, Response } from 'express';
import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
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

    return await page.evaluate(({ search, maxResults }) => {
      const normalizedQuery = search.trim().toLowerCase();
      const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

      const escapeCss = (value: string) => {
        if (window.CSS && typeof window.CSS.escape === 'function') {
          return window.CSS.escape(value);
        }

        return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
      };

      const buildSelector = (element: Element) => {
        if (element.id) {
          return '#' + escapeCss(element.id);
        }

        const parts: string[] = [];
        let current: Element | null = element;

        while (current && current !== document.body) {
          let part = current.tagName.toLowerCase();
          if (current.classList.length > 0) {
            part += '.' + Array.from(current.classList)
              .slice(0, 2)
              .map(escapeCss)
              .join('.');
          }

          const parent: Element | null = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter((child: Element) => child.tagName === current?.tagName);
            if (siblings.length > 1) {
              part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
            }
          }

          parts.unshift(part);

          if (current.id) {
            parts[0] = '#' + escapeCss(current.id);
            break;
          }

          current = parent;
        }

        return parts.join(' > ') || element.tagName.toLowerCase();
      };

      const normalize = (value: string | null | undefined) => {
        if (!value) {
          return null;
        }

        const normalized = value.trim().replace(/\s+/g, ' ');
        return normalized.length > 0 ? normalized : null;
      };

      const isVisible = (element: Element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return false;
        }

        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      };

      const scoreCandidate = (element: Element) => {
        const text = normalize(element.textContent)?.slice(0, 140) ?? null;
        const ariaLabel = normalize(element.getAttribute('aria-label'));
        const title = normalize(element.getAttribute('title'));
        const name = normalize(element.getAttribute('name'));
        const placeholder = normalize(element.getAttribute('placeholder'));
        const testId = normalize(element.getAttribute('data-testid'));
        const id = normalize(element.id);
        const className = normalize(element.className);
        const role = normalize(element.getAttribute('role'));
        const tagName = element.tagName.toLowerCase();

        const haystacks = [
          { label: 'text', value: text },
          { label: 'aria-label', value: ariaLabel },
          { label: 'title', value: title },
          { label: 'name', value: name },
          { label: 'placeholder', value: placeholder },
          { label: 'data-testid', value: testId },
          { label: 'id', value: id },
          { label: 'class', value: className },
          { label: 'role', value: role },
          { label: 'tag', value: tagName },
        ];

        let score = 0;
        const reasons: string[] = [];

        for (const haystack of haystacks) {
          if (!haystack.value) {
            continue;
          }

          const normalizedValue = haystack.value.toLowerCase();
          if (normalizedValue === normalizedQuery) {
            score += haystack.label === 'text' ? 120 : 90;
            reasons.push(`exact ${haystack.label} match`);
            continue;
          }

          if (normalizedValue.includes(normalizedQuery)) {
            score += haystack.label === 'text' ? 70 : 45;
            reasons.push(`${haystack.label} contains query`);
          }

          let matchedTokens = 0;
          for (const token of queryTokens) {
            if (normalizedValue.includes(token)) {
              matchedTokens += 1;
            }
          }

          if (matchedTokens > 0) {
            score += matchedTokens * (haystack.label === 'text' ? 18 : 10);
            reasons.push(`${matchedTokens} token match${matchedTokens > 1 ? 'es' : ''} in ${haystack.label}`);
          }
        }

        if (['button', 'a', 'input', 'label', 'section', 'article', 'main', 'nav', 'header', 'footer', 'h1', 'h2', 'h3'].includes(tagName)) {
          score += 6;
        }

        if (role === 'button' || role === 'link') {
          score += 8;
        }

        if (!text && !ariaLabel && !title && !name && !placeholder && !testId && !id && !className) {
          score = 0;
        }

        return {
          selector: buildSelector(element),
          tagName,
          text,
          role,
          attributes: {
            id,
            className,
            ariaLabel,
            title,
            name,
            placeholder,
            testId,
          },
          score,
          reasons: Array.from(new Set(reasons)).slice(0, 4),
        };
      };

      const candidates = Array.from(document.querySelectorAll('body *'))
        .filter((element) => isVisible(element))
        .map((element) => scoreCandidate(element))
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(1, Math.min(maxResults, 10)));

      return {
        page: {
          title: document.title || null,
          url: window.location.href,
        },
        candidates,
      };
    }, { search: query, maxResults: limit });
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

  const session = proxyService.createSession(url, [], { mode: 'inspect' });

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
    resolvedSourceDir = path.resolve(sourceDir.trim());
    if (!existsSync(resolvedSourceDir)) {
      return sendError(res, 400, 'sourceDir must exist');
    }
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
    resolvedSourceDir = path.resolve(sourceDir.trim());
    if (!existsSync(resolvedSourceDir)) {
      return sendError(res, 400, 'sourceDir must exist');
    }
  }

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

  const discovery = await discoverInspectableElements(url, query.trim(), normalizedDevice, limit ?? 5);

  return res.json({
    success: true,
    page: discovery.page,
    device: normalizedDevice,
    query: query.trim(),
    candidates: discovery.candidates,
  });
});

export default router;