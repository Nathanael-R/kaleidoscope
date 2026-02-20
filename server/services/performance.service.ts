import type { Page } from 'playwright-core';
import { getSharedBrowser } from './browser.service.js';

interface DeviceConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  type: 'mobile' | 'tablet' | 'desktop';
}

const DEVICE_MAP: Record<string, DeviceConfig> = {
  'iphone-14': { id: 'iphone-14', name: 'iPhone 14', width: 390, height: 844, type: 'mobile' },
  'samsung-s21': { id: 'samsung-s21', name: 'Samsung Galaxy S21', width: 384, height: 854, type: 'mobile' },
  'pixel-6': { id: 'pixel-6', name: 'Google Pixel 6', width: 411, height: 914, type: 'mobile' },
  'ipad': { id: 'ipad', name: 'iPad', width: 768, height: 1024, type: 'tablet' },
  'ipad-pro': { id: 'ipad-pro', name: 'iPad Pro', width: 1024, height: 1366, type: 'tablet' },
  'macbook-air': { id: 'macbook-air', name: 'MacBook Air', width: 1440, height: 900, type: 'desktop' },
  'desktop': { id: 'desktop', name: 'Desktop HD', width: 1920, height: 1080, type: 'desktop' },
  'desktop-4k': { id: 'desktop-4k', name: 'Desktop 4K', width: 3840, height: 2160, type: 'desktop' },
};

export interface WebVitals {
  /** First Contentful Paint (ms) */
  fcp: number | null;
  /** Largest Contentful Paint (ms) */
  lcp: number | null;
  /** Cumulative Layout Shift */
  cls: number | null;
  /** Time to First Byte (ms) */
  ttfb: number | null;
  /** DOM Content Loaded (ms) */
  domContentLoaded: number | null;
  /** Full page load (ms) */
  loadTime: number | null;
  /** Total page weight in bytes */
  totalBytes: number;
  /** Number of requests */
  requestCount: number;
}

export interface PerformanceIssue {
  /** e.g. 'lcp', 'cls', 'render-blocking', 'image-size', 'dom-size' */
  type: string;
  /** Severity: 'critical' | 'warning' | 'info' */
  severity: 'critical' | 'warning' | 'info';
  /** Human-readable description */
  message: string;
  /** CSS selector or resource URL that should be fixed */
  element?: string;
  /** Measured value that triggered this issue */
  value?: string;
  /** What the target should be */
  target?: string;
}

export interface DevicePerformanceResult {
  device: DeviceConfig;
  vitals: WebVitals;
  issues: PerformanceIssue[];
  /** Overall score 0–100 (Lighthouse-style weighted) */
  score: number;
}

export interface PerformanceAuditRequest {
  url: string;
  devices: string[];
}

export interface PerformanceAuditResult {
  url: string;
  timestamp: string;
  results: DevicePerformanceResult[];
}

/**
 * Collect Web Vitals and resource data from a loaded page via the Performance API.
 * This function runs inside the browser context via page.evaluate().
 */
