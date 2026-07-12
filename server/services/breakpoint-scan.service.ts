import type { BrowserContext } from 'playwright-core';
import { getSharedBrowser } from './browser.service.js';

export type BreakpointIssueType = 'horizontal-overflow' | 'clipped-interactive';

export interface BreakpointIssue {
  type: BreakpointIssueType;
  key: string;
  message: string;
  selector: string | null;
  overflowPx: number | null;
}

export interface BreakpointProbe {
  width: number;
  scrollWidth: number;
  issues: BreakpointIssue[];
}

export interface BreakpointIssueRange {
  type: BreakpointIssueType;
  key: string;
  message: string;
  selector: string | null;
  startWidth: number;
  endWidth: number;
  sampledWidths: number[];
  maxOverflowPx: number | null;
}

export interface BreakpointScanRequest {
  url: string;
  minWidth: number;
  maxWidth: number;
  step: number;
  height: number;
  settleMs: number;
  waitUntil: 'load' | 'domcontentloaded' | 'networkidle';
}

export interface BreakpointScanResult {
  url: string;
  minWidth: number;
  maxWidth: number;
  step: number;
  height: number;
  scannedWidths: number[];
  probes: BreakpointProbe[];
  issueRanges: BreakpointIssueRange[];
  verdict: 'clear' | 'issues-found';
  durationMs: number;
}

type BrowserProbe = {
  scrollWidth: number;
  issues: BreakpointIssue[];
};

function isVisible(style: CSSStyleDeclaration, rect: DOMRect): boolean {
  return rect.width >= 1
    && rect.height >= 1
    && style.display !== 'none'
    && style.visibility !== 'hidden'
    && style.opacity !== '0';
}

export function captureBreakpointProbe(): BrowserProbe {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0);
  const issues: BreakpointIssue[] = [];
  const overflowPx = Math.max(0, Math.round(scrollWidth - viewportWidth));
  const cssEscape = (value: string) => {
    const css = (window as Window & { CSS?: { escape?: (input: string) => string } }).CSS;
    if (css && typeof css.escape === 'function') {
      return css.escape(value);
    }

    return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  };

  if (overflowPx > 2) {
    issues.push({
      type: 'horizontal-overflow',
      key: 'document',
      message: `document is ${overflowPx}px wider than the viewport`,
      selector: null,
      overflowPx,
    });
  }

  const interactive = Array.from(document.querySelectorAll(
    'a[href], button, input, select, textarea, [role="button"], [role="link"]',
  )).slice(0, 200);

  for (const element of interactive) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (!isVisible(style, rect) || rect.bottom <= 0 || rect.top >= viewportHeight) {
      continue;
    }

    const clippedLeft = rect.left < -2;
    const clippedRight = rect.right > viewportWidth + 2;
    if (!clippedLeft && !clippedRight) {
      continue;
    }

    const tagName = element.tagName.toLowerCase();
    const selector = element.getAttribute('data-testid')
      ? `[data-testid="${element.getAttribute('data-testid')!.replace(/"/g, '\\"')}"]`
      : element.id
        ? `#${cssEscape(element.id)}`
        : element.getAttribute('name')
          ? `${tagName}[name="${element.getAttribute('name')!.replace(/"/g, '\\"')}"]`
          : element.getAttribute('aria-label')
            ? `${tagName}[aria-label="${element.getAttribute('aria-label')!.replace(/"/g, '\\"')}"]`
            : (() => {
                let index = 1;
                let sibling = element.previousElementSibling;
                while (sibling) {
                  if (sibling.tagName.toLowerCase() === tagName) {
                    index += 1;
                  }
                  sibling = sibling.previousElementSibling;
                }
                return `${tagName}:nth-of-type(${index})`;
              })();
    const side = clippedLeft && clippedRight ? 'both sides' : clippedLeft ? 'the left side' : 'the right side';

    issues.push({
      type: 'clipped-interactive',
      key: selector,
      message: `${selector} is clipped on ${side} of the viewport`,
      selector,
      overflowPx: null,
    });
  }

  return { scrollWidth, issues };
}

export function buildScanWidths(minWidth: number, maxWidth: number, step: number): number[] {
  const widths: number[] = [];
  for (let width = minWidth; width <= maxWidth; width += step) {
    widths.push(width);
  }

  if (widths[widths.length - 1] !== maxWidth) {
    widths.push(maxWidth);
  }

  return widths;
}

export function groupBreakpointIssues(probes: BreakpointProbe[]): BreakpointIssueRange[] {
  const latestRangeByIssue = new Map<string, BreakpointIssueRange>();
  const ranges: BreakpointIssueRange[] = [];

  for (let probeIndex = 0; probeIndex < probes.length; probeIndex += 1) {
    const probe = probes[probeIndex]!;
    const previousWidth = probes[probeIndex - 1]?.width;
    for (const issue of probe.issues) {
      const groupKey = `${issue.type}:${issue.key}`;
      const existing = latestRangeByIssue.get(groupKey);
      if (existing && existing.endWidth === previousWidth) {
        existing.endWidth = probe.width;
        existing.sampledWidths.push(probe.width);
        existing.maxOverflowPx = Math.max(existing.maxOverflowPx ?? 0, issue.overflowPx ?? 0) || null;
        continue;
      }

      const range: BreakpointIssueRange = {
        type: issue.type,
        key: issue.key,
        message: issue.message,
        selector: issue.selector,
        startWidth: probe.width,
        endWidth: probe.width,
        sampledWidths: [probe.width],
        maxOverflowPx: issue.overflowPx,
      };
      latestRangeByIssue.set(groupKey, range);
      ranges.push(range);
    }
  }

  return ranges.sort((left, right) => (
    left.startWidth - right.startWidth || left.type.localeCompare(right.type) || left.key.localeCompare(right.key)
  ));
}

export class BreakpointScanService {
  async scan(request: BreakpointScanRequest): Promise<BreakpointScanResult> {
    const startedAt = Date.now();
    const browser = await getSharedBrowser();
    const scannedWidths = buildScanWidths(request.minWidth, request.maxWidth, request.step);
    let context: BrowserContext | null = null;

    try {
      context = await browser.newContext({
        viewport: { width: request.minWidth, height: request.height },
        screen: { width: request.minWidth, height: request.height },
      });
      const page = await context.newPage();

      try {
        await page.goto(request.url, { waitUntil: request.waitUntil, timeout: 30_000 });
        const probes: BreakpointProbe[] = [];

        for (const width of scannedWidths) {
          await page.setViewportSize({ width, height: request.height });
          if (request.settleMs > 0) {
            await page.waitForTimeout(request.settleMs);
          }

          const probe = await page.evaluate(captureBreakpointProbe);
          probes.push({ width, ...probe });
        }

        const issueRanges = groupBreakpointIssues(probes);
        return {
          url: request.url,
          minWidth: request.minWidth,
          maxWidth: request.maxWidth,
          step: request.step,
          height: request.height,
          scannedWidths,
          probes,
          issueRanges,
          verdict: issueRanges.length === 0 ? 'clear' : 'issues-found',
          durationMs: Date.now() - startedAt,
        };
      } finally {
        await page.close();
      }
    } finally {
      await context?.close();
    }
  }
}

export const breakpointScanService = new BreakpointScanService();
