import test from 'node:test';
import assert from 'node:assert/strict';
import { ResultsController, type ResultsClient } from './controller.js';
import type { AppInitialization, RequestOptions } from './mcp-app-client.js';

function toolResult(device = 'desktop'): unknown {
  return {
    structuredContent: {
      url: 'https://example.com', count: 1,
      screenshots: [{ deviceId: device, device, width: 1440, height: 900, error: null }],
      inlinePreviews: [{ deviceId: device, contentIndex: 0, resourceUri: null }],
    },
    content: [{ type: 'image', mimeType: 'image/png', data: 'IMAGE' }],
  };
}

class FakeClient implements ResultsClient {
  notifications = new Map<string, (params: unknown) => void>();
  teardown: (() => void) | undefined;
  disposed = 0;
  call: (_name: string, _args: Record<string, unknown>, _options?: RequestOptions) => Promise<unknown> = async () => toolResult();
  async initialize(): Promise<AppInitialization> { return { hostCapabilities: { serverTools: {} }, hostContext: {} }; }
  callTool(name: string, args: Record<string, unknown>, options?: RequestOptions): Promise<unknown> { return this.call(name, args, options); }
  async requestDisplayMode(): Promise<unknown> { return { mode: 'inline' }; }
  notify(): void {}
  onNotification(method: string, handler: (params: unknown) => void): () => void { this.notifications.set(method, handler); return () => this.notifications.delete(method); }
  onTeardown(handler: () => void): void { this.teardown = handler; }
  dispose(): void { this.disposed++; }
}

function setup(client = new FakeClient()) {
  const renders: string[] = [];
  const controller = new ResultsController({ client, render: (state) => renders.push(state.lifecycle), applyHostContext: () => {}, now: () => new Date(42) });
  return { client, controller, renders };
}

test('controller initializes and completes a recapture through validated state', async () => {
  const { client, controller } = setup();
  await controller.initialize();
  controller.updateRequest({ url: 'https://example.com', devices: ['desktop'], fullPage: true });
  assert.equal(await controller.recapture(), true);
  assert.equal(controller.snapshot.capture?.screenshots[0]?.imageUrl, 'data:image/png;base64,IMAGE');
  assert.equal(controller.snapshot.capturing, false);
  assert.equal(client.disposed, 0);
  controller.dispose();
});

test('controller recovers to a non-busy failed state when initialization fails', async () => {
  const client = new FakeClient();
  client.initialize = async () => { throw new Error('Unsupported protocol'); };
  const { controller } = setup(client);
  await controller.initialize();
  assert.equal(controller.snapshot.lifecycle, 'failed');
  assert.equal(controller.snapshot.capturing, false);
  assert.match(controller.snapshot.error ?? '', /Unsupported protocol/);
  controller.dispose();
});

test('controller prevents overlapping capture and retains the existing result on failure', async () => {
  const { client, controller } = setup();
  await controller.initialize();
  controller.updateRequest({ url: 'https://example.com', devices: ['desktop'] });
  let resolve: ((value: unknown) => void) | undefined;
  client.call = () => new Promise((done) => { resolve = done; });
  const first = controller.recapture();
  assert.equal(await controller.recapture(), false);
  resolve?.(toolResult()); await first;
  client.call = async () => { throw new Error('Timed out'); };
  assert.equal(await controller.recapture(), false);
  assert.ok(controller.snapshot.capture);
  assert.match(controller.snapshot.error ?? '', /Timed out/);
  controller.dispose();
});

test('host teardown aborts pending work, unsubscribes, and blocks late overwrite', async () => {
  const { client, controller } = setup();
  await controller.initialize(); controller.updateRequest({ url: 'https://example.com', devices: ['desktop'] });
  let resolve: ((value: unknown) => void) | undefined;
  client.call = () => new Promise((done) => { resolve = done; });
  const pending = controller.recapture();
  client.teardown?.(); resolve?.(toolResult('mobile')); await pending;
  assert.equal(controller.snapshot.lifecycle, 'disposed');
  assert.equal(controller.snapshot.capture, null);
  assert.equal(client.notifications.size, 0);
  assert.equal(client.disposed, 0);
});
