import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, reduceResultsState } from './state.js';

const capture = {
  url: 'https://example.com', count: 2,
  screenshots: [
    { deviceId: 'mobile', device: 'Mobile', width: 390, height: 844, error: 'failed' },
    { deviceId: 'desktop', device: 'Desktop HD', width: 1440, height: 900, error: null },
  ],
};

test('capture success selects a usable preview and initializes device selection', () => {
  const state = reduceResultsState(createInitialState(), { type: 'captureSucceeded', capture, source: 'host', now: new Date(0) });
  assert.equal(state.selectedDeviceId, 'desktop');
  assert.deepEqual(state.knownDeviceIds, ['mobile', 'desktop']);
  assert.deepEqual(state.captureDeviceIds, ['mobile', 'desktop']);
  assert.equal(state.updatedAt?.getTime(), 0);
});

test('recapture preserves selection when possible and clamps zoom', () => {
  let state = reduceResultsState(createInitialState(), { type: 'captureSucceeded', capture, source: 'host', now: new Date(0) });
  state = reduceResultsState(state, { type: 'selectDevice', deviceId: 'mobile' });
  state = reduceResultsState(state, { type: 'zoomBy', amount: 9 });
  state = reduceResultsState(state, { type: 'captureSucceeded', capture, source: 'manual', now: new Date(1) });
  assert.equal(state.selectedDeviceId, 'mobile');
  assert.equal(state.zoom, 2);
  assert.match(state.feedback, /Captured 2 devices/);
});

test('selects a fallback device when the previous device disappears', () => {
  let state = reduceResultsState(createInitialState(), { type: 'captureSucceeded', capture, source: 'host', now: new Date(0) });
  state = reduceResultsState(state, { type: 'selectDevice', deviceId: 'mobile' });
  const desktopOnly = { ...capture, count: 1, screenshots: [capture.screenshots[1]!] };
  state = reduceResultsState(state, { type: 'captureSucceeded', capture: desktopOnly, source: 'manual', now: new Date(1) });
  assert.equal(state.selectedDeviceId, 'desktop');
});

test('dispose leaves no active capture capability', () => {
  let state = reduceResultsState(createInitialState(), { type: 'initialized', canCallTools: true });
  state = reduceResultsState(state, { type: 'captureStarted' });
  state = reduceResultsState(state, { type: 'disposed' });
  assert.equal(state.lifecycle, 'disposed');
  assert.equal(state.canCallTools, false);
  assert.equal(state.capturing, false);
});
