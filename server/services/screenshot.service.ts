import type { BrowserContext, Page } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getSharedBrowser, closeSharedBrowser } from './browser.service.js';
import {
  DEVICE_IDS,
  DEVICE_MAP,
  getDeviceConfigs,
  getDeviceContextOptions,
  hasDeviceConfig,
  type DeviceConfig,
} from './device-catalog.js';
import { renderMockupScreenshot } from './screenshot-mockup.js';

export const SCREENSHOT_DEVICE_MAP = DEVICE_MAP;

export const SCREENSHOT_DEVICE_IDS = DEVICE_IDS;

export function isValidScreenshotDeviceId(id: string): boolean {
  return hasDeviceConfig(id);
}

export function getScreenshotDevices(): DeviceConfig[] {
  return getDeviceConfigs();
}

export interface ScreenshotRequest {
  url: string;
  devices: string[];
  outputDir: string;
  fullPage?: boolean;
  includeMockup?: boolean;
}

export interface ScreenshotResult {
  device: string;
  path: string;
  width: number;
  height: number;
}

class ScreenshotService {
  async capture(request: ScreenshotRequest): Promise<ScreenshotResult[]> {
    const { url, devices, outputDir, fullPage = false, includeMockup = false } = request;

    // Ensure output directory exists
    const absDir = resolve(outputDir);
    if (!existsSync(absDir)) {
      mkdirSync(absDir, { recursive: true });
    }

    const browser = await getSharedBrowser();
    const results: ScreenshotResult[] = [];

    for (const deviceId of devices) {
      const config = SCREENSHOT_DEVICE_MAP[deviceId];
      if (!config) {
        console.warn(`Unknown device: ${deviceId}, skipping`);
        continue;
      }

      let context: BrowserContext | null = null;
      let page: Page | null = null;
      try {
        context = await browser.newContext(getDeviceContextOptions(config));
        page = await context.newPage();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

        // Small delay for final renders
        await page.waitForTimeout(500);

        const timestamp = Date.now();
        const filename = `${config.id}-${timestamp}${includeMockup ? '-mockup' : ''}.png`;
        const filepath = join(absDir, filename);

        let width = config.width;
        let height = config.height;

        if (includeMockup) {
          const screenshotBuffer = await page.screenshot({
            fullPage: false,
            type: 'png',
          });

          const mockupSize = await renderMockupScreenshot(browser, config, screenshotBuffer, filepath);
          width = mockupSize.width;
          height = mockupSize.height;
        } else {
          await page.screenshot({
            path: filepath,
            fullPage,
          });
        }

        results.push({
          device: config.name,
          path: filepath,
          width,
          height,
        });
      } catch (error) {
        console.error(`Screenshot failed for ${config.name}:`, error);
        results.push({
          device: config.name,
          path: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
          width: config.width,
          height: config.height,
        });
      } finally {
        if (page) await page.close();
        if (context) await context.close();
      }
    }

    return results;
  }

  async close(): Promise<void> {
    await closeSharedBrowser();
  }
}

export const screenshotService = new ScreenshotService();

// Cleanup is centralized in index.ts
