import assert from 'node:assert/strict';
import { createServer, type RequestListener, type Server } from 'node:http';
import test from 'node:test';
import { proxyService } from './proxy.service.js';

async function listen(handler: RequestListener): Promise<{ server: Server; origin: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address.');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('inspect proxy follows and validates a relative redirect', async () => {
  const { server, origin } = await listen((req, res) => {
    if (req.url === '/start') {
      res.writeHead(302, { location: '/finish' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('redirected');
  });

  try {
    const session = proxyService.createSession(`${origin}/start`);
    const result = await proxyService.proxyRequest(session.id, '/');
    assert.equal(result.status, 200);
    assert.equal(result.body.toString(), 'redirected');
  } finally {
    await close(server);
  }
});

test('inspect proxy rejects a redirect to a blocked address', async () => {
  const { server, origin } = await listen((_req, res) => {
    res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
    res.end();
  });

  try {
    const session = proxyService.createSession(origin);
    const result = await proxyService.proxyRequest(session.id, '/');
    assert.equal(result.status, 403);
    assert.match(result.body.toString(), /not allowed/i);
  } finally {
    await close(server);
  }
});
