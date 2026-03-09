import type { Page } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getSharedBrowser, closeSharedBrowser } from './browser.service.js';
import { DEVICES } from '../../shared/devices.js';

interface DeviceConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  type: 'mobile' | 'tablet' | 'desktop';
}

export const SCREENSHOT_DEVICE_MAP: Record<string, DeviceConfig> = Object.fromEntries(
  DEVICES.map(device => [
    device.id,
    {
      id: device.id,
      name: device.name,
      width: device.width,
      height: device.height,
      type: device.type,
    },
  ])
);

export const SCREENSHOT_DEVICE_IDS = Object.keys(SCREENSHOT_DEVICE_MAP);

export function isValidScreenshotDeviceId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(SCREENSHOT_DEVICE_MAP, id);
}

export function getScreenshotDevices(): DeviceConfig[] {
  return Object.values(SCREENSHOT_DEVICE_MAP);
}

export interface ScreenshotRequest {
  url: string;
  devices: string[];
  outputDir: string;
  fullPage?: boolean;
}

export interface ScreenshotResult {
  device: string;
  path: string;
  width: number;
  height: number;
}

class ScreenshotService {
  async capture(request: ScreenshotRequest): Promise<ScreenshotResult[]> {
    const { url, devices, outputDir, fullPage = false } = request;

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

      let page: Page | null = null;
      try {
        page = await browser.newPage();
        await page.setViewportSize({ width: config.width, height: config.height });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

        // Small delay for final renders
        await page.waitForTimeout(500);

        const timestamp = Date.now();
        const filename = `${config.id}-${timestamp}.png`;
        const filepath = join(absDir, filename);

        await page.screenshot({
          path: filepath,
          fullPage,
        });

        results.push({
          device: config.name,
          path: filepath,
          width: config.width,
          height: config.height,
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