async function collectMetricsFromPage(page: Page): Promise<{
  vitals: WebVitals;
  lcpElement: string | null;
  imagesWithoutDimensions: string[];
  oversizedImages: { selector: string; naturalWidth: number; displayWidth: number }[];
  renderBlockingResources: string[];
  domNodeCount: number;
  resources: { url: string; type: string; size: number; duration: number }[];
}> {
  return page.evaluate(() => {
    return new Promise((resolve) => {
      // Give LCP observer time to fire — LCP finalizes on interaction or visibilitychange.
      // We'll trigger a visibilitychange-like signal by waiting, then reading entries.
      const timeout = setTimeout(() => collect(), 3000);

      function collect() {
        clearTimeout(timeout);

        // Navigation timing
        const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
        const nav = navEntries[0] || null;

        const ttfb = nav ? nav.responseStart - nav.startTime : null;
        const domContentLoaded = nav ? nav.domContentLoadedEventEnd - nav.startTime : null;
        const loadTime = nav ? nav.loadEventEnd - nav.startTime : null;

        // FCP
        const paintEntries = performance.getEntriesByType('paint');
        const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');
        const fcp = fcpEntry ? fcpEntry.startTime : null;

        // LCP — read from PerformanceObserver buffered entries
        let lcp: number | null = null;
        let lcpElement: string | null = null;
        try {
          const lcpEntries = (performance as any).getEntriesByType?.('largest-contentful-paint');
          if (lcpEntries && lcpEntries.length > 0) {
            const last = lcpEntries[lcpEntries.length - 1];
            lcp = last.startTime;
            if (last.element) {
              lcpElement = cssSelector(last.element);
            }
          }
        } catch {
          // LCP via getEntriesByType not available in all browsers
        }

        // CLS — sum of layout shift entries
        let cls: number | null = null;
        try {
          const layoutShiftEntries = (performance as any).getEntriesByType?.('layout-shift');
          if (layoutShiftEntries && layoutShiftEntries.length > 0) {
            cls = 0;
            for (const entry of layoutShiftEntries) {
              if (!(entry as any).hadRecentInput) {
                cls += (entry as any).value;
              }
            }
          }
        } catch {
          // not available
        }

        // Resource timing
        const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        let totalBytes = 0;
        const resources: { url: string; type: string; size: number; duration: number }[] = [];
        for (const r of resourceEntries) {
          const size = r.transferSize || r.encodedBodySize || 0;
          totalBytes += size;
          resources.push({
            url: r.name,
            type: r.initiatorType,
            size,
            duration: r.duration,
          });
        }

        // DOM analysis: images without explicit dimensions
        const imagesWithoutDimensions: string[] = [];
        const oversizedImages: { selector: string; naturalWidth: number; displayWidth: number }[] = [];
        const imgs = document.querySelectorAll('img');
        imgs.forEach((img) => {
          const sel = cssSelector(img);
          if (!img.getAttribute('width') && !img.getAttribute('height') &&
              !img.style.width && !img.style.height) {
            imagesWithoutDimensions.push(sel);
          }
          if (img.naturalWidth > 0 && img.clientWidth > 0 && img.naturalWidth > img.clientWidth * 2) {
            oversizedImages.push({
              selector: sel,
              naturalWidth: img.naturalWidth,
              displayWidth: img.clientWidth,
            });
          }
        });

        // Render-blocking resources
        const renderBlockingResources: string[] = [];
        document.querySelectorAll('link[rel="stylesheet"], script:not([async]):not([defer])').forEach((el) => {
          if (el.tagName === 'LINK') {
            const href = (el as HTMLLinkElement).href;
            if (href && !href.includes('data:')) renderBlockingResources.push(href);
          } else if (el.tagName === 'SCRIPT') {
            const src = (el as HTMLScriptElement).src;
            if (src && el.parentElement?.tagName === 'HEAD') renderBlockingResources.push(src);
          }
        });

        const domNodeCount = document.querySelectorAll('*').length;

        resolve({
          vitals: {
            fcp: fcp ? Math.round(fcp) : null,
            lcp: lcp ? Math.round(lcp) : null,
            cls: cls !== null ? Math.round(cls * 1000) / 1000 : null,
            ttfb: ttfb ? Math.round(ttfb) : null,
            domContentLoaded: domContentLoaded ? Math.round(domContentLoaded) : null,
            loadTime: loadTime !== null && loadTime > 0 ? Math.round(loadTime) : null,
            totalBytes,
            requestCount: resourceEntries.length,
          },
          lcpElement,
          imagesWithoutDimensions,
          oversizedImages,
          renderBlockingResources,
          domNodeCount,
          resources,
        });
      }

      /**
       * Build a human-readable CSS selector for a given element.
       */
      function cssSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        const tag = el.tagName.toLowerCase();
        const classes = Array.from(el.classList).slice(0, 2).join('.');
        const parent = el.parentElement;
        let prefix = '';
        if (parent && parent !== document.documentElement && parent !== document.body) {
          const parentTag = parent.tagName.toLowerCase();
          prefix = parent.id ? `#${parent.id} > ` : `${parentTag} > `;
        }
        return `${prefix}${tag}${classes ? '.' + classes : ''}`;
      }
    });
  });
}

