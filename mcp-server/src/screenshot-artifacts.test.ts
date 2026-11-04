import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { buildScreenshotContent, createScreenshotEntry, decodePngTopRows, fitPngForInline } from './screenshot-artifacts.js';

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

// Random pixels defeat PNG compression, standing in for busy full-page captures.
function noisyPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let index = 0; index < png.data.length; index += 1) {
    png.data[index] = (index % 4 === 3) ? 255 : Math.floor(Math.random() * 256);
  }
  return PNG.sync.write(png);
}

test('fitPngForInline keeps small images and downscales oversized ones under the byte limit', () => {
  const small = Buffer.from(TINY_PNG_BASE64, 'base64');
  assert.deepEqual(fitPngForInline(small, 1_000_000), { data: small, width: 1, height: 1, downscaled: false, cropped: false });

  const large = noisyPng(600, 1200);
  // 600x1200 stays within the 2:1 crop limit, so only scaling applies.
  const preview = fitPngForInline(large, 300_000);
  assert.ok(preview, 'oversized image should get a preview');
  assert.equal(preview.downscaled, true);
  assert.ok(preview.data.byteLength <= 300_000);
  assert.ok(Math.abs(preview.width / preview.height - 600 / 1200) < 0.02, 'aspect ratio should be preserved');
  assert.equal(PNG.sync.read(preview.data).width, preview.width);
});

test('fitPngForInline crops very tall full-page captures to a legible top preview', () => {
  const tall = PNG.sync.write(new PNG({ width: 1440, height: 9000 }));
  const preview = fitPngForInline(tall, 1_000_000);
  assert.ok(preview);
  assert.equal(preview.cropped, true);
  assert.equal(preview.width, 1000);
  assert.equal(preview.height, 2000);
});

test('buildScreenshotContent inlines every device and flags downscaled previews', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'kaleidoscope-inline-'));
  try {
    const screenshots = await Promise.all(Array.from({ length: 6 }, async (_, index) => {
      const filePath = path.join(tempDir, `device-${index}.png`);
      await writeFile(filePath, index === 0 ? noisyPng(800, 900) : Buffer.from(TINY_PNG_BASE64, 'base64'));
      return {
        device: `device-${index}`,
        path: filePath,
        fileUri: pathToFileURL(filePath).toString(),
        downloadUrl: null,
        width: 1,
        height: 1,
        error: null,
      };
    }));

    const { content, inlineImageCount, downscaledImageCount } = await buildScreenshotContent(screenshots);
    assert.equal(inlineImageCount, 6);
    assert.equal(downscaledImageCount, 1);
    assert.ok(content.some((block) => block.type === 'text' && /device-0 inline preview downscaled/.test(block.text)));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('decodePngTopRows matches a full pngjs decode for every PNG filter type', () => {
  const image = new PNG({ width: 37, height: 120 });
  for (let index = 0; index < image.data.length; index += 1) {
    image.data[index] = (index * 7919) & 0xff;
  }

  for (const filterType of [0, 1, 2, 3, 4, -1]) {
    for (const colorType of [2, 6] as const) {
      const encoded = PNG.sync.write(image, { filterType, colorType });
      const expected = PNG.sync.read(encoded).data.subarray(0, 37 * 50 * 4);
      const top = decodePngTopRows(encoded, 50);
      assert.ok(top, `filter ${filterType} colorType ${colorType} should decode`);
      assert.equal(Buffer.compare(top.data, expected), 0, `filter ${filterType} colorType ${colorType}`);
    }
  }
});
