import { Router } from 'express';
import type { Response } from 'express';
import {
  DEVICE_IDS,
  hasDeviceConfig,
} from '../services/device-catalog.js';
import { diffLayoutCaptures } from '../services/layout-diff.service.js';
import { summarizeLayoutDiff } from '../services/layout-summary.service.js';
import {
  layoutCaptureService,
  type LayoutCaptureRequest,
} from '../services/layout-capture.service.js';
import { layoutStoreService } from '../services/layout-store.service.js';
import type { StoredLayoutCapture } from '../services/layout-types.js';
import { sseService, type SSEServiceEvent } from '../services/sse.service.js';
import { sendError } from '../utils/http.js';
import { logServerError } from '../utils/logger.js';
import { resolveSourceDirectory } from '../utils/path-policy.js';
import { isAllowedHttpUrl } from '../utils/security.js';

const router = Router();

const DEFAULT_LAYOUT_DEVICES = ['iphone-14', 'ipad', 'desktop'];
const MAX_DEVICES_PER_CAPTURE = 10;
const MAX_LAYOUT_ELEMENTS = 300;
const MIN_LAYOUT_ELEMENTS = 1;
const LAYOUT_ID_REGEX = /^layout_[0-9a-f-]{36}$/i;
const WATCHER_EVENT_CLIENT_ID_REGEX = /^[A-Za-z0-9._-]{16,128}$/;
const MAX_OBSERVE_TIMEOUT_MS = 60_000;

type ParseResult<T> = { ok: true; value: T } | { ok: false };

type LayoutRequestBody = {
  baselineCaptureId?: unknown;
  eventClientId?: unknown;
  watcherId?: unknown;
  timeoutMs?: unknown;
  url?: unknown;
  devices?: unknown;
  sourceDir?: unknown;
  maxElements?: unknown;
  includeSource?: unknown;
  waitUntil?: unknown;
  settleMs?: unknown;
};

type CaptureDefaults = {
  url?: string;
  devices?: string[];
  sourceDir?: string | null;
};

function invalid(res: Response, status: number, message: string, details?: Record<string, unknown>): ParseResult<never> {
  sendError(res, status, message, details);
  return { ok: false };
}

function normalizeDevices(
  value: unknown,
  fallback: string[] = DEFAULT_LAYOUT_DEVICES,
): { ok: true; devices: string[] } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, devices: fallback };
  }

  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: 'devices must be a non-empty array when provided' };
  }

  if (value.length > MAX_DEVICES_PER_CAPTURE) {
    return { ok: false, error: `Maximum ${MAX_DEVICES_PER_CAPTURE} devices per capture` };
  }

  const devices: string[] = [];
  for (const device of value) {
    if (typeof device !== 'string' || device.trim().length === 0) {
      return { ok: false, error: 'devices must contain only device IDs' };
    }
    devices.push(device.trim());
  }

  const invalidDevices = devices.filter(deviceId => !hasDeviceConfig(deviceId));
  if (invalidDevices.length > 0) {
    return {
      ok: false,
      error: `Invalid device IDs: ${invalidDevices.join(', ')}`,
    };
  }

  return { ok: true, devices };
}

function normalizeMaxElements(value: unknown): { ok: true; maxElements: number } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, maxElements: 100 };
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_LAYOUT_ELEMENTS || value > MAX_LAYOUT_ELEMENTS) {
    return {
      ok: false,
      error: `maxElements must be an integer between ${MIN_LAYOUT_ELEMENTS} and ${MAX_LAYOUT_ELEMENTS}`,
    };
  }

  return { ok: true, maxElements: value };
}

function normalizeWaitUntil(value: unknown): { ok: true; waitUntil: LayoutCaptureRequest['waitUntil'] } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, waitUntil: 'networkidle' };
  }

  if (value === 'load' || value === 'domcontentloaded' || value === 'networkidle') {
    return { ok: true, waitUntil: value };
  }

  return { ok: false, error: 'waitUntil must be one of: load, domcontentloaded, networkidle' };
}

function normalizeSettleMs(value: unknown): { ok: true; settleMs: number | undefined } | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, settleMs: undefined };
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2000) {
    return { ok: false, error: 'settleMs must be an integer between 0 and 2000 when provided' };
  }

  return { ok: true, settleMs: value };
}

function parseBaselineCaptureId(res: Response, value: unknown): ParseResult<string> {
  if (typeof value !== 'string' || !LAYOUT_ID_REGEX.test(value)) {
    return invalid(res, 400, 'baselineCaptureId is required');
  }

  return { ok: true, value };
}

