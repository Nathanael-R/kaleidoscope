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

export interface CrawlOptions {
  depth?: number;
  maxLinksPerPage?: number;
  includeHash?: boolean;
  includeQuery?: boolean;
  localePrefixBlocklist?: string[];
  proxyUrl?: string;
}

const DEFAULT_MAX_LINKS_PER_PAGE = 15;
const MAX_LINKS_PER_PAGE_LIMIT = 50;
const DEFAULT_LOCALE_PREFIXES = [
  'en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ko', 'ar',
];

class CrawlService {
  async crawl(url: string, options: CrawlOptions = {}): Promise<CrawlResult> {
    const targetOrigin = new URL(url).origin;
    const includeHash = options.includeHash ?? false;
    const includeQuery = options.includeQuery ?? false;
    const maxLinksPerPage = Math.max(
      1,
      Math.min(options.maxLinksPerPage ?? DEFAULT_MAX_LINKS_PER_PAGE, MAX_LINKS_PER_PAGE_LIMIT)
    );
    const localePrefixBlocklist = (options.localePrefixBlocklist ?? DEFAULT_LOCALE_PREFIXES)
      .map(prefix => prefix.toLowerCase());

    const normalizedOptions: Required<CrawlOptions> = {
      depth: options.depth ?? 1,
      maxLinksPerPage,
      includeHash,
      includeQuery,
      localePrefixBlocklist,
      proxyUrl: options.proxyUrl ?? '',
    };

    // Check sitemap.xml first (free, instant)
    const sitemapUrls = await this.checkSitemap(targetOrigin, normalizedOptions);

    // Crawl with Playwright (handles CSR pages)
    const startPath = this.buildPathKey(url, includeQuery, includeHash);
    const pages = await this.crawlPages(url, startPath, targetOrigin, normalizedOptions);

    return { startUrl: url, pages, sitemapUrls };
  }

