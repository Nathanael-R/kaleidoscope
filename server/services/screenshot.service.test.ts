import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { screenshotService } from './screenshot.service.js';
import { pruneExpiredImages } from '../../shared/artifact-retention.js';

test('screenshots capture pages with ongoing requests and expire their saved images', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'kaleidoscope-capture-'));
  const target = createServer((req, res) => {
    if (req.url === '/ongoing') return; // Deliberately never reach networkidle.
    res.setHeader('Content-Type', 'text/html');
    res.end('<h1>Ready to capture</h1><script>fetch("/ongoing")</script>');
  });
  await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
  try {
    const address = target.address();
    assert.ok(address && typeof address !== 'string');
    const [result] = await screenshotService.capture({
      url: `http://127.0.0.1:${address.port}`, devices: ['desktop'], outputDir: root, settleMs: 0, retentionMinutes: 1,
    });
    assert.ok(result && !result.path.startsWith('ERROR:'), JSON.stringify(result));
    assert.ok(result.expiresAt);
    assert.ok((await readFile(result.path)).length > 0);
    await pruneExpiredImages(root, Date.parse(result.expiresAt) + 1);
    await assert.rejects(readFile(result.path), { code: 'ENOENT' });
  } finally {
    await screenshotService.close();
    target.closeAllConnections();
    await new Promise<void>((resolve) => target.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
