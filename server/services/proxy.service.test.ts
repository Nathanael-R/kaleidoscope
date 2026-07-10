import test from 'node:test';
import assert from 'node:assert/strict';
import { proxyService } from './proxy.service.js';

function resultJson(result: { body: string | Buffer }): unknown {
  return JSON.parse(Buffer.isBuffer(result.body) ? result.body.toString('utf8') : result.body);
}

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

test('auth failure detection only treats anchored login paths as auth redirects', async () => {
  const originalFetch = global.fetch;
  const session = proxyService.createSession('http://203.0.113.10');

  try {
    global.fetch = async () => new Response('', {
      status: 302,
      headers: { location: 'http://example.test/author-profile' },
    });

    const authorResult = await proxyService.proxyRequest(session.id, '/author-profile');
    assert.equal(authorResult.authFailed, false);

    global.fetch = async () => new Response('', {
      status: 302,
      headers: { location: 'http://example.test/auth/login' },
    });

    const authResult = await proxyService.proxyRequest(session.id, '/private');
    assert.equal(authResult.authFailed, true);
  } finally {
    proxyService.removeSession(session.id);
    global.fetch = originalFetch;
  }
});

test('mock routes can match by method and return custom statuses', async () => {
  const session = proxyService.createSession('http://203.0.113.10');

  try {
    const registered = proxyService.setMockRoutes(session.id, [
      {
        pattern: '/api/items',
        response: { source: 'fallback' },
      },
      {
        pattern: '/api/items',
        method: 'POST',
        status: 409,
        response: { error: 'conflict' },
      },
    ]);

    assert.equal(registered, true);

    const getResult = await proxyService.proxyRequest(session.id, '/api/items', 'GET');
    assert.equal(getResult.wasMocked, true);
    assert.equal(getResult.status, 200);
    assert.deepEqual(resultJson(getResult), { source: 'fallback' });

    const postResult = await proxyService.proxyRequest(session.id, '/api/items', 'POST');
    assert.equal(postResult.wasMocked, true);
    assert.equal(postResult.status, 409);
    assert.deepEqual(resultJson(postResult), { error: 'conflict' });
  } finally {
    proxyService.removeSession(session.id);
  }
});

test('re-registering the same mock pattern and method replaces the old entry', async () => {
  const session = proxyService.createSession('http://203.0.113.10');

  try {
    assert.equal(proxyService.setMockRoutes(session.id, [
      {
        pattern: '/api/items',
        method: 'POST',
        status: 400,
        response: { version: 'old' },
      },
    ]), true);

    assert.equal(proxyService.setMockRoutes(session.id, [
      {
        pattern: '/api/items',
        method: 'post',
        status: 201,
        response: { version: 'new' },
      },
    ]), true);

    const result = await proxyService.proxyRequest(session.id, '/api/items', 'POST');
    assert.equal(result.status, 201);
    assert.deepEqual(resultJson(result), { version: 'new' });
  } finally {
    proxyService.removeSession(session.id);
  }
});

test('mock routes match parameter names with digits and ignore request query strings', async () => {
  const session = proxyService.createSession('http://203.0.113.10');

  try {
    assert.equal(proxyService.setMockRoutes(session.id, [
      {
        pattern: '/api/users/:userId2',
        response: { userId: '42' },
      },
    ]), true);

    const result = await proxyService.proxyRequest(session.id, '/api/users/42?include=profile');
    assert.equal(result.wasMocked, true);
    assert.deepEqual(resultJson(result), { userId: '42' });
  } finally {
    proxyService.removeSession(session.id);
  }
});

test('proxy root preserves the target page path and query, while nested requests forward their query', async () => {
  const originalFetch = global.fetch;
  const requestedUrls: string[] = [];
  global.fetch = async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
  };

  const session = proxyService.createSession('http://203.0.113.10/dashboard?tab=activity');

  try {
    await proxyService.proxyRequest(session.id, '/');
    await proxyService.proxyRequest(session.id, '/api/items?state=open');

    assert.deepEqual(requestedUrls, [
      'http://203.0.113.10/dashboard?tab=activity',
      'http://203.0.113.10/api/items?state=open',
    ]);
  } finally {
    proxyService.removeSession(session.id);
    global.fetch = originalFetch;
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
