import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { screenshotService } from '../services/screenshot.service.js';
import type { ScreenshotRequest } from '../services/screenshot.service.js';
import {
  getScreenshotDevices,
  isValidScreenshotDeviceId,
  SCREENSHOT_DEVICE_IDS,
} from '../services/screenshot.service.js';
import { isAllowedHttpUrl } from '../utils/security.js';
import { sendError } from '../utils/http.js';
import { logServerError } from '../utils/logger.js';
import { resolveBoundedPath } from '../utils/path-policy.js';
import {
  comparePngFiles,
  VisualDiffDimensionError,
} from '../services/visual-diff.service.js';

const router = Router();

const SCREENSHOT_BASE_DIR = path.resolve(process.env.SCREENSHOT_OUTPUT_DIR || './screenshots');
const MAX_DEVICES_PER_REQUEST = 10;

function sanitizeOutputDir(outputDir: string | undefined): string {
  if (!outputDir) return SCREENSHOT_BASE_DIR;
  // Only allow simple directory names, no path traversal
  const dirname = path.basename(outputDir);
  return path.join(SCREENSHOT_BASE_DIR, dirname);
}

function parseUnitInterval(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function parsePercentage(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

function resolveScreenshotFile(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length > 2048) {
    return { ok: false as const, error: `${label} must be a screenshot path.` };
  }

  const result = resolveBoundedPath(value, {
    root: SCREENSHOT_BASE_DIR,
    label,
    mustExist: true,
    mustBeFile: true,
  });
  if (!result.ok || !result.path) {
    return { ok: false as const, error: result.error ?? `${label} is invalid.` };
  }
  if (path.extname(result.path).toLowerCase() !== '.png') {
    return { ok: false as const, error: `${label} must be a PNG file.` };
  }
  return { ok: true as const, path: result.path };
}

router.post('/compare', async (req: Request, res: Response) => {
  const body = req.body as {
    baselinePath?: unknown;
    currentPath?: unknown;
    colorThreshold?: unknown;
    allowedDiffPercentage?: unknown;
    includeAntialiasing?: unknown;
  };
  const baseline = resolveScreenshotFile(body.baselinePath, 'baselinePath');
  if (!baseline.ok) return sendError(res, 400, baseline.error);
  const current = resolveScreenshotFile(body.currentPath, 'currentPath');
  if (!current.ok) return sendError(res, 400, current.error);

  const colorThreshold = parseUnitInterval(body.colorThreshold, 0.1);
  if (colorThreshold === null) {
    return sendError(res, 400, 'colorThreshold must be a number between 0 and 1.');
  }
  const allowedDiffPercentage = parsePercentage(body.allowedDiffPercentage, 0);
  if (allowedDiffPercentage === null) {
    return sendError(res, 400, 'allowedDiffPercentage must be a number between 0 and 100.');
  }
  if (body.includeAntialiasing !== undefined && typeof body.includeAntialiasing !== 'boolean') {
    return sendError(res, 400, 'includeAntialiasing must be a boolean.');
  }

  const diffPath = path.join(SCREENSHOT_BASE_DIR, 'diffs', `diff-${randomUUID()}.png`);
  try {
    const result = await comparePngFiles(baseline.path, current.path, diffPath, {
      colorThreshold,
      includeAntialiasing: body.includeAntialiasing ?? false,
    });
    const relativeDiffPath = path.relative(SCREENSHOT_BASE_DIR, diffPath).split(path.sep).join('/');

    return res.json({
      success: true,
      verdict: result.mismatchPercentage > allowedDiffPercentage ? 'changed' : 'unchanged',
      baselinePath: baseline.path,
      currentPath: current.path,
      diffPath,
      diffUrl: `/api/screenshots-files/${relativeDiffPath}`,
      colorThreshold,
      allowedDiffPercentage,
      includeAntialiasing: body.includeAntialiasing ?? false,
      ...result,
    });
  } catch (error) {
    if (error instanceof VisualDiffDimensionError) {
      return sendError(res, 400, error.message, {
        baselineSize: error.baselineSize,
        currentSize: error.currentSize,
      });
    }
    logServerError(error, {
      requestId: res.locals.requestId as string | undefined,
      path: req.path,
      method: req.method,
    });
    return sendError(res, 500, 'Failed to compare screenshots');
  }
});

/**
 * POST /api/screenshots
 * Capture screenshots of a URL across multiple device viewports
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { url, devices, outputDir, fullPage } = req.body as ScreenshotRequest;

    if (!url || typeof url !== 'string') {
      return sendError(res, 400, 'url is required');
    }

    if (!(await isAllowedHttpUrl(url, { allowLoopback: true }))) {
      return sendError(res, 400, 'Invalid URL. Only http: and https: URLs are allowed.');
    }

    if (!devices || !Array.isArray(devices) || devices.length === 0) {
      return sendError(res, 400, 'devices array is required');
    }

    if (devices.length > MAX_DEVICES_PER_REQUEST) {
      return sendError(res, 400, `Maximum ${MAX_DEVICES_PER_REQUEST} devices per request`);
    }

    const invalidDevices = devices.filter(deviceId => !isValidScreenshotDeviceId(deviceId));
    if (invalidDevices.length > 0) {
      return sendError(res, 400, `Invalid device IDs: ${invalidDevices.join(', ')}`, {
        validDeviceIds: SCREENSHOT_DEVICE_IDS,
      });
    }

    if (
      outputDir !== undefined
      && (typeof outputDir !== 'string' || outputDir.length > 120 || outputDir.includes('\0'))
    ) {
      return sendError(res, 400, 'outputDir must be a safe directory name of 120 characters or fewer');
    }

    const safeOutputDir = sanitizeOutputDir(outputDir);

    const results = await screenshotService.capture({
      url,
      devices,
      outputDir: safeOutputDir,
      fullPage: fullPage ?? false,
    });

    const screenshots = results.map((result) => {
      if (result.path.startsWith('ERROR:')) {
        return { ...result, url: undefined };
      }

      const relativePath = path.relative(SCREENSHOT_BASE_DIR, result.path);
      if (!relativePath || relativePath.startsWith('..')) {
        return { ...result, url: undefined };
      }

      const urlPath = relativePath.split(path.sep).join('/');
      return { ...result, url: `/api/screenshots-files/${urlPath}` };
    });

    res.json({
      success: true,
      screenshots,
      count: screenshots.length,
    });
  } catch (error) {
    logServerError(error, {
      requestId: res.locals.requestId as string | undefined,
      path: req.path,
      method: req.method,
    });
    return sendError(res, 500, 'Failed to capture screenshots');
  }
});

/**
 * GET /api/screenshots/devices
 * List available device viewports for screenshots
 */
router.get('/devices', (_req: Request, res: Response) => {
  const devices = getScreenshotDevices().map(device => ({
    id: device.id,
    name: device.name,
    width: device.width,
    height: device.height,
    type: device.type,
  }));

  res.json({ devices, count: devices.length });
});

export default router;
