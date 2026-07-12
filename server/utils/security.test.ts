import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedHttpUrl,
  isInspectableLocalUrl,
  validateProxyTargetUrl,
} from './security.js';

test('isAllowedHttpUrl rejects disallowed schemes and hosts', async () => {
  assert.equal(await isAllowedHttpUrl('ftp://example.com/file.txt'), false);
  assert.equal(await isAllowedHttpUrl('http://localhost:3000'), false);
  assert.equal(await isAllowedHttpUrl('http://127.0.0.1:5000'), false);
  assert.equal(await isAllowedHttpUrl('http://169.254.169.254/latest/meta-data/'), false);
});

test('isAllowedHttpUrl rejects private IPv4 ranges', async () => {
  assert.equal(await isAllowedHttpUrl('http://10.0.0.5'), false);
  assert.equal(await isAllowedHttpUrl('http://172.16.0.10'), false);
  assert.equal(await isAllowedHttpUrl('http://192.168.1.8'), false);
});

test('isAllowedHttpUrl allows valid public URLs', async () => {
  assert.equal(await isAllowedHttpUrl('https://example.com'), true);
  assert.equal(await isAllowedHttpUrl('http://example.org/path?q=1'), true);
});

test('isAllowedHttpUrl can allow loopback URLs when explicitly requested', async () => {
  assert.equal(await isAllowedHttpUrl('http://localhost:3000', { allowLoopback: true }), true);
  assert.equal(await isAllowedHttpUrl('http://127.0.0.1:5000/api/proxy/sess123/', { allowLoopback: true }), true);
  assert.equal(await isAllowedHttpUrl('http://192.168.1.8', { allowLoopback: true }), false);
});

test('isInspectableLocalUrl only allows loopback and localhost targets', () => {
  assert.equal(isInspectableLocalUrl('http://localhost:3000'), true);
  assert.equal(isInspectableLocalUrl('https://127.0.0.1:5173/app'), true);
  assert.equal(isInspectableLocalUrl('http://127.0.0.1:5174/preview'), true);
  assert.equal(isInspectableLocalUrl('http://studio.localhost:4000'), true);
  assert.equal(isInspectableLocalUrl('https://example.com'), false);
  assert.equal(isInspectableLocalUrl('http://192.168.1.10:3000'), false);
});
