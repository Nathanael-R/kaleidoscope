import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScreenshotDevices } from './screenshot.js';

test('normalizeScreenshotDevices accepts ids, names, and common natural aliases', () => {
  assert.deepEqual(
    normalizeScreenshotDevices(['iphone-14', 'iPhone 14', 'iphone14']),
    ['iphone-14', 'iphone-14', 'iphone-14'],
  );

  assert.deepEqual(
    normalizeScreenshotDevices(['Desktop HD', 'desktop 4k']),
    ['desktop', 'desktop-4k'],
  );
});

test('normalizeScreenshotDevices rejects unknown devices with supported ids', () => {
  assert.throws(
    () => normalizeScreenshotDevices(['iPhone Banana']),
    /Available device IDs:.*iphone-14/i,
  );
});
