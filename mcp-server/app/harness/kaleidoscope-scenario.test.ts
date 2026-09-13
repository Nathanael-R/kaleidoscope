import test from 'node:test';
import assert from 'node:assert/strict';
import { createKaleidoscopeScenario } from './kaleidoscope-scenario.js';

test('Kaleidoscope scenario emits explicit preview mappings into image blocks', () => {
  const result = createKaleidoscopeScenario().createInitialResult() as {
    structuredContent: { screenshots: Array<{ deviceId: string }>; inlinePreviews: Array<{ deviceId: string; contentIndex: number }> };
    content: Array<{ type: string }>;
  };
  assert.equal(result.structuredContent.inlinePreviews.length, result.structuredContent.screenshots.length);
  for (const mapping of result.structuredContent.inlinePreviews) {
    assert.equal(result.content[mapping.contentIndex]?.type, 'image');
    assert.ok(result.structuredContent.screenshots.some((screenshot) => screenshot.deviceId === mapping.deviceId));
  }
});
