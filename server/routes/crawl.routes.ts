import { Router } from 'express';
import type { Request, Response } from 'express';
import { crawlService } from '../services/crawl.service.js';

const router = Router();

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (parsed.hostname === '169.254.169.254' || parsed.hostname === 'metadata.google.internal') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/crawl
 * Discover pages from a URL using Playwright.
 *
 * Body: { url: string, depth?: number }
 * Response: { startUrl, pages: [{ url, path, title, links }], sitemapUrls }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { url, depth = 1 } = req.body as { url?: string; depth?: number };

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }

    if (!isAllowedUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL. Only http: and https: URLs are allowed.' });
    }

    // Clamp depth to prevent abuse
    const clampedDepth = Math.max(0, Math.min(depth, 2));

    const result = await crawlService.crawl(url, clampedDepth);
    res.json(result);
  } catch (error) {
    console.error('Crawl error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Crawl failed',
    });
  }
});

export default router;
