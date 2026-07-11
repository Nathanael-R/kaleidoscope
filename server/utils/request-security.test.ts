import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedBrowserOrigin,
  isLoopbackHostname,
  isManagementApiPath,
  isTrustedManagementClient,
} from './request-security.js';

test('isLoopbackHostname allows loopback-only hostnames', () => {
  assert.equal(isLoopbackHostname('localhost'), true);
  assert.equal(isLoopbackHostname('127.0.0.1'), true);
  assert.equal(isLoopbackHostname('studio.localhost'), true);
  assert.equal(isLoopbackHostname('example.com'), false);
});

test('isAllowedBrowserOrigin allows loopback origins in development', () => {
  assert.equal(isAllowedBrowserOrigin('http://localhost:5173'), true);
  assert.equal(isAllowedBrowserOrigin('http://127.0.0.1:4173'), true);
  assert.equal(isAllowedBrowserOrigin('https://example.com'), false);
});

test('isAllowedBrowserOrigin enforces the configured production origin', () => {
  assert.equal(
    isAllowedBrowserOrigin('https://app.example.com', 'https://app.example.com'),
    true,
  );
  assert.equal(
    isAllowedBrowserOrigin('https://evil.example.com', 'https://app.example.com'),
    false,
  );
});

test('isTrustedManagementClient only allows known Kaleidoscope clients', () => {
  assert.equal(isTrustedManagementClient('mosaic-client'), true);
  assert.equal(isTrustedManagementClient('mcp-server'), true);
  assert.equal(isTrustedManagementClient('unknown-client'), false);
});

test('isManagementApiPath protects management endpoints but leaves inspect proxy traffic alone', () => {
  assert.equal(isManagementApiPath('/api/proxy/inspect_123/assets/app.js'), false);
  assert.equal(isManagementApiPath('/api/inspect/discover'), true);
  assert.equal(isManagementApiPath('/api/inspect/bridge.js'), false);
});
