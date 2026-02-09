import { chromium, type Browser, type Page } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

function findChromium(): string {
  const homedir = process.env.HOME || '/root';
  const paths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];

  const playwrightDir = join(homedir, '.cache/ms-playwright');
  try {
    const entries = readdirSync(playwrightDir);
    for (const entry of entries) {
      if (entry.startsWith('chromium-')) {
        const candidate = join(playwrightDir, entry, 'chrome-linux/chrome');
        paths.unshift(candidate);
      }
    }
  } catch {
    // ignore
  }

  for (const p of paths) {
    if (existsSync(p)) return p;
  }

  throw new Error('Chromium not found. Install with: npx playwright install chromium');
}

class CrawlService {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    const executablePath = findChromium();
    this.browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    return this.browser;
  }

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
    const browser = await this.getBrowser();
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
    // Normalize URL for dedup
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

            // Only same-origin, non-hash, non-mailto links
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
      // Remove trailing slash, hash, and query for dedup
      return `${parsed.origin}${parsed.pathname.replace(/\/$/, '') || '/'}`;
    } catch {
      return url;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const crawlService = new CrawlService();
