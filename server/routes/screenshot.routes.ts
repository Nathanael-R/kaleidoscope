import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { screenshotService } from '../services/screenshot.service.js';
import type { ScreenshotRequest } from '../services/screenshot.service.js';
import {
  getScreenshotDevices,
  isValidScreenshotDeviceId,
  SCREENSHOT_DEVICE_IDS,
} from '../services/screenshot.service.js';
import { isAllowedHttpUrl } from '../utils/security.js';
import { sendError } from '../utils/http.js';

const router = Router();

const SCREENSHOT_BASE_DIR = path.resolve(process.env.SCREENSHOT_OUTPUT_DIR || './screenshots');
const MAX_DEVICES_PER_REQUEST = 10;

function sanitizeOutputDir(outputDir: string | undefined): string {
  if (!outputDir) return SCREENSHOT_BASE_DIR;
  // Only allow simple directory names, no path traversal
  const dirname = path.basename(outputDir);
  return path.join(SCREENSHOT_BASE_DIR, dirname);
}

/**
 * POST /api/screenshots
 * Capture screenshots of a URL across multiple device viewports
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { url, devices, outputDir, fullPage, includeMockup } = req.body as ScreenshotRequest;

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

    const safeOutputDir = sanitizeOutputDir(outputDir);

    const results = await screenshotService.capture({
      url,
      devices,
      outputDir: safeOutputDir,
      fullPage: fullPage ?? false,
      includeMockup: includeMockup ?? false,
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
    console.error('Screenshot error:', error);
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to capture screenshots',
    );
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
