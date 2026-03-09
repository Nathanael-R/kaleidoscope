import { Router } from 'express';
import type { Request, Response } from 'express';
import { crawlService } from '../services/crawl.service.js';
import { isAllowedHttpUrl } from '../utils/security.js';
import { sendError } from '../utils/http.js';

const router = Router();

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
      return sendError(res, 400, 'url is required');
    }

    if (!(await isAllowedHttpUrl(url))) {
      return sendError(res, 400, 'Invalid URL. Only http: and https: URLs are allowed.');
    }

    // Clamp depth to prevent abuse
    const clampedDepth = Math.max(0, Math.min(depth, 2));

    let safeProxyUrl: string | undefined;
    if (typeof proxyUrl === 'string' && proxyUrl.trim()) {
      if (!(await isAllowedHttpUrl(proxyUrl))) {
        return sendError(res, 400, 'proxyUrl is invalid');
      }
      safeProxyUrl = proxyUrl;
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
    return sendError(res, 500, error instanceof Error ? error.message : 'Crawl failed');
  }
});

export default router;
