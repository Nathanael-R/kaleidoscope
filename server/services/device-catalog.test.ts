import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_MAP,
  getDeviceContextOptions,
  getPlaywrightDescriptorName,
} from './device-catalog.js';

test('supported iPhone devices use a matching Playwright mobile descriptor', () => {
  const device = DEVICE_MAP['iphone-14'];
  const options = getDeviceContextOptions(device);

  assert.equal(getPlaywrightDescriptorName(device.id), 'iPhone 14');
  assert.ok(options.viewport);
  assert.equal(options.viewport?.width, device.width);
  assert.equal(options.viewport?.height, device.height);
  assert.equal(options.screen?.width, device.width);
  assert.equal(options.screen?.height, device.height);
  assert.equal(options.isMobile, true);
  assert.equal(options.hasTouch, true);
  assert.match(options.userAgent ?? '', /iPhone/i);
});

test('unsupported catalog devices fall back to the nearest Playwright profile', () => {
  const device = DEVICE_MAP['iphone-17'];
  const options = getDeviceContextOptions(device);

  assert.equal(getPlaywrightDescriptorName(device.id), 'iPhone 15 Pro Max');
  assert.ok(options.viewport);
  assert.equal(options.viewport?.width, device.width);
  assert.equal(options.viewport?.height, device.height);
  assert.equal(options.screen?.width, device.width);
  assert.equal(options.screen?.height, device.height);
  assert.equal(options.isMobile, true);
  assert.equal(options.hasTouch, true);
  assert.match(options.userAgent ?? '', /iPhone/i);
});

test('desktop devices use desktop browser defaults with the requested viewport', () => {
  const device = DEVICE_MAP['desktop-4k'];
  const options = getDeviceContextOptions(device);

  assert.equal(getPlaywrightDescriptorName(device.id), 'Desktop Chrome HiDPI');
  assert.ok(options.viewport);
  assert.equal(options.viewport?.width, device.width);
  assert.equal(options.viewport?.height, device.height);
  assert.equal(options.screen?.width, device.width);
  assert.equal(options.screen?.height, device.height);
  assert.equal(options.isMobile, false);
  assert.equal(options.hasTouch, false);
  assert.match(options.userAgent ?? '', /Chrome/i);
});