function parseObserveOptions(res: Response, body: LayoutRequestBody): ParseResult<{
  eventClientId?: string;
  watcherId?: string;
  timeoutMs: number;
}> {
  if (body.eventClientId !== undefined && (typeof body.eventClientId !== 'string' || !WATCHER_EVENT_CLIENT_ID_REGEX.test(body.eventClientId))) {
    return invalid(res, 400, 'eventClientId must be a valid watcher event client ID when provided');
  }

  if (body.watcherId !== undefined && (typeof body.watcherId !== 'string' || body.watcherId.trim().length === 0 || body.watcherId.length > 120)) {
    return invalid(res, 400, 'watcherId must be a non-empty string of 120 characters or fewer when provided');
  }

  if (body.timeoutMs !== undefined && (typeof body.timeoutMs !== 'number' || !Number.isInteger(body.timeoutMs) || body.timeoutMs < 1 || body.timeoutMs > MAX_OBSERVE_TIMEOUT_MS)) {
    return invalid(res, 400, `timeoutMs must be an integer between 1 and ${MAX_OBSERVE_TIMEOUT_MS}`);
  }

  return {
    ok: true,
    value: {
      eventClientId: typeof body.eventClientId === 'string' ? body.eventClientId : undefined,
      watcherId: typeof body.watcherId === 'string' ? body.watcherId : undefined,
      timeoutMs: body.timeoutMs ?? 30_000,
    },
  };
}

function resolveSourceDir(
  res: Response,
  sourceDir: unknown,
  fallback?: string | null,
): ParseResult<string | undefined> {
  if (sourceDir === undefined) {
    return { ok: true, value: fallback ?? undefined };
  }

  if (typeof sourceDir !== 'string') {
    return invalid(res, 400, 'sourceDir must be a string when provided');
  }

  if (sourceDir.trim().length === 0) {
    return { ok: true, value: undefined };
  }

  const result = resolveSourceDirectory(sourceDir);
  if (!result.ok || !result.path) {
    return invalid(res, 400, result.error ?? 'sourceDir is invalid');
  }

  return { ok: true, value: result.path };
}

async function parseCaptureRequest(
  res: Response,
  body: LayoutRequestBody,
  defaults: CaptureDefaults = {},
): Promise<ParseResult<LayoutCaptureRequest>> {
  const rawUrl = body.url === undefined ? defaults.url : body.url;
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return invalid(res, 400, defaults.url ? 'url must be a non-empty string when provided' : 'url is required');
  }

  const url = rawUrl.trim();
  if (!(await isAllowedHttpUrl(url, { allowLoopback: true }))) {
    return invalid(res, 400, 'Invalid URL. Only http: and https: URLs are allowed.');
  }

  const normalizedDevices = normalizeDevices(body.devices, defaults.devices ?? DEFAULT_LAYOUT_DEVICES);
  if (!normalizedDevices.ok) {
    return invalid(res, 400, normalizedDevices.error, { validDeviceIds: DEVICE_IDS });
  }

  const normalizedMaxElements = normalizeMaxElements(body.maxElements);
  if (!normalizedMaxElements.ok) {
    return invalid(res, 400, normalizedMaxElements.error);
  }

  const normalizedWaitUntil = normalizeWaitUntil(body.waitUntil);
  if (!normalizedWaitUntil.ok) {
    return invalid(res, 400, normalizedWaitUntil.error);
  }

  if (body.includeSource !== undefined && typeof body.includeSource !== 'boolean') {
    return invalid(res, 400, 'includeSource must be a boolean when provided');
  }

  const normalizedSettleMs = normalizeSettleMs(body.settleMs);
  if (!normalizedSettleMs.ok) {
    return invalid(res, 400, normalizedSettleMs.error);
  }

  const resolvedSourceDir = resolveSourceDir(res, body.sourceDir, defaults.sourceDir);
  if (!resolvedSourceDir.ok) {
    return resolvedSourceDir;
  }

  return {
    ok: true,
    value: {
      url,
      devices: normalizedDevices.devices,
      sourceDir: resolvedSourceDir.value,
      maxElements: normalizedMaxElements.maxElements,
      includeSource: body.includeSource ?? true,
      waitUntil: normalizedWaitUntil.waitUntil,
      settleMs: normalizedSettleMs.settleMs,
    },
  };
}

function toCaptureSummary(capture: StoredLayoutCapture) {
  return {
    id: capture.id,
    url: capture.url,
    sourceDir: capture.sourceDir,
    capturedAt: capture.capturedAt,
    updatedAt: capture.updatedAt,
    devices: capture.devices.map(deviceCapture => ({
      id: deviceCapture.device.id,
      name: deviceCapture.device.name,
      capturedCount: deviceCapture.stats.capturedCount,
      diagnostics: deviceCapture.diagnostics,
    })),
    warnings: capture.warnings,
  };
}

