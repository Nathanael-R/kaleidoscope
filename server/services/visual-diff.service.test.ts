import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { comparePngBuffers, VisualDiffDimensionError } from './visual-diff.service.js';

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
