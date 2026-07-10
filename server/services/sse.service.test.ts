import test from 'node:test';
import assert from 'node:assert/strict';
import { sseService, type SSEServiceEvent } from './sse.service.js';

test('sseService.once observes reload events even when no browser client is connected', async () => {
  const observed = new Promise<SSEServiceEvent>((resolve) => {
    sseService.once('reload', resolve);
  });

  const delivered = sseService.sendToClient('observe-test-client-123456', 'reload', {
    watcherId: 'observe-test',
    path: 'src/App.tsx',
  });

  const event = await observed;

  assert.equal(delivered, false);
  assert.equal(event.clientId, 'observe-test-client-123456');
  assert.equal(event.event, 'reload');
  assert.equal(event.delivered, false);
  assert.deepEqual(event.data, {
    watcherId: 'observe-test',
    path: 'src/App.tsx',
  });
});
