import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import inspectRoutes from './inspect.routes.js';
import proxyRoutes from './proxy.routes.js';

let apiServer: Server;
let targetServer: Server;
let apiBaseUrl = '';
let targetBaseUrl = '';

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
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      apiServer.close((error) => error ? reject(error) : resolve());
    }),
    new Promise<void>((resolve, reject) => {
      targetServer.close((error) => error ? reject(error) : resolve());
    }),
  ]);
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