/** Thresholds based on Google's Core Web Vitals recommendations. */
const THRESHOLDS = {
  fcp: { good: 1800, poor: 3000 },
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  ttfb: { good: 800, poor: 1800 },
};

function analyzeIssues(
  vitals: WebVitals,
  lcpElement: string | null,
  imagesWithoutDimensions: string[],
  oversizedImages: { selector: string; naturalWidth: number; displayWidth: number }[],
  renderBlockingResources: string[],
  domNodeCount: number,
  resources: { url: string; type: string; size: number; duration: number }[],
  device: DeviceConfig,
): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];

  // LCP
  if (vitals.lcp !== null) {
    if (vitals.lcp > THRESHOLDS.lcp.poor) {
      issues.push({
        type: 'lcp',
        severity: 'critical',
        message: `Largest Contentful Paint is ${vitals.lcp}ms — users see a blank page for too long.${lcpElement ? ` The LCP element is \`${lcpElement}\`. Consider lazy-loading below-fold images or preloading this resource.` : ''}`,
        element: lcpElement || undefined,
        value: `${vitals.lcp}ms`,
        target: `< ${THRESHOLDS.lcp.good}ms`,
      });
    } else if (vitals.lcp > THRESHOLDS.lcp.good) {
      issues.push({
        type: 'lcp',
        severity: 'warning',
        message: `LCP is ${vitals.lcp}ms — needs improvement.${lcpElement ? ` LCP element: \`${lcpElement}\`.` : ''}`,
        element: lcpElement || undefined,
        value: `${vitals.lcp}ms`,
        target: `< ${THRESHOLDS.lcp.good}ms`,
      });
    }
  }

  // FCP
  if (vitals.fcp !== null && vitals.fcp > THRESHOLDS.fcp.poor) {
    issues.push({
      type: 'fcp',
      severity: 'critical',
      message: `First Contentful Paint is ${vitals.fcp}ms. Reduce render-blocking resources or inline critical CSS.`,
      value: `${vitals.fcp}ms`,
      target: `< ${THRESHOLDS.fcp.good}ms`,
    });
  } else if (vitals.fcp !== null && vitals.fcp > THRESHOLDS.fcp.good) {
    issues.push({
      type: 'fcp',
      severity: 'warning',
      message: `FCP is ${vitals.fcp}ms — needs improvement. Consider inlining critical CSS or deferring non-essential scripts.`,
      value: `${vitals.fcp}ms`,
      target: `< ${THRESHOLDS.fcp.good}ms`,
    });
  }

  // CLS
  if (vitals.cls !== null && vitals.cls > THRESHOLDS.cls.poor) {
    issues.push({
      type: 'cls',
      severity: 'critical',
      message: `Cumulative Layout Shift is ${vitals.cls} — the page visibly jumps during load.`,
      value: String(vitals.cls),
      target: `< ${THRESHOLDS.cls.good}`,
    });
  } else if (vitals.cls !== null && vitals.cls > THRESHOLDS.cls.good) {
    issues.push({
      type: 'cls',
      severity: 'warning',
      message: `CLS is ${vitals.cls} — some layout shifting detected.`,
      value: String(vitals.cls),
      target: `< ${THRESHOLDS.cls.good}`,
    });
  }

  // TTFB
  if (vitals.ttfb !== null && vitals.ttfb > THRESHOLDS.ttfb.poor) {
    issues.push({
      type: 'ttfb',
      severity: 'critical',
      message: `Time to First Byte is ${vitals.ttfb}ms — the server is slow to respond. Consider caching, CDN, or optimizing backend logic.`,
      value: `${vitals.ttfb}ms`,
      target: `< ${THRESHOLDS.ttfb.good}ms`,
    });
  } else if (vitals.ttfb !== null && vitals.ttfb > THRESHOLDS.ttfb.good) {
    issues.push({
      type: 'ttfb',
      severity: 'warning',
      message: `TTFB is ${vitals.ttfb}ms — server response could be faster.`,
      value: `${vitals.ttfb}ms`,
      target: `< ${THRESHOLDS.ttfb.good}ms`,
    });
  }

  // Images without dimensions → CLS
  for (const sel of imagesWithoutDimensions.slice(0, 5)) {
    issues.push({
      type: 'cls',
      severity: 'warning',
      message: `Image \`${sel}\` has no explicit width/height — causes layout shift as it loads. Add width and height attributes.`,
      element: sel,
    });
  }

  // Oversized images for viewport
  for (const img of oversizedImages.slice(0, 5)) {
    const ratio = Math.round(img.naturalWidth / img.displayWidth);
    issues.push({
      type: 'image-size',
      severity: 'warning',
      message: `Image \`${img.selector}\` is ${ratio}x larger than displayed (${img.naturalWidth}px natural vs ${img.displayWidth}px rendered on ${device.name}). Serve a ${device.type === 'mobile' ? 'mobile-optimized' : 'viewport-appropriate'} size or use srcset.`,
      element: img.selector,
      value: `${img.naturalWidth}px natural → ${img.displayWidth}px displayed`,
    });
  }

  // Render-blocking resources
  for (const url of renderBlockingResources.slice(0, 5)) {
    const filename = url.split('/').pop()?.split('?')[0] || url;
    issues.push({
      type: 'render-blocking',
      severity: 'warning',
      message: `\`${filename}\` is render-blocking. Consider async/defer for scripts or media queries for stylesheets.`,
      element: url,
    });
  }

  // DOM size
  if (domNodeCount > 1500) {
    issues.push({
      type: 'dom-size',
      severity: domNodeCount > 3000 ? 'critical' : 'warning',
      message: `DOM has ${domNodeCount} nodes (target: < 1,500). Large DOMs increase memory usage and slow style recalculations.`,
      value: `${domNodeCount} nodes`,
      target: '< 1,500 nodes',
    });
  }

  // Large resources (> 250KB)
  const largeResources = resources
    .filter(r => r.size > 250_000)
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);
  for (const r of largeResources) {
    const sizeKB = Math.round(r.size / 1024);
    const filename = r.url.split('/').pop()?.split('?')[0] || r.url;
    issues.push({
      type: 'large-resource',
      severity: sizeKB > 500 ? 'critical' : 'warning',
      message: `\`${filename}\` is ${sizeKB}KB. ${r.type === 'img' ? 'Compress or convert to WebP/AVIF.' : r.type === 'script' ? 'Consider code-splitting or tree-shaking.' : 'Consider compression or splitting.'}`,
      element: r.url,
      value: `${sizeKB}KB`,
    });
  }

  // Total page weight
  if (vitals.totalBytes > 3_000_000) {
    const totalMB = (vitals.totalBytes / (1024 * 1024)).toFixed(1);
    issues.push({
      type: 'total-weight',
      severity: vitals.totalBytes > 5_000_000 ? 'critical' : 'warning',
      message: `Total page weight is ${totalMB}MB across ${vitals.requestCount} requests. Target < 3MB for mobile.`,
      value: `${totalMB}MB`,
      target: '< 3MB',
    });
  }

  return issues;
}

