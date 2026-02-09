import type { Browser, Page } from 'playwright-core';
import { getSharedBrowser } from './browser.service.js';

export interface PageInfo {
  url: string;
  path: string;
  title: string;
  links: string[];
  error?: string;
}

export interface CrawlResult {
  startUrl: string;
  pages: PageInfo[];
  sitemapUrls: string[];
}

class CrawlService {
  async crawl(url: string, depth: number = 1): Promise<CrawlResult> {
    const origin = new URL(url).origin;

    // Check sitemap.xml first (free, instant)
    const sitemapUrls = await this.checkSitemap(origin);

    // Crawl with Playwright (handles CSR pages)
    const pages = await this.crawlPages(url, origin, depth);

    return { startUrl: url, pages, sitemapUrls };
  }

  private async checkSitemap(origin: string): Promise<string[]> {
    try {
      const res = await fetch(`${origin}/sitemap.xml`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];

      const xml = await res.text();
      if (!xml.includes('<urlset') && !xml.includes('<sitemapindex')) return [];

      const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
      return urls;
    } catch {
      return [];
    }
  }

  private async crawlPages(startUrl: string, origin: string, depth: number): Promise<PageInfo[]> {
    const browser = await getSharedBrowser();
    const visited = new Set<string>();
    const pages: PageInfo[] = [];

    await this.visitPage(browser, startUrl, origin, depth, visited, pages);

    return pages;
  }

  private async visitPage(
    browser: Browser,
    url: string,
    origin: string,
    depth: number,
    visited: Set<string>,
    pages: PageInfo[]
  ): Promise<void> {
    const normalized = this.normalizeUrl(url);
    if (visited.has(normalized) || depth < 0) return;
    visited.add(normalized);

    let page: Page | null = null;
    try {
      page = await browser.newPage();
      await page.goto(url, { waitUntil: 'load', timeout: 10_000 });

      // Wait briefly for CSR apps to render
      await page.waitForTimeout(1000);

      const title = await page.title();

      // Extract all internal links from the rendered DOM
      const links = await page.evaluate((orig: string) => {
        const anchors = document.querySelectorAll('a[href]');
        const discovered: string[] = [];
        const seen = new Set<string>();

        for (const a of anchors) {
          try {
            const href = (a as HTMLAnchorElement).href;
            const parsed = new URL(href, document.location.href);

            if (parsed.origin !== orig) continue;
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;

            const path = parsed.pathname;
            if (seen.has(path)) continue;
            seen.add(path);

            // Skip asset/API paths
            if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|json)$/i.test(path)) continue;
            if (path.startsWith('/api/') || path.startsWith('/_')) continue;

            discovered.push(path);
          } catch {
            // skip invalid URLs
          }
        }

        return discovered;
      }, origin);

      const parsedUrl = new URL(url);
      pages.push({
        url,
        path: parsedUrl.pathname,
        title: title || parsedUrl.pathname,
        links,
      });

      // Follow links at next depth level (limit to 15 to prevent explosion)
      if (depth > 0) {
        const linksToFollow = links.slice(0, 15);
        for (const link of linksToFollow) {
          await this.visitPage(browser, `${origin}${link}`, origin, depth - 1, visited, pages);
        }
      }
    } catch (error) {
      const parsedUrl = new URL(url);
      pages.push({
        url,
        path: parsedUrl.pathname,
        title: 'Error loading page',
        links: [],
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (page) await page.close();
    }
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname.replace(/\/$/, '') || '/'}`;
    } catch {
      return url;
    }
  }
}

export const crawlService = new CrawlService();
