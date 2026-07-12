import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import {
  comparePngBuffers,
  comparePngFiles,
  pruneVisualDiffArtifacts,
  VisualDiffDimensionError,
  VisualDiffLimitError,
} from './visual-diff.service.js';

function png(width: number, height: number, pixels: Array<[number, number, number, number]>): Buffer {
  const image = new PNG({ width, height });
  for (const [index, pixel] of pixels.entries()) {
    image.data.set(pixel, index * 4);
  }
  return PNG.sync.write(image);
}

const options = { colorThreshold: 0.1, includeAntialiasing: false };

test('comparePngBuffers reports identical images as unchanged', () => {
  const image = png(2, 1, [[255, 255, 255, 255], [0, 0, 0, 255]]);
  const result = comparePngBuffers(image, image, options);

  assert.equal(result.mismatchedPixels, 0);
  assert.equal(result.mismatchPercentage, 0);
  assert.equal(result.width, 2);
  assert.equal(result.height, 1);
  assert.ok(result.diffBuffer.byteLength > 0);
});

test('comparePngBuffers reports changed pixels and percentage', () => {
  const baseline = png(2, 2, Array(4).fill([255, 255, 255, 255]));
  const current = png(2, 2, [
    [0, 0, 0, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
    [255, 255, 255, 255],
  ]);
  const result = comparePngBuffers(baseline, current, options);

  assert.equal(result.mismatchedPixels, 1);
  assert.equal(result.mismatchPercentage, 25);
});

test('comparePngBuffers rejects screenshots with different dimensions', () => {
  const baseline = png(1, 1, [[255, 255, 255, 255]]);
  const current = png(2, 1, [[255, 255, 255, 255], [255, 255, 255, 255]]);

  assert.throws(
    () => comparePngBuffers(baseline, current, options),
    VisualDiffDimensionError,
  );
});

test('comparePngBuffers rejects dimensions above the pixel limit before decoding', () => {
  const oversizedHeader = png(1, 1, [[0, 0, 0, 255]]);
  oversizedHeader.writeUInt32BE(5001, 16);
  oversizedHeader.writeUInt32BE(5001, 20);
  assert.throws(
    () => comparePngBuffers(oversizedHeader, oversizedHeader, options),
    VisualDiffLimitError,
  );
});

test('comparePngFiles runs comparison in a worker and writes its artifact', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'kaleidoscope-visual-diff-'));
  const baselinePath = join(directory, 'baseline.png');
  const currentPath = join(directory, 'current.png');
  const diffPath = join(directory, 'diffs', 'diff.png');
  const image = png(1, 1, [[255, 255, 255, 255]]);
  await Promise.all([writeFile(baselinePath, image), writeFile(currentPath, image)]);

  const result = await comparePngFiles(baselinePath, currentPath, diffPath, options);
  assert.equal(result.mismatchedPixels, 0);
  assert.ok((await readFile(diffPath)).byteLength > 0);
});

test('pruneVisualDiffArtifacts removes expired and excess PNG artifacts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'kaleidoscope-visual-prune-'));
  await mkdir(directory, { recursive: true });
  const paths = ['old.png', 'middle.png', 'new.png'].map(name => join(directory, name));
  await Promise.all(paths.map(filePath => writeFile(filePath, 'png')));
  const now = Date.now() / 1000;
  await utimes(paths[0], now - 1000, now - 1000);
  await utimes(paths[1], now - 10, now - 10);
  await utimes(paths[2], now, now);

  await pruneVisualDiffArtifacts(directory, 100_000, 2);
  await assert.rejects(readFile(paths[0]), { code: 'ENOENT' });
  assert.equal((await readFile(paths[1])).toString(), 'png');
  assert.equal((await readFile(paths[2])).toString(), 'png');
});
