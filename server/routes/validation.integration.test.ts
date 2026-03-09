import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import screenshotRoutes from './screenshot.routes.js';
import proxyRoutes from './proxy.routes.js';

let server: Server;
let baseUrl = '';

async function requestJson(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, init);
  const body = await res.json();
  return { status: res.status, body };
}

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.requestId = 'test-request-id';
    next();
  });

  app.use('/api/screenshots', screenshotRoutes);
  app.use('/api/proxy', proxyRoutes);

  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected server address to be an object');
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

test('POST /api/screenshots rejects invalid device IDs with normalized error payload', async () => {
  const { status, body } = await requestJson('/api/screenshots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://example.com',
      devices: ['invalid-device-id'],
    }),
  });

  assert.equal(status, 400);
  assert.equal(typeof body.error, 'string');
  assert.equal(body.requestId, 'test-request-id');
  assert.ok(Array.isArray(body.validDeviceIds));
  assert.ok(body.validDeviceIds.includes('iphone-14'));
});

test('POST /api/proxy/session rejects invalid cookies with normalized error payload', async () => {
  const { status, body } = await requestJson('/api/proxy/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://example.com',
      cookies: [{ name: 'bad;name', value: 'cookie-value' }],
    }),
  });

  assert.equal(status, 400);
  assert.equal(typeof body.error, 'string');
  assert.equal(body.requestId, 'test-request-id');
});
