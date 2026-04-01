import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTunnelUrl } from './tunnel.service.js';

test('extractTunnelUrl reads cloudflared quick tunnel output', () => {
  assert.equal(
    extractTunnelUrl('cloudflared', 'INF | Your quick Tunnel has been created! Visit it at https://quiet-river.trycloudflare.com'),
    'https://quiet-river.trycloudflare.com',
  );
});

test('extractTunnelUrl reads ngrok log output', () => {
  assert.equal(
    extractTunnelUrl('ngrok', '{"lvl":"info","msg":"started tunnel","obj":{"url":"https://preview.ngrok-free.app"}}'),
    'https://preview.ngrok-free.app',
  );
});