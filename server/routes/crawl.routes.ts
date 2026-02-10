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
 * Body: { url: string, depth?: number, maxLinksPerPage?: number, includeHash?: boolean, includeQuery?: boolean, localePrefixBlocklist?: string[], proxyUrl?: string }
 * Response: { startUrl, pages: [{ url, path, title, links }], sitemapUrls }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      url,
      depth = 1,
      maxLinksPerPage,
      includeHash,
      includeQuery,
      localePrefixBlocklist,
      proxyUrl,
    } = req.body as {
      url?: string;
      depth?: number;
      maxLinksPerPage?: number;
      includeHash?: boolean;
      includeQuery?: boolean;
      localePrefixBlocklist?: string[];
      proxyUrl?: string;
    };

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'url is required' });
    }

    if (!isAllowedUrl(url)) {
      return res.status(400).json({ error: 'Invalid URL. Only http: and https: URLs are allowed.' });
    }

    // Clamp depth to prevent abuse
    const clampedDepth = Math.max(0, Math.min(depth, 2));

    let safeProxyUrl: string | undefined;
    if (typeof proxyUrl === 'string' && proxyUrl.trim()) {
      try {
        const parsed = new URL(proxyUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return res.status(400).json({ error: 'proxyUrl must be http or https' });
        }
        safeProxyUrl = parsed.toString();
      } catch {
        return res.status(400).json({ error: 'proxyUrl is invalid' });
      }
    }

    const result = await crawlService.crawl(url, {
      depth: clampedDepth,
      maxLinksPerPage: typeof maxLinksPerPage === 'number' ? maxLinksPerPage : undefined,
      includeHash: Boolean(includeHash),
      includeQuery: Boolean(includeQuery),
      localePrefixBlocklist: Array.isArray(localePrefixBlocklist) ? localePrefixBlocklist : undefined,
      proxyUrl: safeProxyUrl,
    });
    res.json(result);
  } catch (error) {
    console.error('Crawl error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Crawl failed',
    });
  }
});

export default router;
