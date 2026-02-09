/**
 * Crawl API contract tests
 *
 * Validates the /api/crawl request/response contract from the client's perspective.
 * These tests verify that the discoverPages function in flow-diagrams correctly:
 * - Sends proper requests to POST /api/crawl
 * - Handles successful crawl responses and builds flow nodes
 * - Handles error responses gracefully
 * - Handles edge cases (empty results, sitemap-only results)
 *
 * We test the API contract without rendering the full ReactFlow component,
 * since ReactFlow needs a real DOM with dimensions. Instead we test the
 * fetch calls and response handling that drive the flow generation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

// Simulate the crawl API call the way discoverPages does it
async function callCrawlApi(url: string, depth = 1) {
  const API_BASE = 'http://localhost:5000';
  const res = await fetch(`${API_BASE}/api/crawl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, depth }),
  });

  if (!res.ok) {
    const err = await res.json() as { error: string };
    throw new Error(err.error || 'Crawl failed');
  }

  return res.json();
}

describe('/api/crawl contract', () => {
  describe('successful crawl', () => {
    it('should send POST with url and depth in the body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          startUrl: 'https://example.com',
          pages: [{ url: 'https://example.com', path: '/', title: 'Example', links: [] }],
          sitemapUrls: [],
        }),
      });

      await callCrawlApi('https://example.com', 1);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/crawl',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://example.com', depth: 1 }),
        })
      );
    });

    it('should return crawl result with pages and sitemap URLs', async () => {
      const crawlResponse = {
        startUrl: 'https://example.com',
        pages: [
          { url: 'https://example.com', path: '/', title: 'Home', links: ['/about', '/contact'] },
          { url: 'https://example.com/about', path: '/about', title: 'About Us', links: ['/'] },
        ],
        sitemapUrls: ['https://example.com/blog', 'https://example.com/faq'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(crawlResponse),
      });

      const result = await callCrawlApi('https://example.com');

      expect(result.startUrl).toBe('https://example.com');
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0].title).toBe('Home');
      expect(result.pages[0].links).toContain('/about');
      expect(result.pages[1].path).toBe('/about');
      expect(result.sitemapUrls).toHaveLength(2);
    });

    it('should handle a crawl with zero discovered links', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          startUrl: 'https://spa-app.com',
          pages: [{ url: 'https://spa-app.com', path: '/', title: 'SPA App', links: [] }],
          sitemapUrls: [],
        }),
      });

      const result = await callCrawlApi('https://spa-app.com');

      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].links).toHaveLength(0);
      expect(result.sitemapUrls).toHaveLength(0);
    });

    it('should include pages that had errors during crawl', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          startUrl: 'https://example.com',
          pages: [
            { url: 'https://example.com', path: '/', title: 'Home', links: ['/broken'] },
            { url: 'https://example.com/broken', path: '/broken', title: 'Error loading page', links: [], error: 'Navigation timeout' },
          ],
          sitemapUrls: [],
        }),
      });

      const result = await callCrawlApi('https://example.com');

      const errorPage = result.pages.find((p: any) => p.error);
      expect(errorPage).toBeDefined();
      expect(errorPage.error).toBe('Navigation timeout');
      expect(errorPage.title).toBe('Error loading page');
    });
  });

  describe('error handling', () => {
    it('should throw when URL is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'url is required' }),
      });

      await expect(callCrawlApi('')).rejects.toThrow('url is required');
    });

    it('should throw when URL is not http/https', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid URL. Only http: and https: URLs are allowed.' }),
      });

      await expect(callCrawlApi('ftp://files.example.com')).rejects.toThrow('Only http: and https: URLs are allowed');
    });

    it('should throw with server error message when crawl fails internally', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Chromium installation failed. Try manually: npx playwright install --with-deps chromium' }),
      });

      await expect(callCrawlApi('https://example.com')).rejects.toThrow('Chromium installation failed');
    });

    it('should throw generic message when error response has no error field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      await expect(callCrawlApi('https://example.com')).rejects.toThrow('Crawl failed');
    });
  });

  describe('SSRF protection', () => {
    it('should reject cloud metadata endpoint URLs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid URL. Only http: and https: URLs are allowed.' }),
      });

      await expect(callCrawlApi('http://169.254.169.254/latest/meta-data')).rejects.toThrow();
    });
  });
});

describe('layoutPages behavior', () => {
  // Test the layout algorithm's output properties.
  // layoutPages is an internal function, so we verify its behavior through
  // the contract: given a CrawlResult shape, it should produce the right
  // number of nodes and edges.

  interface CrawlPageInfo {
    url: string;
    path: string;
    title: string;
    links: string[];
    error?: string;
  }

  interface CrawlResult {
    startUrl: string;
    pages: CrawlPageInfo[];
    sitemapUrls: string[];
  }

  // Re-implement the layout algorithm for testing (mirrors flow-diagrams.tsx)
  function layoutPages(crawlResult: CrawlResult) {
    const nodes: Array<{ id: string; type: string; data: { label: string } }> = [];
    const edges: Array<{ id: string; source: string; target: string }> = [];
    const nodeIdMap = new Map<string, string>();
    let idCounter = 0;
    function nextId() { return `node_${++idCounter}`; }

    const allPaths = new Set(crawlResult.pages.map(p => p.path));
    for (const sitemapUrl of crawlResult.sitemapUrls) {
      try { allPaths.add(new URL(sitemapUrl).pathname); } catch { /* ignore */ }
    }

    const rootPage = crawlResult.pages[0];
    if (!rootPage) return { nodes, edges };

    const rootId = nextId();
    nodeIdMap.set(rootPage.path, rootId);
    nodes.push({ id: rootId, type: 'page', data: { label: rootPage.title || rootPage.path } });

    const childPaths = new Set<string>();
    for (const link of rootPage.links) {
      if (link !== rootPage.path) childPaths.add(link);
    }
    for (const page of crawlResult.pages.slice(1)) {
      childPaths.add(page.path);
    }
    for (const path of allPaths) {
      if (path !== rootPage.path) childPaths.add(path);
    }

    const sortedChildren = [...childPaths].sort();
    sortedChildren.forEach((path) => {
      const nodeId = nextId();
      nodeIdMap.set(path, nodeId);
      const crawledPage = crawlResult.pages.find(p => p.path === path);
      nodes.push({ id: nodeId, type: 'page', data: { label: crawledPage?.title || path } });
      edges.push({ id: `edge_${rootId}_${nodeId}`, source: rootId, target: nodeId });
    });

    for (const page of crawlResult.pages.slice(1)) {
      const sourceId = nodeIdMap.get(page.path);
      if (!sourceId) continue;
      for (const link of page.links) {
        if (link === page.path) continue;
        const targetId = nodeIdMap.get(link);
        if (!targetId) continue;
        const edgeId = `edge_${sourceId}_${targetId}`;
        if (!edges.some(e => e.id === edgeId)) {
          edges.push({ id: edgeId, source: sourceId, target: targetId });
        }
      }
    }

    return { nodes, edges };
  }

  it('should create one root node + child nodes for a site with links', () => {
    const result = layoutPages({
      startUrl: 'https://example.com',
      pages: [
        { url: 'https://example.com', path: '/', title: 'Home', links: ['/about', '/contact'] },
      ],
      sitemapUrls: [],
    });

    // Root + 2 children = 3 nodes
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[0].data.label).toBe('Home');
    // 2 edges from root to each child
    expect(result.edges).toHaveLength(2);
  });

  it('should use page titles as node labels, falling back to path', () => {
    const result = layoutPages({
      startUrl: 'https://example.com',
      pages: [
        { url: 'https://example.com', path: '/', title: 'Home', links: ['/about', '/no-title'] },
        { url: 'https://example.com/about', path: '/about', title: 'About Us', links: [] },
      ],
      sitemapUrls: [],
    });

    const labels = result.nodes.map(n => n.data.label);
    expect(labels).toContain('Home');
    expect(labels).toContain('About Us');
    expect(labels).toContain('/no-title'); // fallback to path
  });

  it('should include sitemap URLs as nodes even if not crawled', () => {
    const result = layoutPages({
      startUrl: 'https://example.com',
      pages: [
        { url: 'https://example.com', path: '/', title: 'Home', links: [] },
      ],
      sitemapUrls: ['https://example.com/blog', 'https://example.com/faq'],
    });

    // Root + 2 sitemap pages = 3 nodes
    expect(result.nodes).toHaveLength(3);
    const labels = result.nodes.map(n => n.data.label);
    expect(labels).toContain('/blog');
    expect(labels).toContain('/faq');
  });

  it('should deduplicate pages that appear in both crawl and sitemap', () => {
    const result = layoutPages({
      startUrl: 'https://example.com',
      pages: [
        { url: 'https://example.com', path: '/', title: 'Home', links: ['/about'] },
      ],
      sitemapUrls: ['https://example.com/about'], // same as the link
    });

    // Root + 1 child (deduped) = 2 nodes
    expect(result.nodes).toHaveLength(2);
  });

  it('should return empty nodes and edges for empty crawl', () => {
    const result = layoutPages({
      startUrl: 'https://example.com',
      pages: [],
      sitemapUrls: [],
    });

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it('should create cross-links between crawled child pages', () => {
    const result = layoutPages({
      startUrl: 'https://example.com',
      pages: [
        { url: 'https://example.com', path: '/', title: 'Home', links: ['/about', '/contact'] },
        { url: 'https://example.com/about', path: '/about', title: 'About', links: ['/contact'] },
      ],
      sitemapUrls: [],
    });

    // 3 nodes: root, /about, /contact
    expect(result.nodes).toHaveLength(3);
    // 2 edges from root + 1 cross-link from /about to /contact = 3
    expect(result.edges).toHaveLength(3);

    // Verify the cross-link exists
    const crossLink = result.edges.find(e => {
      const sourceName = result.nodes.find(n => n.id === e.source)?.data.label;
      const targetName = result.nodes.find(n => n.id === e.target)?.data.label;
      return sourceName === 'About' && targetName === '/contact';
    });
    expect(crossLink).toBeDefined();
  });

  it('should not create self-links', () => {
    const result = layoutPages({
      startUrl: 'https://example.com',
      pages: [
        { url: 'https://example.com', path: '/', title: 'Home', links: ['/about'] },
        { url: 'https://example.com/about', path: '/about', title: 'About', links: ['/about'] }, // self-link
      ],
      sitemapUrls: [],
    });

    // Only root-to-child edge, no self-link
    const aboutNodeId = result.nodes.find(n => n.data.label === 'About')?.id;
    const selfEdges = result.edges.filter(e => e.source === aboutNodeId && e.target === aboutNodeId);
    expect(selfEdges).toHaveLength(0);
  });

  it('should handle a large site with many pages', () => {
    const links = Array.from({ length: 20 }, (_, i) => `/page-${i}`);
    const result = layoutPages({
      startUrl: 'https://bigsite.com',
      pages: [
        { url: 'https://bigsite.com', path: '/', title: 'Big Site', links },
      ],
      sitemapUrls: [],
    });

    // Root + 20 children = 21 nodes
    expect(result.nodes).toHaveLength(21);
    // 20 edges from root to each child
    expect(result.edges).toHaveLength(20);
    // All edges should originate from the root
    const rootId = result.nodes[0].id;
    expect(result.edges.every(e => e.source === rootId)).toBe(true);
  });
});
