import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { screenshotService } from '../services/screenshot.service.js';
import type { ScreenshotRequest } from '../services/screenshot.service.js';

const router = Router();

const SCREENSHOT_BASE_DIR = path.resolve(process.env.SCREENSHOT_OUTPUT_DIR || './screenshots');
const MAX_DEVICES_PER_REQUEST = 10;

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    // Block cloud metadata endpoints and private IPs
    const hostname = parsed.hostname;
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

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
    const { url, devices, outputDir, fullPage } = req.body as ScreenshotRequest;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }

    if (!isAllowedUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL. Only http: and https: URLs are allowed.' });
    }

    if (!devices || !Array.isArray(devices) || devices.length === 0) {
      return res.status(400).json({ error: 'devices array is required' });
    }

    if (devices.length > MAX_DEVICES_PER_REQUEST) {
      return res.status(400).json({ error: `Maximum ${MAX_DEVICES_PER_REQUEST} devices per request` });
    }

    const safeOutputDir = sanitizeOutputDir(outputDir);

    const results = await screenshotService.capture({
      url,
      devices,
      outputDir: safeOutputDir,
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
