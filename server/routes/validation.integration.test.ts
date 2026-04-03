import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import screenshotRoutes from './screenshot.routes.js';
import proxyRoutes from './proxy.routes.js';
import performanceRoutes from './performance.routes.js';
import inspectRoutes from './inspect.routes.js';

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
  app.use('/api/performance', performanceRoutes);
  app.use('/api/inspect', inspectRoutes);

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

test('POST /api/screenshots accepts localhost URLs before device validation', async () => {
  const { status, body } = await requestJson('/api/screenshots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'http://localhost:3000',
      devices: ['invalid-device-id'],
    }),
  });

  assert.equal(status, 400);
  assert.match(body.error, /Invalid device IDs/);
  assert.equal(body.requestId, 'test-request-id');
});

test('POST /api/screenshots accepts loopback proxy URLs before device validation', async () => {
  const { status, body } = await requestJson('/api/screenshots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'http://127.0.0.1:5000/api/proxy/sess123/',
      devices: ['invalid-device-id'],
    }),
  });

  assert.equal(status, 400);
  assert.match(body.error, /Invalid device IDs/);
  assert.equal(body.requestId, 'test-request-id');
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

test('POST /api/proxy/session rejects invalid auth headers with normalized error payload', async () => {
  const { status, body } = await requestJson('/api/proxy/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://example.com',
      headers: [{ name: 'Cookie', value: 'session=abc' }],
    }),
  });

  assert.equal(status, 400);
  assert.equal(typeof body.error, 'string');
  assert.equal(body.requestId, 'test-request-id');
});

test('POST /api/performance/audit rejects invalid URLs with normalized error payload', async () => {
  const { status, body } = await requestJson('/api/performance/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'file:///etc/passwd',
      devices: ['iphone-14'],
    }),
  });

  assert.equal(status, 400);
  assert.equal(typeof body.error, 'string');
  assert.equal(body.requestId, 'test-request-id');
});

test('POST /api/performance/audit rejects invalid device IDs with normalized error payload', async () => {
  const { status, body } = await requestJson('/api/performance/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://example.com',
      devices: ['not-a-real-device'],
    }),
  });

  assert.equal(status, 400);
  assert.equal(typeof body.error, 'string');
  assert.equal(body.requestId, 'test-request-id');
  assert.ok(Array.isArray(body.validDeviceIds));
  assert.ok(body.validDeviceIds.includes('iphone-14'));
});

test('POST /api/performance/audit allows loopback URLs and continues validation', async () => {
  const { status, body } = await requestJson('/api/performance/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'http://localhost:5173',
      devices: ['not-a-real-device'],
    }),
  });

  assert.equal(status, 400);
  assert.equal(typeof body.error, 'string');
  assert.match(body.error, /Invalid device IDs:/);
  assert.equal(body.requestId, 'test-request-id');
  assert.ok(Array.isArray(body.validDeviceIds));
  assert.ok(body.validDeviceIds.includes('iphone-14'));
});

test('POST /api/inspect/session rejects public URLs with normalized error payload', async () => {
  const { status, body } = await requestJson('/api/inspect/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://example.com',
    }),
  });

  assert.equal(status, 400);
  assert.equal(body.error, 'Inspect mode only supports local/dev loopback URLs.');
  assert.equal(body.requestId, 'test-request-id');
});
