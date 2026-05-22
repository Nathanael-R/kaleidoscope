import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import inspectRoutes from './inspect.routes.js';
import proxyRoutes from './proxy.routes.js';
import { closeSharedBrowser } from '../services/browser.service.js';

let apiServer: Server;
let targetServer: Server;
let apiBaseUrl = '';
let targetBaseUrl = '';

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected server address to be an object');
  }

  return address.port;
}

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.requestId = 'inspect-integration-test';
    next();
  });

  app.use('/api/inspect', inspectRoutes);
  app.use('/api/proxy', proxyRoutes);

  apiServer = createServer(app);
  const apiPort = await listen(apiServer);
  apiBaseUrl = `http://127.0.0.1:${apiPort}`;

  targetServer = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end([
      '<!doctype html>',
      '<html>',
      '<head><title>Inspect Target</title></head>',
      '<body><div id="root">hello</div><script type="module" src="/src/main.tsx"></script></body>',
      '</html>',
    ].join(''));
  });

  const targetPort = await listen(targetServer);
  targetBaseUrl = `http://127.0.0.1:${targetPort}`;
});

test.after(async () => {
  await Promise.all([closeServer(apiServer), closeServer(targetServer)]);

  await closeSharedBrowser();
});

test('inspect proxy injects the runtime scripts into proxied HTML', async () => {
  const sessionResponse = await fetch(`${apiBaseUrl}/api/inspect/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: targetBaseUrl }),
  });
  const sessionBody = await sessionResponse.json() as {
    session: { proxyUrl: string };
  };

  assert.equal(sessionResponse.status, 200);

  const proxyResponse = await fetch(`${apiBaseUrl}${sessionBody.session.proxyUrl}/`);
  const html = await proxyResponse.text();

  assert.equal(proxyResponse.status, 200);
  assert.match(html, /\/api\/inspect\/element-source\.js/);
  assert.match(html, /\/api\/inspect\/bridge\.js/);
  assert.match(html, new RegExp(`<base href="${targetBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\/">`));
});

test('inspect bridge rebases history mutations onto the proxy origin', async () => {
  const response = await fetch(`${apiBaseUrl}/api/inspect/bridge.js`);
  const script = await response.text();

  assert.equal(response.status, 200);
  assert.match(script, /wrapHistoryMethod\('pushState'\)/);
  assert.match(script, /wrapHistoryMethod\('replaceState'\)/);
  assert.match(script, /new URL\(String\(value\), window\.location\.href\)/);
});

test('inspect resolve returns device metadata and source context', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'inspect-route-'));
  const sourceDir = join(tempDir, 'src');
  const filePath = join(sourceDir, 'App.tsx');

  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(filePath, [
    'export function App() {',
    '  const ready = true;',
    '  return <button id="save">Save</button>;',
    '}',
  ].join('\n'));

  const previousWorkspaceRoot = process.env.KALEIDOSCOPE_WORKSPACE_ROOT;
  process.env.KALEIDOSCOPE_WORKSPACE_ROOT = tempDir;

  try {
    const response = await fetch(`${apiBaseUrl}/api/inspect/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetBaseUrl,
        sourceDir: tempDir,
        device: {
          id: 'iphone-16',
          name: 'iPhone 16',
          type: 'mobile',
          width: 393,
          height: 852,
        },
        selection: {
          selector: '#save',
          tagName: 'button',
          text: 'Save',
          title: 'Inspect Target',
          pageUrl: `${targetBaseUrl}/checkout`,
          elementSource: {
            componentName: 'SaveButton',
            source: {
              filePath: 'src/App.tsx',
              lineNumber: 3,
              columnNumber: 10,
              componentName: 'SaveButton',
            },
            stack: [],
          },
        },
      }),
    });

    const body = await response.json() as {
      success: boolean;
      result: {
        page: { title: string | null; url: string | null };
        device: { id: string; name: string } | null;
        source: { context: { startLine: number; snippet: string } | null } | null;
      };
    };

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.result.page.title, 'Inspect Target');
    assert.equal(body.result.page.url, `${targetBaseUrl}/checkout`);
    assert.equal(body.result.device?.id, 'iphone-16');
    assert.equal(body.result.device?.name, 'iPhone 16');
    assert.equal(body.result.source?.context?.startLine, 1);
    assert.match(body.result.source?.context?.snippet ?? '', /return <button id="save">Save<\/button>;/);
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.KALEIDOSCOPE_WORKSPACE_ROOT;
    } else {
      process.env.KALEIDOSCOPE_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('inspect selector resolves an element directly from the page using a CSS selector', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'inspect-selector-'));
  const sourceDir = join(tempDir, 'src');
  const filePath = join(sourceDir, 'App.tsx');

  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(filePath, [
    'export function App() {',
    '  return <div id="root">hello</div>;',
    '}',
  ].join('\n'));

  const previousWorkspaceRoot = process.env.KALEIDOSCOPE_WORKSPACE_ROOT;
  process.env.KALEIDOSCOPE_WORKSPACE_ROOT = tempDir;

  try {
    const response = await fetch(`${apiBaseUrl}/api/inspect/selector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetBaseUrl,
        selector: '#root',
        sourceDir,
        device: {
          id: 'desktop',
          name: 'Desktop HD',
          type: 'desktop',
          width: 1920,
          height: 1080,
        },
      }),
    });

    const body = await response.json() as {
      success: boolean;
      result: {
        selector: string | null;
        page: { title: string | null };
        device: { id: string } | null;
        source: { context: { snippet: string } | null } | null;
      };
    };

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.result.selector, '#root');
    assert.equal(body.result.page.title, 'Inspect Target');
    assert.equal(body.result.device?.id, 'desktop');
    assert.match(body.result.source?.context?.snippet ?? '', /<div id="root">hello<\/div>/);
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.KALEIDOSCOPE_WORKSPACE_ROOT;
    } else {
      process.env.KALEIDOSCOPE_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('inspect discover returns high-confidence candidates for a natural-language query', async () => {
  await closeServer(targetServer);
  targetServer = createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end([
      '<!doctype html>',
      '<html>',
      '<head><title>Checkout</title></head>',
      '<body>',
      '  <main>',
      '    <section class="hero">Welcome</section>',
      '    <button id="save">Save changes</button>',
      '  </main>',
      '</body>',
      '</html>',
    ].join(''));
  });

  const targetPort = await listen(targetServer);
  targetBaseUrl = `http://127.0.0.1:${targetPort}`;

  const response = await fetch(`${apiBaseUrl}/api/inspect/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: targetBaseUrl,
      query: 'save button',
      device: {
        id: 'iphone-16',
        name: 'iPhone 16',
        type: 'mobile',
        width: 393,
        height: 852,
      },
      limit: 3,
    }),
  });

  const body = await response.json() as {
    success: boolean;
    query: string;
    page: { title: string | null; url: string | null };
    device: { id: string } | null;
    candidates: Array<{
      selector: string;
      tagName: string;
      text: string | null;
      score: number;
      reasons: string[];
    }>;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.query, 'save button');
  assert.equal(body.page.title, 'Checkout');
  assert.equal(body.device?.id, 'iphone-16');
  assert.ok(body.candidates.length > 0);
  assert.equal(body.candidates[0]?.selector, '#save');
  assert.equal(body.candidates[0]?.tagName, 'button');
  assert.match(body.candidates[0]?.text ?? '', /Save changes/);
  assert.ok((body.candidates[0]?.score ?? 0) > 0);
});
