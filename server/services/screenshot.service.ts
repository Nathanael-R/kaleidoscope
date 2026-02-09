import { chromium, type Browser, type Page } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

interface DeviceConfig {
  id: string;
  name: string;
  width: number;
  height: number;
}

const DEVICE_MAP: Record<string, DeviceConfig> = {
  'iphone-14': { id: 'iphone-14', name: 'iPhone 14', width: 390, height: 844 },
  'samsung-s21': { id: 'samsung-s21', name: 'Samsung Galaxy S21', width: 384, height: 854 },
  'pixel-6': { id: 'pixel-6', name: 'Google Pixel 6', width: 411, height: 914 },
  'ipad': { id: 'ipad', name: 'iPad', width: 768, height: 1024 },
  'ipad-pro': { id: 'ipad-pro', name: 'iPad Pro', width: 1024, height: 1366 },
  'macbook-air': { id: 'macbook-air', name: 'MacBook Air', width: 1440, height: 900 },
  'desktop': { id: 'desktop', name: 'Desktop HD', width: 1920, height: 1080 },
  'desktop-4k': { id: 'desktop-4k', name: 'Desktop 4K', width: 3840, height: 2160 },
};

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

function findChromiumPath(): string | null {
  const homedir = process.env.HOME || '/root';
  const paths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];

  // Scan the ms-playwright cache dir for any installed chromium version
  const playwrightDir = join(homedir, '.cache/ms-playwright');
  try {
    const entries = readdirSync(playwrightDir);
    for (const entry of entries) {
      if (entry.startsWith('chromium-')) {
        paths.unshift(join(playwrightDir, entry, 'chrome-linux/chrome'));
      }
    }
  } catch {
    // Directory may not exist yet
  }

  for (const p of paths) {
    if (existsSync(p)) return p;
  }

  return null;
}

function installChromium(): void {
  console.log('Chromium not found. Installing via Playwright...');
  try {
    execFileSync('npx', ['playwright', 'install', '--with-deps', 'chromium'], {
      stdio: 'inherit',
      timeout: 120_000,
    });
  } catch {
    // --with-deps may fail without root; retry without system deps
    execFileSync('npx', ['playwright', 'install', 'chromium'], {
      stdio: 'inherit',
      timeout: 120_000,
    });
  }
}

function ensureChromium(): string {
  const existing = findChromiumPath();
  if (existing) return existing;

  installChromium();

  const installed = findChromiumPath();
  if (installed) return installed;

  throw new Error(
    'Chromium installation failed. Try manually: npx playwright install --with-deps chromium'
  );
}

class ScreenshotService {
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    const executablePath = ensureChromium();
    this.browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    return this.browser;
  }

  async capture(request: ScreenshotRequest): Promise<ScreenshotResult[]> {
    const { url, devices, outputDir, fullPage = false } = request;

    // Ensure output directory exists
    const absDir = resolve(outputDir);
    if (!existsSync(absDir)) {
      mkdirSync(absDir, { recursive: true });
    }

    const browser = await this.getBrowser();
    const results: ScreenshotResult[] = [];

    for (const deviceId of devices) {
      const config = DEVICE_MAP[deviceId];
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
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const screenshotService = new ScreenshotService();

// Cleanup is centralized in index.ts