/**
 * Calculate a Lighthouse-style performance score (0-100).
 * Weights: LCP 25%, FCP 10%, CLS 25%, TTFB 10%, Load 10%, Page weight 10%, DOM 10%.
 */
function calculateScore(vitals: WebVitals, domNodeCount: number): number {
  let score = 100;
  const deductions: number[] = [];

  // LCP (25 points)
  if (vitals.lcp !== null) {
    if (vitals.lcp > THRESHOLDS.lcp.poor) deductions.push(25);
    else if (vitals.lcp > THRESHOLDS.lcp.good) deductions.push(15);
    else deductions.push(0);
  }

  // FCP (10 points)
  if (vitals.fcp !== null) {
    if (vitals.fcp > THRESHOLDS.fcp.poor) deductions.push(10);
    else if (vitals.fcp > THRESHOLDS.fcp.good) deductions.push(5);
    else deductions.push(0);
  }

  // CLS (25 points)
  if (vitals.cls !== null) {
    if (vitals.cls > THRESHOLDS.cls.poor) deductions.push(25);
    else if (vitals.cls > THRESHOLDS.cls.good) deductions.push(15);
    else deductions.push(0);
  }

  // TTFB (10 points)
  if (vitals.ttfb !== null) {
    if (vitals.ttfb > THRESHOLDS.ttfb.poor) deductions.push(10);
    else if (vitals.ttfb > THRESHOLDS.ttfb.good) deductions.push(5);
    else deductions.push(0);
  }

  // Load time (10 points)
  if (vitals.loadTime !== null) {
    if (vitals.loadTime > 6000) deductions.push(10);
    else if (vitals.loadTime > 3000) deductions.push(5);
    else deductions.push(0);
  }

  // Total page weight (10 points)
  if (vitals.totalBytes > 5_000_000) deductions.push(10);
  else if (vitals.totalBytes > 3_000_000) deductions.push(5);
  else deductions.push(0);

  // DOM size (10 points)
  if (domNodeCount > 3000) deductions.push(10);
  else if (domNodeCount > 1500) deductions.push(5);
  else deductions.push(0);

  for (const d of deductions) score -= d;
  return Math.max(0, Math.min(100, score));
}

