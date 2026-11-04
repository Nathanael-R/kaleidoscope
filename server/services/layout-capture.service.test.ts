import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { breakpointScanService } from './breakpoint-scan.service.js';
import { closeSharedBrowser, ensureChromium } from './browser.service.js';
import { layoutCaptureService, normalizeLayoutSourceLocation } from './layout-capture.service.js';

const source = (filePath: string) => ({
  filePath,
  lineNumber: 10,
  columnNumber: 2,
  componentName: 'Card',
});

test('layout source normalization keeps only paths inside sourceDir', () => {
  const sourceDir = join(process.cwd(), 'src');
  assert.deepEqual(normalizeLayoutSourceLocation(source(join(sourceDir, 'Card.tsx')), sourceDir), {
    filePath: 'Card.tsx',
    lineNumber: 10,
    columnNumber: 2,
    componentName: 'Card',
  });
  assert.equal(
    normalizeLayoutSourceLocation(source(join(process.cwd(), 'secrets', 'token.ts')), sourceDir),
    null,
  );
});

test('layout source normalization redacts unscoped absolute paths', () => {
  const result = normalizeLayoutSourceLocation(source(join(process.cwd(), 'src', 'Card.tsx')));
  assert.equal(result?.filePath, 'Card.tsx');
});

function hasChromium() {
  try {
    ensureChromium();
    return true;
  } catch {
    return false;
  }
}

// Runs real Playwright evaluation so tsx-only transforms (such as esbuild's
// keepNames `__name` helper) are exercised the same way `npm run dev` hits them.
test('layout capture and breakpoint scan evaluate in a real browser', { skip: !hasChromium() && 'Chromium not installed' }, async (t) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
      <html><head><title>Capture fixture</title></head>
      <body>
        <main id="app"><h1>Hello layout</h1><button data-testid="cta">Continue</button></main>
      </body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await closeSharedBrowser();
    await new Promise((resolve) => server.close(resolve));
  });
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/`;

  const result = await layoutCaptureService.capture({
    url,
    devices: ['desktop'],
    waitUntil: 'load',
    settleMs: 0,
  });
  const [capture] = result.devices;
  assert.deepEqual(capture.diagnostics.filter((line) => line.startsWith('Capture failed')), []);
  assert.equal(capture.page.title, 'Capture fixture');
  assert.ok(capture.elements.some((element) => element.tagName === 'button'));

  const scan = await breakpointScanService.scan({
    url,
    minWidth: 320,
    maxWidth: 400,
    step: 80,
    height: 600,
    waitUntil: 'load',
    settleMs: 0,
  });
  assert.deepEqual(scan.scannedWidths, [320, 400]);
});
