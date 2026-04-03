import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_MAP } from './device-catalog.js';
import { buildDeviceMockupHtml, getMockupFrameMetrics } from './screenshot-mockup.js';

test('getMockupFrameMetrics expands viewport size for framed device captures', () => {
  const metrics = getMockupFrameMetrics(DEVICE_MAP['iphone-14']);

  assert.equal(metrics.deviceWidth, 390);
  assert.equal(metrics.deviceHeight, 844);
  assert.equal(metrics.frameWidth, 438);
  assert.equal(metrics.frameHeight, 940);
  assert.equal(metrics.canvasWidth, 486);
  assert.equal(metrics.canvasHeight, 988);
});

test('buildDeviceMockupHtml includes shell features for dynamic-island devices', () => {
  const html = buildDeviceMockupHtml(
    DEVICE_MAP['iphone-16'],
    'data:image/png;base64,ZmFrZQ==',
  );

  assert.match(html, /dynamic-island/);
  assert.match(html, /home-indicator iphone/);
  assert.match(html, /data-device-id="iphone-16"/);
});

test('buildDeviceMockupHtml includes monitor stand for desktop captures', () => {
  const html = buildDeviceMockupHtml(
    DEVICE_MAP.desktop,
    'data:image/png;base64,ZmFrZQ==',
  );

  assert.match(html, /desktop-stand/);
  assert.doesNotMatch(html, /class="top-feature dynamic-island"/);
});