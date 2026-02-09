import { chromium, type Browser } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

/**
 * Find a usable Chromium executable by scanning all common Playwright
 * browser cache locations. Works regardless of which user installed
 * the browsers or which user is running the server.
 */
function findChromiumPath(): string | null {
  // Allow explicit override via env var
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    const p = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    if (existsSync(p)) return p;
  }

  // Collect all directories to scan for Playwright browser caches
  const homeDirs = new Set<string>();
  homeDirs.add(process.env.HOME || '/root');
  try { homeDirs.add(homedir()); } catch { /* ignore */ }
  homeDirs.add('/root');
  homeDirs.add('/home/user');

  // PLAYWRIGHT_BROWSERS_PATH overrides the default cache location
  const browserPaths = new Set<string>();
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    browserPaths.add(process.env.PLAYWRIGHT_BROWSERS_PATH);
  }
  if (process.env.XDG_CACHE_HOME) {
    browserPaths.add(join(process.env.XDG_CACHE_HOME, 'ms-playwright'));
  }
  if (process.env.LOCALAPPDATA) {
    browserPaths.add(join(process.env.LOCALAPPDATA, 'ms-playwright'));
  }
  if (process.env.USERPROFILE) {
    browserPaths.add(join(process.env.USERPROFILE, 'AppData', 'Local', 'ms-playwright'));
  }
  for (const home of homeDirs) {
    browserPaths.add(join(home, '.cache', 'ms-playwright'));
    browserPaths.add(join(home, 'Library', 'Caches', 'ms-playwright'));
    browserPaths.add(join(home, 'AppData', 'Local', 'ms-playwright'));
  }

  // Scan each potential Playwright cache for chromium-* directories
  const chromiumBinDirs = [
    ['chrome-linux', 'chrome'],
    ['chrome-linux64', 'chrome'],
    ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
    ['chrome-mac-arm64', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
    ['chrome-win', 'chrome.exe'],
    ['chrome-win64', 'chrome.exe'],
  ];
  for (const dir of browserPaths) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (!entry.startsWith('chromium-')) continue;
        for (const binDir of chromiumBinDirs) {
          const candidate = join(dir, entry, ...binDir);
          if (existsSync(candidate)) return candidate;
        }
      }
    } catch {
      // directory doesn't exist or isn't readable
    }
  }

  // Also check system-wide Chromium installs
  const systemCandidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  if (process.env.PROGRAMFILES) {
    systemCandidates.push(join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  // 32-bit Program Files on 64-bit Windows.
  if (process.env['PROGRAMFILES(X86)']) {
    systemCandidates.push(
      join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe')
    );
  }
  if (process.env.LOCALAPPDATA) {
    systemCandidates.push(join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }

  for (const p of systemCandidates) {
    if (existsSync(p)) return p;
  }

  return null;
}

function installChromium(): void {
  console.log('Chromium not found. Installing via Playwright...');
  try {
    execSync('npx playwright install --with-deps chromium', {
      stdio: 'inherit',
      timeout: 120_000,
    });
  } catch {
    execSync('npx playwright install chromium', {
      stdio: 'inherit',
      timeout: 120_000,
    });
  }
}

export function ensureChromium(): string {
  const existing = findChromiumPath();
  if (existing) return existing;

  installChromium();

  const installed = findChromiumPath();
  if (installed) return installed;

  throw new Error(
    'Chromium installation failed. Try manually: npx playwright install --with-deps chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.'
  );
}

let sharedBrowser: Browser | null = null;

export async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowser?.isConnected()) {
    return sharedBrowser;
  }

  const executablePath = ensureChromium();
  sharedBrowser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  return sharedBrowser;
}

export async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}
