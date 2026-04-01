import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import watcherRoutes from './watcher.routes.js';

let server: Server;
let baseUrl = '';

async function requestJson(routePath: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${routePath}`, init);
  return {
    status: response.status,
    body: await response.json(),
  };
}

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.requestId = 'watcher-test-request';
    next();
  });
  app.use('/api/watcher', watcherRoutes);

  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected watcher test server address');
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

test('POST /api/watcher/start requires an eventClientId', async () => {
  const { status, body } = await requestJson('/api/watcher/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'watcher-test',
      paths: ['src/**/*'],
    }),
  });

  assert.equal(status, 400);
  assert.equal(body.error, 'eventClientId is required');
  assert.equal(body.requestId, 'watcher-test-request');
});

test('POST /api/watcher/start rejects sibling-prefix paths outside the workspace root', async () => {
  const outsideButMatchingPrefix = `${process.cwd()}-sibling${path.sep}src${path.sep}**${path.sep}*`;

  const { status, body } = await requestJson('/api/watcher/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'watcher-test',
      eventClientId: 'watcher-client-123456',
      paths: [outsideButMatchingPrefix],
    }),
  });

  assert.equal(status, 400);
  assert.match(body.error, /outside the allowed directory/);
  assert.equal(body.requestId, 'watcher-test-request');
});