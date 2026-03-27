import { Router } from 'express';
import type { Request, Response } from 'express';
import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { inspectBridgeScript } from '../services/inspect-bridge-script.js';
import {
  inspectService,
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
    elementSource: normalizeElementSource(candidate.elementSource),
  };
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
  const { url, sourceDir, selection } = req.body as {
    url?: unknown;
    sourceDir?: unknown;
    selection?: unknown;
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
    selection: normalizedSelection,
  });

  return res.json({ success: true, result });
});

export default router;