  private async checkSitemap(origin: string, options: Required<CrawlOptions>): Promise<string[]> {
    try {
      const res = await fetch(`${origin}/sitemap.xml`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];

      const xml = await res.text();
      if (!xml.includes('<urlset') && !xml.includes('<sitemapindex')) return [];

      const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)]
        .map(m => m[1])
        .filter((sitemapUrl) => {
          try {
            const parsed = new URL(sitemapUrl);
            if (parsed.origin !== origin) return false;
            const pathKey = this.buildPathKey(parsed.toString(), options.includeQuery, options.includeHash);
            return !this.isLocalePath(pathKey, options.localePrefixBlocklist);
          } catch {
            return false;
          }
        });
      return urls;
    } catch {
      return [];
    }
  }

  private async crawlPages(
    startUrl: string,
    startPath: string,
    origin: string,
    options: Required<CrawlOptions>
  ): Promise<PageInfo[]> {
    const browser = await getSharedBrowser();
    const visited = new Set<string>();
    const pages: PageInfo[] = [];

    const proxyConfig = this.getProxyConfig(options.proxyUrl);

    await this.visitPage(browser, startPath, origin, options.depth, visited, pages, {
      ...options,
      proxyConfig,
    });

    return pages;
  }

  private async visitPage(
    browser: Browser,
    pathKey: string,
    origin: string,
    depth: number,
    visited: Set<string>,
    pages: PageInfo[],
    options: Required<CrawlOptions> & { proxyConfig: ProxyConfig | null }
  ): Promise<void> {
    const normalized = this.normalizePathKey(pathKey);
    if (visited.has(normalized) || depth < 0) return;
    visited.add(normalized);

    let page: Page | null = null;
    try {
      const navigationUrl = this.buildNavigationUrl(origin, normalized, options.proxyConfig);
      const publicUrl = `${origin}${normalized}`;
      page = await browser.newPage();
      await page.goto(navigationUrl, { waitUntil: 'load', timeout: 10_000 });

      // Wait briefly for CSR apps to render
      await page.waitForTimeout(3000);

      const title = await page.title();

      // Extract all internal links from the rendered DOM
      const links = await page.evaluate((params) => {
        const {
          origin: orig,
          includeQuery,
          includeHash,
          localePrefixes,
          proxyOrigin,
          proxyPathPrefix,
        } = params as {
          origin: string;
          includeQuery: boolean;
          includeHash: boolean;
          localePrefixes: string[];
          proxyOrigin: string;
          proxyPathPrefix: string;
        };

        const anchors = document.querySelectorAll('a[href]');
        const discovered: string[] = [];
        const seen = new Set<string>();

        const isLocalePath = (path: string) => {
          if (!localePrefixes || localePrefixes.length === 0) return false;
          const match = path.match(/^\/([^/]+)(\/|$)/);
          if (!match) return false;
          return localePrefixes.includes(match[1].toLowerCase());
        };

        const stripProxyPrefix = (pathname: string, prefix: string) => {
          if (!prefix) return pathname;
          if (!pathname.startsWith(prefix)) return pathname;
          let stripped = pathname.slice(prefix.length);
          if (!stripped.startsWith('/')) stripped = `/${stripped}`;
          return stripped || '/';
        };

        for (const a of anchors) {
          try {
            const rel = (a.getAttribute('rel') || '').toLowerCase();
            if (rel.split(/\s+/).includes('alternate')) continue;
            if (a.getAttribute('hreflang')) continue;

            const href = (a as HTMLAnchorElement).href;
            const parsed = new URL(href, document.location.href);

            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;

            const isProxyOrigin = proxyOrigin && parsed.origin === proxyOrigin;
            const isProxyLink = isProxyOrigin && proxyPathPrefix
              ? parsed.pathname.startsWith(proxyPathPrefix)
              : false;

            if (!isProxyOrigin && parsed.origin !== orig) continue;

            const path = isProxyOrigin
              ? stripProxyPrefix(parsed.pathname, proxyPathPrefix || '')
              : parsed.pathname;

            if (isLocalePath(path)) continue;

            // Skip asset/API paths
            if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|json)$/i.test(path)) continue;
            if (path.startsWith('/api/') || path.startsWith('/_')) continue;

            let pathKey = path;
            if (includeQuery && parsed.search) pathKey += parsed.search;
            if (includeHash && parsed.hash) pathKey += parsed.hash;

            if (seen.has(pathKey)) continue;
            seen.add(pathKey);
            discovered.push(pathKey);
          } catch {
            // skip invalid URLs
          }
        }

        return discovered;
      }, {
        origin,
        includeQuery: options.includeQuery,
        includeHash: options.includeHash,
        localePrefixes: options.localePrefixBlocklist,
        proxyOrigin: options.proxyConfig?.origin || '',
        proxyPathPrefix: options.proxyConfig?.pathPrefix || '',
      });

      const cappedLinks = links.slice(0, options.maxLinksPerPage);
      const parsedUrl = new URL(publicUrl);
      pages.push({
        url: publicUrl,
        path: normalized,
        title: title || parsedUrl.pathname,
        links: cappedLinks,
      });

      // Follow links at next depth level (capped per request)
      if (depth > 0) {
        for (const link of cappedLinks) {
          await this.visitPage(browser, link, origin, depth - 1, visited, pages, options);
        }
      }
    } catch (error) {
      const publicUrl = `${origin}${normalized}`;
      const parsedUrl = new URL(publicUrl);
      pages.push({
        url: publicUrl,
        path: normalized,
        title: 'Error loading page',
        links: [],
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (page) await page.close();
    }
  }

  private buildPathKey(url: string, includeQuery: boolean, includeHash: boolean): string {
    const parsed = new URL(url);
    let path = parsed.pathname || '/';
    if (!path.startsWith('/')) path = `/${path}`;
    let key = path;
    if (includeQuery && parsed.search) key += parsed.search;
    if (includeHash && parsed.hash) key += parsed.hash;
    return key;
  }

  private normalizePathKey(pathKey: string): string {
    if (!pathKey) return '/';
    if (pathKey.startsWith('/')) return pathKey;
    return `/${pathKey}`;
  }

  private isLocalePath(pathKey: string, localePrefixes: string[]): boolean {
    if (!localePrefixes || localePrefixes.length === 0) return false;
    const match = pathKey.match(/^\/([^/?#]+)(\/|$|\?|#)/);
    if (!match) return false;
    return localePrefixes.includes(match[1].toLowerCase());
  }

  private buildNavigationUrl(origin: string, pathKey: string, proxyConfig: ProxyConfig | null): string {
    const normalized = this.normalizePathKey(pathKey);
    if (!proxyConfig) return `${origin}${normalized}`;
    return `${proxyConfig.baseUrl}${normalized}`;
  }

  private getProxyConfig(proxyUrl: string): ProxyConfig | null {
    if (!proxyUrl) return null;
    try {
      const parsed = new URL(proxyUrl);
      const pathPrefix = parsed.pathname.replace(/\/$/, '');
      const baseUrl = `${parsed.origin}${pathPrefix}`;
      return {
        origin: parsed.origin,
        pathPrefix,
        baseUrl,
      };
    } catch {
      return null;
    }
  }
}

interface ProxyConfig {
  origin: string;
  pathPrefix: string;
  baseUrl: string;
}

export const crawlService = new CrawlService();
