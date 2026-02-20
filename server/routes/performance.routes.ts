import { Router } from 'express';
import type { Request, Response } from 'express';
import { performanceService } from '../services/performance.service.js';

const router = Router();

const MAX_DEVICES_PER_REQUEST = 10;

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname;
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/performance/audit
 * Run a performance audit across multiple device viewports.
 * Body: { url: string, devices: string[] }
 */
router.post('/audit', async (req: Request, res: Response) => {
  try {
    const { url, devices } = req.body as { url: string; devices: string[] };

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

    const result = await performanceService.audit({ url, devices });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Performance audit error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to run performance audit',
    });
  }
});

export default router;
