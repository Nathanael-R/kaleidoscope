import { Router } from 'express';
import type { Response } from 'express';
import { breakpointScanService } from '../services/breakpoint-scan.service.js';
import { sendError } from '../utils/http.js';
import { logServerError } from '../utils/logger.js';
import { isAllowedHttpUrl } from '../utils/security.js';

const router = Router();

const DEFAULT_MIN_WIDTH = 320;
const DEFAULT_MAX_WIDTH = 1440;
const DEFAULT_STEP = 16;
const DEFAULT_HEIGHT = 900;
const DEFAULT_SETTLE_MS = 100;
const MAX_SAMPLES = 100;

type BreakpointScanBody = {
  url?: unknown;
  minWidth?: unknown;
  maxWidth?: unknown;
  step?: unknown;
  height?: unknown;
  settleMs?: unknown;
};

function parseIntInRange(
  res: Response,
  value: unknown,
  fallback: number,
  name: string,
  min: number,
  max: number,
): number | null {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    sendError(res, 400, `${name} must be an integer between ${min} and ${max}`);
    return null;
  }

  return value;
}

router.post('/scan', async (req, res) => {
  const body = req.body as BreakpointScanBody;
  if (typeof body.url !== 'string' || body.url.trim().length === 0) {
    return sendError(res, 400, 'url is required');
  }

  const url = body.url.trim();
  if (!(await isAllowedHttpUrl(url, { allowLoopback: true }))) {
    return sendError(res, 400, 'Invalid URL. Only http: and https: URLs are allowed.');
  }

  const minWidth = parseIntInRange(res, body.minWidth, DEFAULT_MIN_WIDTH, 'minWidth', 240, 3840);
  const maxWidth = parseIntInRange(res, body.maxWidth, DEFAULT_MAX_WIDTH, 'maxWidth', 240, 3840);
  const step = parseIntInRange(res, body.step, DEFAULT_STEP, 'step', 8, 256);
  const height = parseIntInRange(res, body.height, DEFAULT_HEIGHT, 'height', 320, 2160);
  const settleMs = parseIntInRange(res, body.settleMs, DEFAULT_SETTLE_MS, 'settleMs', 0, 2000);
  if (minWidth === null || maxWidth === null || step === null || height === null || settleMs === null) {
    return;
  }

  if (minWidth > maxWidth) {
    return sendError(res, 400, 'minWidth must be less than or equal to maxWidth');
  }

  const sampleCount = Math.ceil((maxWidth - minWidth) / step) + 1;
  if (sampleCount > MAX_SAMPLES) {
    return sendError(res, 400, `Requested range would scan more than ${MAX_SAMPLES} widths; increase step or narrow the range.`);
  }

  try {
    const result = await breakpointScanService.scan({
      url,
      minWidth,
      maxWidth,
      step,
      height,
      settleMs,
    });
    return res.json({ success: true, result });
  } catch (error) {
    logServerError(error, {
      requestId: res.locals.requestId as string | undefined,
      path: req.path,
      method: req.method,
    });
    return sendError(res, 500, 'Failed to scan responsive breakpoints');
  }
});

export default router;
