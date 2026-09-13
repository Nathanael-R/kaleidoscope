import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildScreenshotContent, createScreenshotEntry } from './screenshot-artifacts.js';
import { PNG } from 'pngjs';
import { randomBytes } from 'node:crypto';
import { pruneExpiredImages } from '../../shared/artifact-retention.js';

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
        deviceId: 'desktop',
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
      await rm(`${chatSafePath}.kaleidoscope-expiry.json`, { force: true });
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('createScreenshotEntry keeps failed captures out of chat rendering paths', async () => {
  const entry = await createScreenshotEntry(
    {
      deviceId: 'desktop',
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

test('buildScreenshotContent records an explicit device-to-image content mapping', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kaleidoscope-content-test-'));
  try {
    const screenshotPath = path.join(root, 'desktop.png');
    await writeFile(screenshotPath, Buffer.from(TINY_PNG_BASE64, 'base64'));
    const built = await buildScreenshotContent([{
      deviceId: 'desktop', device: 'Desktop HD', path: screenshotPath, fileUri: 'file:///desktop.png', downloadUrl: null,
      width: 1440, height: 900, error: null,
    }]);
    assert.equal(built.inlineImageCount, 1);
    assert.deepEqual(built.inlinePreviews, [{ deviceId: 'desktop', contentIndex: 1, resourceUri: 'file:///desktop.png' }]);
    assert.equal(built.content[built.inlinePreviews[0]?.contentIndex ?? -1]?.type, 'image');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('all ten devices get bounded inline previews even when originals exceed the old byte limit', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kaleidoscope-large-preview-'));
  try {
    const source = new PNG({ width: 900, height: 900 });
    source.data = randomBytes(source.width * source.height * 4);
    const original = PNG.sync.write(source);
    assert.ok(original.byteLength > 1_500_000);
    const imagePath = path.join(root, 'large.png');
    await writeFile(imagePath, original);
    const entries = Array.from({ length: 10 }, (_, index) => ({
      deviceId: `device-${index}`, device: `Device ${index}`, path: imagePath, fileUri: 'file:///large.png', downloadUrl: null,
      width: 900, height: 900, error: null,
    }));
    const built = await buildScreenshotContent(entries, 1);
    assert.equal(built.inlineImageCount, 10);
    assert.deepEqual(built.previewWarnings, []);
    let totalBytes = 0;
    for (const mapping of built.inlinePreviews) {
      const content = built.content[mapping.contentIndex - 1];
      assert.equal(content?.type, 'image');
      if (content?.type !== 'image') throw new Error('Expected image content');
      const buffer = Buffer.from(content.data, 'base64');
      totalBytes += buffer.byteLength;
      assert.ok(PNG.sync.read(buffer).width < 900);
    }
    assert.ok(totalBytes <= 4_500_000);
    assert.deepEqual(await readFile(imagePath), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('unreadable image previews produce an explicit warning', async () => {
  const built = await buildScreenshotContent([{
    deviceId: 'desktop', device: 'Desktop', path: path.join(tmpdir(), 'missing-kaleidoscope-image.png'),
    fileUri: 'file:///missing.png', downloadUrl: null, width: 1, height: 1, error: null,
  }]);
  assert.equal(built.inlineImageCount, 0);
  assert.match(built.previewWarnings[0] ?? '', /Desktop:.*could not be read/);
});

test('chat copies inherit the capture expiry', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kaleidoscope-chat-expiry-'));
  let copy: string | null = null;
  try {
    const source = path.join(root, 'desktop.png');
    await writeFile(source, Buffer.from(TINY_PNG_BASE64, 'base64'));
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const entry = await createScreenshotEntry({ deviceId: 'desktop', device: 'Desktop', path: source, width: 1, height: 1, expiresAt }, 'http://localhost:5000');
    copy = entry.chatSafePath;
    assert.ok(copy);
    assert.equal(entry.expiresAt, expiresAt);
    // Isolate time-travel cleanup from other sessions' chat images.
    const isolatedCopy = path.join(root, 'chat.png');
    await rename(copy, isolatedCopy);
    await rename(`${copy}.kaleidoscope-expiry.json`, `${isolatedCopy}.kaleidoscope-expiry.json`);
    copy = isolatedCopy;
    await pruneExpiredImages(root, Date.parse(expiresAt) + 1);
    await assert.rejects(readFile(copy), { code: 'ENOENT' });
    assert.ok((await readFile(source)).byteLength > 0);
  } finally {
    if (copy) await rm(copy, { force: true });
    await rm(root, { recursive: true, force: true });
  }
});
