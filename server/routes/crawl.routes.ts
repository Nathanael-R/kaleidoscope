import { Router, type Request, type Response } from 'express';
import { crawlService } from '../services/crawl.service.js';

const router = Router();

// POST /api/crawl — Discover pages from a URL
router.post('/', async (req: Request, res: Response) => {
  try {
    const { url, depth = 1 } = req.body as { url?: string; depth?: number };

    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: 'Invalid URL format' });
      return;
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
