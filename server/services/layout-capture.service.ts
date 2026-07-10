import { createRequire } from 'node:module';
import path from 'node:path';
import type { BrowserContext } from 'playwright-core';
import { getSharedBrowser } from './browser.service.js';
import {
  DEVICE_MAP,
  getDeviceContextOptions,
  type DeviceConfig,
} from './device-catalog.js';
import {
  captureBrowserLayoutSnapshot,
  type BrowserElementSourceResult,
  type BrowserLayoutElementSnapshot,
} from './layout-snapshot-script.js';
import type {
  LayoutCaptureResult,
  LayoutDeviceCapture,
  LayoutDeviceContext,
  LayoutSourceLocation,
} from './layout-types.js';

const require = createRequire(import.meta.url);
const elementSourceEntryPath = require.resolve('element-source');
const elementSourceBundlePath = path.resolve(path.dirname(elementSourceEntryPath), 'index.global.js');

export type {
  LayoutCaptureResult,
  LayoutDeviceCapture,
  LayoutDeviceContext,
  LayoutElementSnapshot,
  LayoutRect,
  LayoutSelectorKind,
  LayoutSelectorStability,
  LayoutSourceLocation,
} from './layout-types.js';

export interface LayoutCaptureRequest {
  url: string;
  devices: string[];
  sourceDir?: string;
  maxElements?: number;
  includeSource?: boolean;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  settleMs?: number;
}

function toDeviceContext(device: DeviceConfig): LayoutDeviceContext {
  return {
    id: device.id,
    name: device.name,
    type: device.type,
    width: device.width,
    height: device.height,
  };
}

function normalizeSourceLocation(value: unknown): LayoutSourceLocation | null {
  if (
    !value
    || typeof value !== 'object'
    || !('filePath' in value)
    || typeof value.filePath !== 'string'
    || value.filePath.trim().length === 0
  ) {
    return null;
  }

  const lineNumber = 'lineNumber' in value ? value.lineNumber : null;
  const columnNumber = 'columnNumber' in value ? value.columnNumber : null;
  const componentName = 'componentName' in value ? value.componentName : null;

  return {
    filePath: value.filePath,
    lineNumber: typeof lineNumber === 'number' ? lineNumber : null,
    columnNumber: typeof columnNumber === 'number' ? columnNumber : null,
    componentName: typeof componentName === 'string' ? componentName : null,
  };
}

function normalizeElementSource(value: BrowserElementSourceResult | null): LayoutSourceLocation | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const directSource = normalizeSourceLocation(value.source);
  if (directSource) {
    return {
      ...directSource,
      componentName: directSource.componentName
        ?? (typeof value.componentName === 'string' ? value.componentName : null),
    };
  }

  if (Array.isArray(value.stack)) {
    for (const frame of value.stack) {
      const source = normalizeSourceLocation(frame);
      if (source) {
        return source;
      }
    }
  }

  return null;
}

function getSourceDiagnostics(elements: BrowserLayoutElementSnapshot[]): string[] {
  const timeoutCount = elements.filter((element) => (
    typeof element.rawSource?.error === 'string'
    && element.rawSource.error.includes('Timed out')
  )).length;

  return timeoutCount > 0
    ? [`Timed out resolving runtime source metadata for ${timeoutCount} element(s).`]
    : [];
}

function normalizeCapturedElements(elements: BrowserLayoutElementSnapshot[]) {
  return elements.map(({ rawSource, ...element }) => ({
    ...element,
    source: normalizeElementSource(rawSource),
  }));
}

export class LayoutCaptureService {
  async capture(request: LayoutCaptureRequest): Promise<LayoutCaptureResult> {
    const startedAt = Date.now();
    const browser = await getSharedBrowser();
    const warnings: string[] = [];
    const captures: LayoutDeviceCapture[] = [];
    const maxElements = Math.max(1, Math.min(request.maxElements ?? 100, 300));
    const includeSource = request.includeSource ?? true;

    for (const deviceId of request.devices) {
      const device = DEVICE_MAP[deviceId];
      if (!device) {
        warnings.push(`Unknown device skipped: ${deviceId}`);
        continue;
      }

      let context: BrowserContext | null = null;

      try {
        context = await browser.newContext(getDeviceContextOptions(device));
        const page = await context.newPage();
        const diagnostics: string[] = [];

        try {
          await page.goto(request.url, {
            waitUntil: request.waitUntil ?? 'networkidle',
            timeout: 30_000,
          });
          await page.waitForTimeout(Math.max(0, Math.min(request.settleMs ?? 250, 2000)));

          if (includeSource) {
            try {
              await page.addScriptTag({ path: elementSourceBundlePath });
            } catch (error) {
              diagnostics.push(
                `element-source injection failed: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }

          const snapshot = await page.evaluate(captureBrowserLayoutSnapshot, {
            maxElements,
            resolveSource: includeSource,
          });
          diagnostics.push(...getSourceDiagnostics(snapshot.elements));

          captures.push({
            device: toDeviceContext(device),
            page: snapshot.page,
            viewport: snapshot.viewport,
            elements: normalizeCapturedElements(snapshot.elements),
            stats: {
              elementCount: snapshot.elementCount,
              capturedCount: snapshot.elements.length,
              truncated: snapshot.truncated,
            },
            diagnostics,
          });
        } finally {
          await page.close();
        }
      } catch (error) {
        captures.push({
          device: toDeviceContext(device),
          page: { title: null, url: null },
          viewport: {
            width: device.width,
            height: device.height,
            scrollWidth: device.width,
            scrollHeight: device.height,
          },
          elements: [],
          stats: {
            elementCount: 0,
            capturedCount: 0,
            truncated: false,
          },
          diagnostics: [
            `Capture failed: ${error instanceof Error ? error.message : String(error)}`,
          ],
        });
      } finally {
        if (context) {
          await context.close();
        }
      }
    }

    return {
      url: request.url,
      sourceDir: request.sourceDir ?? null,
      capturedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      devices: captures,
      warnings,
    };
  }
}

export const layoutCaptureService = new LayoutCaptureService();
