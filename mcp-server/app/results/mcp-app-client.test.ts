import test from 'node:test';
import assert from 'node:assert/strict';
import { McpAppClient, McpRequestCancelledError, McpRequestError, McpRequestTimeoutError } from './mcp-app-client.js';
import type { JsonRpcMessage } from '../shared/mcp-app-protocol.js';

class FakeMessages {
  listener: ((event: MessageEvent<unknown>) => void) | undefined;
  addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void): void { this.listener = listener; }
  removeEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void): void { if (this.listener === listener) this.listener = undefined; }
  emit(data: unknown): void { this.listener?.({ data, source: null } as MessageEvent<unknown>); }
}

function setup(timeout = 50) {
  const source = new FakeMessages();
  const sent: JsonRpcMessage[] = [];
  const client = new McpAppClient({ source, target: { postMessage: (message) => sent.push(message) }, defaultTimeoutMs: timeout });
  return { source, sent, client };
}

test('initializes, negotiates capabilities, and emits initialized', async () => {
  const { source, sent, client } = setup();
  const pending = client.initialize();
  source.emit({ jsonrpc: '2.0', id: sent[0]?.id, result: { protocolVersion: '2026-01-26', hostCapabilities: { serverTools: {} }, hostContext: { theme: 'dark' } } });
  const initialized = await pending;
  assert.ok(initialized.hostCapabilities.serverTools);
  assert.equal(initialized.hostContext.theme, 'dark');
  assert.equal(sent[1]?.method, 'ui/notifications/initialized');
  client.dispose();
});

test('falls back safely when a host advertises unsupported capabilities', async () => {
  const { source, sent, client } = setup();
  const pending = client.initialize();
  source.emit({ jsonrpc: '2.0', id: sent[0]?.id, result: { protocolVersion: '2026-01-26', hostCapabilities: { futureFeature: true }, hostContext: { theme: 'sepia' } } });
  const initialized = await pending;
  assert.deepEqual(initialized.hostCapabilities, {});
  assert.deepEqual(initialized.hostContext, {});
  client.dispose();
});

test('handles successful and error responses', async () => {
  const { source, sent, client } = setup();
  const success = client.callTool('demo', {}); source.emit({ jsonrpc: '2.0', id: sent[0]?.id, result: { ok: true } });
  assert.deepEqual(await success, { ok: true });
  const failure = client.callTool('demo', {}); source.emit({ jsonrpc: '2.0', id: sent[1]?.id, error: { code: -1, message: 'Nope' } });
  await assert.rejects(failure, McpRequestError); client.dispose();
});

test('times out, sends cancellation, and ignores a late response', async () => {
  const { source, sent, client } = setup(5);
  const pending = client.callTool('slow', {});
  await assert.rejects(pending, McpRequestTimeoutError);
  assert.equal(sent[1]?.method, 'notifications/cancelled');
  source.emit({ jsonrpc: '2.0', id: sent[0]?.id, result: { late: true } });
  client.dispose();
});

test('supports AbortSignal cancellation and idempotent host teardown', async () => {
  const { source, sent, client } = setup();
  const abort = new AbortController();
  const pending = client.callTool('slow', {}, { signal: abort.signal }); abort.abort();
  await assert.rejects(pending, McpRequestCancelledError);
  let teardowns = 0; client.onTeardown(() => teardowns++);
  source.emit({ jsonrpc: '2.0', id: 'bye', method: 'ui/resource-teardown', params: {} });
  assert.equal(teardowns, 1); assert.equal(sent.at(-1)?.id, 'bye'); assert.equal(client.isDisposed, true);
  client.dispose(); assert.equal(source.listener, undefined);
});
