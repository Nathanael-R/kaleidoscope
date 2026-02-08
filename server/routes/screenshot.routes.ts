import { Router } from 'express';
import type { Request, Response } from 'express';
import { screenshotService } from '../services/screenshot.service.js';
import type { ScreenshotRequest } from '../services/screenshot.service.js';

const router = Router();

/**
 * POST /api/screenshots
 * Capture screenshots of a URL across multiple device viewports
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { url, devices, outputDir, fullPage } = req.body as ScreenshotRequest;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }

    if (!devices || !Array.isArray(devices) || devices.length === 0) {
      return res.status(400).json({ error: 'devices array is required' });
    }

    const results = await screenshotService.capture({
      url,
      devices,
      outputDir: outputDir || './screenshots',
      fullPage: fullPage ?? false,
    });

    res.json({
      success: true,
      screenshots: results,
      count: results.length,
    });
  } catch (error) {
    console.error('Screenshot error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to capture screenshots',
    });
  }
});

/**
 * GET /api/screenshots/devices
 * List available device viewports for screenshots
 */
router.get('/devices', (_req: Request, res: Response) => {
  const devices = [
    { id: 'iphone-14', name: 'iPhone 14', width: 390, height: 844, type: 'mobile' },
    { id: 'samsung-s21', name: 'Samsung Galaxy S21', width: 384, height: 854, type: 'mobile' },
    { id: 'pixel-6', name: 'Google Pixel 6', width: 411, height: 914, type: 'mobile' },
    { id: 'ipad', name: 'iPad', width: 768, height: 1024, type: 'tablet' },
    { id: 'ipad-pro', name: 'iPad Pro', width: 1024, height: 1366, type: 'tablet' },
    { id: 'macbook-air', name: 'MacBook Air', width: 1440, height: 900, type: 'desktop' },
    { id: 'desktop', name: 'Desktop HD', width: 1920, height: 1080, type: 'desktop' },
    { id: 'desktop-4k', name: 'Desktop 4K', width: 3840, height: 2160, type: 'desktop' },
  ];

  res.json({ devices });
});

export default router;