function waitForReloadEvent(options: {
  eventClientId?: string;
  watcherId?: string;
  timeoutMs: number;
}): Promise<SSEServiceEvent> {
  const { eventClientId, watcherId, timeoutMs } = options;

  return new Promise((resolve, reject) => {
    let cleanup: (() => void) | null = null;
    let timeout: NodeJS.Timeout | null = null;

    const arm = () => {
      cleanup = sseService.once('reload', (event) => {
        if (eventClientId && event.clientId !== eventClientId) {
          arm();
          return;
        }

        if (watcherId && getReloadWatcherId(event) !== watcherId) {
          arm();
          return;
        }

        if (timeout) {
          clearTimeout(timeout);
        }
        resolve(event);
      });
    };

    timeout = setTimeout(() => {
      if (cleanup) {
        cleanup();
      }
      reject(new Error('Timed out waiting for a watcher reload event'));
    }, timeoutMs);

    arm();
  });
}

function getReloadWatcherId(event: SSEServiceEvent): string | undefined {
  const { data } = event;
  if (typeof data !== 'object' || data === null || !('watcherId' in data)) {
    return undefined;
  }

  return typeof data.watcherId === 'string' ? data.watcherId : undefined;
}

async function captureAndStore(options: LayoutCaptureRequest): Promise<StoredLayoutCapture> {
  return layoutStoreService.save(await layoutCaptureService.capture(options));
}

async function captureAndCompare(baseline: StoredLayoutCapture, options: LayoutCaptureRequest) {
  const storedAfter = await captureAndStore(options);
  const diff = diffLayoutCaptures(baseline, storedAfter);
  const summary = summarizeLayoutDiff(diff);

  return {
    baselineCaptureId: baseline.id,
    afterCaptureId: storedAfter.id,
    verdict: diff.verdict,
    summary,
    diff,
    capture: storedAfter,
  };
}

router.post('/capture', async (req, res) => {
  const parsed = await parseCaptureRequest(res, req.body as LayoutRequestBody);
  if (!parsed.ok) return;

  try {
    return res.json({
      success: true,
      capture: await captureAndStore(parsed.value),
    });
  } catch (error) {
    logServerError(error, {
      requestId: res.locals.requestId as string | undefined,
      path: req.path,
      method: req.method,
    });
    return sendError(res, 500, 'Failed to capture layout');
  }
});

router.post('/after-edit', async (req, res) => {
  const body = req.body as LayoutRequestBody;
  const baselineId = parseBaselineCaptureId(res, body.baselineCaptureId);
  if (!baselineId.ok) return;

  const baseline = layoutStoreService.get(baselineId.value);
  if (!baseline) {
    return sendError(res, 404, 'Baseline layout capture not found');
  }

  const parsed = await parseCaptureRequest(res, body, {
    url: baseline.url,
    devices: baseline.devices.map(deviceCapture => deviceCapture.device.id),
    sourceDir: baseline.sourceDir,
  });
  if (!parsed.ok) return;

  try {
    return res.json({
      success: true,
      ...(await captureAndCompare(baseline, parsed.value)),
    });
  } catch (error) {
    logServerError(error, {
      requestId: res.locals.requestId as string | undefined,
      path: req.path,
      method: req.method,
    });
    return sendError(res, 500, 'Failed to compare layout after edit');
  }
});

router.post('/observe', async (req, res) => {
  const body = req.body as LayoutRequestBody;
  const baselineId = parseBaselineCaptureId(res, body.baselineCaptureId);
  if (!baselineId.ok) return;

  const observeOptions = parseObserveOptions(res, body);
  if (!observeOptions.ok) return;

  const baseline = layoutStoreService.get(baselineId.value);
  if (!baseline) {
    return sendError(res, 404, 'Baseline layout capture not found');
  }

  const parsed = await parseCaptureRequest(res, body, {
    url: baseline.url,
    devices: baseline.devices.map(deviceCapture => deviceCapture.device.id),
    sourceDir: baseline.sourceDir,
  });
  if (!parsed.ok) return;

  try {
    const reloadEvent = await waitForReloadEvent(observeOptions.value);

    return res.json({
      success: true,
      reload: reloadEvent,
      ...(await captureAndCompare(baseline, parsed.value)),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.message.includes('Timed out');
    if (!timedOut) {
      logServerError(error, {
        requestId: res.locals.requestId as string | undefined,
        path: req.path,
        method: req.method,
      });
    }
    return sendError(
      res,
      timedOut ? 408 : 500,
      timedOut ? error.message : 'Failed to observe layout after reload',
    );
  }
});

router.get('/capture/:id', (req, res) => {
  const { id } = req.params;
  if (!LAYOUT_ID_REGEX.test(id)) {
    return sendError(res, 400, 'Invalid layout capture ID');
  }

  const capture = layoutStoreService.get(id);
  if (!capture) {
    return sendError(res, 404, 'Layout capture not found');
  }

  return res.json({
    success: true,
    capture,
  });
});

router.get('/captures', (_req, res) => {
  const captures = layoutStoreService.list();
  return res.json({
    success: true,
    captures: captures.map(toCaptureSummary),
    count: captures.length,
  });
});

export default router;
