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
  if (process.env.USERPROFILE) homeDirs.add(process.env.USERPROFILE);

  // PLAYWRIGHT_BROWSERS_PATH overrides the default cache location
  const browserPaths: string[] = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    if (process.env.PLAYWRIGHT_BROWSERS_PATH === '0') {
      browserPaths.push(join(process.cwd(), 'node_modules', '.cache', 'ms-playwright'));
    } else {
      browserPaths.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
    }
  }
  for (const home of homeDirs) {
    browserPaths.push(join(home, '.cache', 'ms-playwright'));
    browserPaths.push(join(home, 'Library', 'Caches', 'ms-playwright'));
    browserPaths.push(join(home, 'AppData', 'Local', 'ms-playwright'));
  }
  if (process.env.LOCALAPPDATA) {
    browserPaths.push(join(process.env.LOCALAPPDATA, 'ms-playwright'));
  }

  // Scan each potential Playwright cache for chromium-* directories
  const chromiumBinDirs = ['chrome-linux', 'chrome-linux64', 'chrome-mac', 'chrome-win', 'chrome-win64'];
  for (const dir of browserPaths) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (!entry.startsWith('chromium-')) continue;
        for (const binDir of chromiumBinDirs) {
          const candidate = join(dir, entry, binDir, process.platform === 'win32' ? 'chrome.exe' : 'chrome');
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
  ];

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
    'Chromium installation failed. Try manually: npx playwright install --with-deps chromium'
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
