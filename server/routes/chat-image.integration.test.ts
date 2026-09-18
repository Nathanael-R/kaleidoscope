import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createChatImageRouter } from './chat-image.routes.js';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAbWQAAAAASUVORK5CYII=',
  'base64',
);

test('GET /api/chat-images serves chat-safe copies over HTTP', async () => {
  const chatDir = await mkdtemp(path.join(tmpdir(), 'kaleidoscope-chat-images-'));
  try {
    await mkdir(chatDir, { recursive: true });
    const fileName = `desktop-${randomUUID()}.png`;
    await writeFile(path.join(chatDir, fileName), TINY_PNG);

    const app = express();
    app.use('/api/chat-images', createChatImageRouter([chatDir]));
    const server = app.listen(0, '127.0.0.1');
    const port = await new Promise<number>((resolve, reject) => {
      server.once('listening', () => {
        const address = server.address();
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('Expected a bound TCP address'));
      });
      server.once('error', reject);
    });

    try {
      const ok = await fetch(`http://127.0.0.1:${port}/api/chat-images/${fileName}`);
      assert.equal(ok.status, 200);
      assert.equal(ok.headers.get('content-type'), 'image/png');
      assert.equal(ok.headers.get('cache-control'), 'no-store');
      assert.deepEqual(Buffer.from(await ok.arrayBuffer()), TINY_PNG);

      const missing = await fetch(`http://127.0.0.1:${port}/api/chat-images/missing.png`);
      assert.equal(missing.status, 404);
    } finally {
      server.close();
    }
  } finally {
    await rm(chatDir, { recursive: true, force: true });
  }
});
