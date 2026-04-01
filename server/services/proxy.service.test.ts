import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyService } from './proxy.service.js';

test('proxyRequest injects session cookies and request headers into upstream fetches', async () => {
  const originalFetch = global.fetch;
  let capturedHeaders: HeadersInit | undefined;

  global.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedHeaders = init?.headers;
    return new Response('<html><head></head><body>ok</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
  };

  const session = proxyService.createSession(
    'https://example.com',
    [{ name: 'session_id', value: 'abc123' }],
    {
      requestHeaders: [{ name: 'authorization', value: 'Bearer token-123' }],
    },
  );

  try {
    const result = await proxyService.proxyRequest(session.id, '/api/me');

    assert.equal(result.status, 200);
    assert.ok(capturedHeaders);

    const headerMap = new Headers(capturedHeaders);
    assert.equal(headerMap.get('cookie'), 'session_id=abc123');
    assert.equal(headerMap.get('authorization'), 'Bearer token-123');
  } finally {
    proxyService.removeSession(session.id);
    global.fetch = originalFetch;
  }
});

test('createSession uses opaque random UUID-based session identifiers', () => {
  const sessionOne = proxyService.createSession('https://example.com');
  const sessionTwo = proxyService.createSession('https://example.com');

  try {
    assert.match(sessionOne.id, /^proxy_[0-9a-f-]{36}$/i);
    assert.match(sessionTwo.id, /^proxy_[0-9a-f-]{36}$/i);
    assert.notEqual(sessionOne.id, sessionTwo.id);
  } finally {
    proxyService.removeSession(sessionOne.id);
    proxyService.removeSession(sessionTwo.id);
  }
});