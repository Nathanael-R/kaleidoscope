import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Finds a usable Chromium executable by scanning all common Playwright
 * browser cache locations. Works regardless of which user installed
 * the browsers or which user is running the server.
 */
export function findChromium(): string {
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
  const browserPaths: string[] = [];
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    browserPaths.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
  }
  for (const home of homeDirs) {
    browserPaths.push(join(home, '.cache/ms-playwright'));
  }

  // Scan each potential Playwright cache for chromium-* directories
  const candidates: string[] = [];
  const chromiumBins = ['chrome-linux', 'chrome-linux64'];
  for (const dir of browserPaths) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith('chromium-')) {
          for (const binDir of chromiumBins) {
            candidates.push(join(dir, entry, binDir, 'chrome'));
          }
        }
      }
    } catch {
      // directory doesn't exist or isn't readable
    }
  }

  // Also check system-wide Chromium installs
  candidates.push(
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  );

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    'Chromium not found. Install Playwright browsers with: npx playwright install chromium'
  );
}
