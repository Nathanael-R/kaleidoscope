import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createScreenshotEntry } from './screenshot-artifacts.js';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAbWQAAAAASUVORK5CYII=';

test('createScreenshotEntry prefers a chat-safe copy while preserving original-path fallbacks', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kaleidoscope-artifact-test-'));
  let chatSafePath: string | null = null;

  try {
    const screenshotDir = path.join(root, 'folder with spaces');
    const screenshotPath = path.join(screenshotDir, 'desktop test.png');
    await mkdir(screenshotDir, { recursive: true });
    await writeFile(screenshotPath, Buffer.from(TINY_PNG_BASE64, 'base64'));

    const entry = await createScreenshotEntry(
      {
        device: 'Desktop HD',
        path: screenshotPath,
        width: 1920,
        height: 1080,
        url: '/api/screenshots-files/folder with spaces/desktop test.png',
      },
      'http://127.0.0.1:49152',
    );
    chatSafePath = entry.chatSafePath;

    assert.equal(entry.path, screenshotPath);
    assert.equal(entry.preferredDisplayPath, screenshotPath);
    assert.match(entry.fileUri ?? '', /^file:/);
    assert.ok(chatSafePath, 'a screenshot path with spaces should get a chat-safe copy');
    assert.equal(existsSync(chatSafePath), true);
    assert.doesNotMatch(path.basename(chatSafePath), /\s/);
    assert.equal((await readFile(chatSafePath)).toString('base64'), TINY_PNG_BASE64);
    assert.equal(entry.markdownImageTag, entry.chatSafeMarkdownImageTag);
    assert.equal(entry.chatDisplayPath, chatSafePath.replace(/\\/g, '/'));
    assert.ok(
      entry.markdownImageTagFallbacks.some((tag) => tag.includes(screenshotPath.replace(/\\/g, '/'))),
      'fallbacks should keep a Markdown tag for the original local file',
    );
    assert.ok(
      entry.markdownImageTagFallbacks.some((tag) => tag.includes('desktop%20test.png')),
      'fallbacks should include an encoded Markdown form for renderers that reject raw spaces',
    );
    assert.equal(
      entry.downloadUrl,
      'http://127.0.0.1:49152/api/screenshots-files/folder%20with%20spaces/desktop%20test.png',
    );
  } finally {
    if (chatSafePath) {
      await rm(chatSafePath, { force: true });
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('createScreenshotEntry keeps failed captures out of chat rendering paths', async () => {
  const entry = await createScreenshotEntry(
    {
      device: 'Desktop HD',
      path: 'ERROR: browser timed out',
      width: 1920,
      height: 1080,
    },
    'http://127.0.0.1:49152',
  );

  assert.equal(entry.error, 'ERROR: browser timed out');
  assert.equal(entry.fileUri, null);
  assert.equal(entry.preferredDisplayPath, null);
  assert.equal(entry.markdownImageTag, null);
  assert.deepEqual(entry.markdownImageTagFallbacks, []);
  assert.equal(entry.chatSafePath, null);
  assert.equal(entry.chatSafeMarkdownImageTag, null);
});