class PerformanceService {
  async audit(request: PerformanceAuditRequest): Promise<PerformanceAuditResult> {
    const { url, devices } = request;
    const browser = await getSharedBrowser();
    const results: DevicePerformanceResult[] = [];

    for (const deviceId of devices) {
      const config = DEVICE_MAP[deviceId];
      if (!config) {
        console.warn(`Unknown device: ${deviceId}, skipping performance audit`);
        continue;
      }

      let page: Page | null = null;
      try {
        page = await browser.newPage();
        await page.setViewportSize({ width: config.width, height: config.height });

        // Navigate with networkidle to ensure all resources are loaded
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

        // Wait a bit for late-firing metrics (LCP, CLS)
        await page.waitForTimeout(1000);

        const metrics = await collectMetricsFromPage(page);
        const issues = analyzeIssues(
          metrics.vitals,
          metrics.lcpElement,
          metrics.imagesWithoutDimensions,
          metrics.oversizedImages,
          metrics.renderBlockingResources,
          metrics.domNodeCount,
          metrics.resources,
          config,
        );
        const score = calculateScore(metrics.vitals, metrics.domNodeCount);

        results.push({ device: config, vitals: metrics.vitals, issues, score });
      } catch (error) {
        console.error(`Performance audit failed for ${config.name}:`, error);
        results.push({
          device: config,
          vitals: {
            fcp: null, lcp: null, cls: null, ttfb: null,
            domContentLoaded: null, loadTime: null,
            totalBytes: 0, requestCount: 0,
          },
          issues: [{
            type: 'error',
            severity: 'critical',
            message: `Audit failed: ${error instanceof Error ? error.message : String(error)}`,
          }],
          score: 0,
        });
      } finally {
        if (page) await page.close();
      }
    }

    return {
      url,
      timestamp: new Date().toISOString(),
      results,
    };
  }
}

export const performanceService = new PerformanceService();
