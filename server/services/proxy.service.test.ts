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
    'http://203.0.113.10',
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
  const sessionOne = proxyService.createSession('http://203.0.113.10');
  const sessionTwo = proxyService.createSession('http://203.0.113.10');

  try {
    assert.match(sessionOne.id, /^proxy_[0-9a-f-]{36}$/i);
    assert.match(sessionTwo.id, /^proxy_[0-9a-f-]{36}$/i);
    assert.notEqual(sessionOne.id, sessionTwo.id);
  } finally {
    proxyService.removeSession(sessionOne.id);
    proxyService.removeSession(sessionTwo.id);
  }
});

test('cleanExpired uses lastAccessedAt, so active sessions survive a long createdAt age', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });

  let session: { id: string } | null = null;
  try {
    session = proxyService.createSession('http://203.0.113.10');
    // Artificially age createdAt beyond the expiry window, then back-date
    // lastAccessedAt to a clearly old timestamp so we can observe the touch.
    (session as any).createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    (session as any).lastAccessedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const oldLastAccess = (session as any).lastAccessedAt.getTime();

    await proxyService.proxyRequest(session.id, '/');

    assert.ok(
      (session as any).lastAccessedAt.getTime() > oldLastAccess,
      'proxyRequest should refresh lastAccessedAt',
    );

    const cleaned = proxyService.cleanExpired();
    assert.equal(cleaned, 0, 'an active session should not be expired by createdAt alone');
    assert.ok(proxyService.getSession(session.id), 'session must still be present');
  } finally {
    if (session) proxyService.removeSession(session.id);
    global.fetch = originalFetch;
  }
});

test('cleanExpired removes sessions that have been idle longer than the max age', () => {
  const session = proxyService.createSession('http://203.0.113.10');
  (session as any).lastAccessedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const cleaned = proxyService.cleanExpired();
  assert.equal(cleaned, 1);
  assert.equal(proxyService.getSession(session.id), undefined);
});
