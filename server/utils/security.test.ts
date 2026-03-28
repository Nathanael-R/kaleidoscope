import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedHttpUrl, isInspectableLocalUrl, validateCookies, validateRequestHeaders } from './security.js';

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

test('isInspectableLocalUrl only allows loopback and localhost targets', () => {
  assert.equal(isInspectableLocalUrl('http://localhost:3000'), true);
  assert.equal(isInspectableLocalUrl('https://127.0.0.1:5173/app'), true);
  assert.equal(isInspectableLocalUrl('http://studio.localhost:4000'), true);
  assert.equal(isInspectableLocalUrl('https://example.com'), false);
  assert.equal(isInspectableLocalUrl('http://192.168.1.10:3000'), false);
});

test('validateCookies accepts valid cookie list', () => {
  const result = validateCookies([
    { name: 'session_id', value: 'abc123' },
    { name: 'theme', value: 'dark' },
  ]);

  assert.equal(result.valid, true);
  assert.ok(result.sanitized);
  assert.equal(result.sanitized?.length, 2);
});

test('validateCookies rejects invalid cookie names and values', () => {
  const invalidName = validateCookies([{ name: 'bad;name', value: 'ok' }]);
  assert.equal(invalidName.valid, false);

  const invalidValue = validateCookies([{ name: 'good_name', value: 'line\nbreak' }]);
  assert.equal(invalidValue.valid, false);

  const nonArray = validateCookies({ name: 'x', value: 'y' });
  assert.equal(nonArray.valid, false);
});

test('validateRequestHeaders accepts safe auth-style headers', () => {
  const result = validateRequestHeaders([
    { name: 'Authorization', value: 'Bearer token-123' },
    { name: 'X-API-Key', value: 'secret-key' },
  ]);

  assert.equal(result.valid, true);
  assert.deepEqual(result.sanitized, [
    { name: 'authorization', value: 'Bearer token-123' },
    { name: 'x-api-key', value: 'secret-key' },
  ]);
});

test('validateRequestHeaders rejects blocked or malformed headers', () => {
  const blockedHeader = validateRequestHeaders([{ name: 'Cookie', value: 'session=abc' }]);
  assert.equal(blockedHeader.valid, false);

  const invalidValue = validateRequestHeaders([{ name: 'Authorization', value: 'bad\nvalue' }]);
  assert.equal(invalidValue.valid, false);

  const nonArray = validateRequestHeaders({ name: 'authorization', value: 'x' });
  assert.equal(nonArray.valid, false);
});
