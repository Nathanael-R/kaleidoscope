import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeExecutable(filePath: string) {
  writeFileSync(filePath, '');
  chmodSync(filePath, 0o755);
}

function getPlaywrightLayout() {
  if (process.platform === 'win32') {
    return { binDir: 'chrome-win', executable: 'chrome.exe' };
  }
  if (process.platform === 'darwin') {
    return { binDir: 'chrome-mac', executable: 'chrome' };
  }
  return { binDir: 'chrome-linux64', executable: 'chrome' };
}

test('findChromium honors PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH override when it exists', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'chromium-override-'));
  const executablePath = join(tempDir, process.platform === 'win32' ? 'chrome.exe' : 'chrome');
  const previousExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

  makeExecutable(executablePath);
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = executablePath;

  try {
    const { findChromium } = await import('./find-chromium.js');
    assert.equal(findChromium(), executablePath);
  } finally {
    if (previousExecutable) {
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = previousExecutable;
    } else {
      delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('findChromium discovers a browser inside PLAYWRIGHT_BROWSERS_PATH', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'playwright-cache-'));
  const { binDir, executable } = getPlaywrightLayout();
  const browserDir = join(tempDir, 'chromium-1208', binDir);
  const executablePath = join(browserDir, executable);
  const previousBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const previousExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

  mkdirSync(browserDir, { recursive: true });
  makeExecutable(executablePath);
  process.env.PLAYWRIGHT_BROWSERS_PATH = tempDir;
  delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

  try {
    const { findChromium } = await import('./find-chromium.js');
    assert.equal(findChromium(), executablePath);
  } finally {
    if (previousBrowsersPath) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = previousBrowsersPath;
    } else {
      delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    }

    if (previousExecutable) {
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = previousExecutable;
    } else {
      delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    }

    rmSync(tempDir, { recursive: true, force: true });
  }
});