import type { BrowserContext, Page } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { imageExpiresAt, registerImageExpiry } from '../../shared/artifact-retention.js';
import { getSharedBrowser, closeSharedBrowser } from './browser.service.js';
import {
  DEVICE_IDS,
  DEVICE_MAP,
  getDeviceConfigs,
  getDeviceContextOptions,
  hasDeviceConfig,
  type DeviceConfig,
} from './device-catalog.js';

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
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  settleMs?: number;
  retentionMinutes?: number;
}

export interface ScreenshotResult {
  device: string;
  path: string;
  width: number;
  height: number;
  expiresAt: string | null;
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

      let context: BrowserContext | null = null;
      let page: Page | null = null;
      let filepath: string | null = null;
      try {
        context = await browser.newContext(getDeviceContextOptions(config));
        page = await context.newPage();
        await page.goto(url, { waitUntil: request.waitUntil ?? 'domcontentloaded', timeout: 30_000 });

        // Small delay for final renders
        await page.waitForTimeout(request.settleMs ?? 500);

        const filename = `${config.id}-${randomUUID()}.png`;
        filepath = join(absDir, filename);

        await page.screenshot({
          path: filepath,
          fullPage,
        });
        const expiresAt = imageExpiresAt(request.retentionMinutes);
        await registerImageExpiry(filepath, expiresAt);

        results.push({
          device: config.name,
          path: filepath,
          width: config.width,
          height: config.height,
          expiresAt,
        });
      } catch (error) {
        if (filepath) await unlink(filepath).catch(() => {});
        console.error(`Screenshot failed for ${config.name}.`);
        results.push({
          device: config.name,
          path: error instanceof Error && error.name === 'TimeoutError'
            ? 'ERROR: Screenshot timed out. Try wait_until="domcontentloaded" or check that the page is reachable.'
            : 'ERROR: Screenshot capture failed for this device. Check the page URL and server logs.',
          width: config.width,
          height: config.height,
          expiresAt: null,
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
