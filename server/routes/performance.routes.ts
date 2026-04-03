import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { performanceService } from '../services/performance.service.js';
import { isAllowedHttpUrl } from '../utils/security.js';
import { sendError } from '../utils/http.js';
import { logServerError } from '../utils/logger.js';
import { DEVICE_IDS } from '../../shared/devices.js';

const router = Router();

const MAX_DEVICES_PER_REQUEST = 10;

/**
 * POST /api/performance/audit
 * Run a performance audit across multiple device viewports.
 * Body: { url: string, devices: string[], sourceDir?: string }
 */
router.post('/audit', async (req: Request, res: Response) => {
  try {
    const { url, devices, sourceDir } = req.body as {
      url: string;
      devices: string[];
      sourceDir?: string;
    };

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

    const invalidDevices = devices.filter((deviceId) => !DEVICE_IDS.includes(deviceId));
    if (invalidDevices.length > 0) {
      return sendError(res, 400, `Invalid device IDs: ${invalidDevices.join(', ')}`, {
        validDeviceIds: DEVICE_IDS,
      });
    }

    // Validate sourceDir — must be an absolute path that exists, no traversal
    let safeSourceDir: string | undefined;
    if (sourceDir && typeof sourceDir === 'string') {
      const resolved = path.resolve(sourceDir);
      if (existsSync(resolved) && !resolved.includes('..')) {
        safeSourceDir = resolved;
      }
    }

    const result = await performanceService.audit({
      url,
      devices,
      sourceDir: safeSourceDir,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logServerError(error, {
      requestId: res.locals.requestId as string | undefined,
      path: req.path,
      method: req.method,
    });

    return sendError(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to run performance audit',
    );
  }
});

export default router;
