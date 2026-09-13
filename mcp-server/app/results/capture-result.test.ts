import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptureResultParseError, parseCaptureToolResult } from './capture-result.js';

function result(mappings: unknown = [
  { deviceId: 'desktop', contentIndex: 2, resourceUri: 'file:///desktop.png' },
  { deviceId: 'mobile', contentIndex: 0, resourceUri: null },
]): unknown {
  return {
    structuredContent: {
      url: 'https://example.com', count: 2,
      screenshots: [
        { deviceId: 'desktop', device: 'Desktop HD', width: 1440, height: 900, error: null },
        { deviceId: 'mobile', device: 'Mobile', width: 390, height: 844, error: null },
      ],
      inlinePreviews: mappings,
    },
    content: [
      { type: 'image', mimeType: 'image/png', data: 'MOBILE' },
      { type: 'text', text: 'unrelated and reordered' },
      { type: 'image', mimeType: 'image/png', data: 'DESKTOP' },
    ],
  };
}

test('maps reordered image content explicitly by device ID and content index', () => {
  const parsed = parseCaptureToolResult(result());
  assert.equal(parsed.screenshots[0]?.imageUrl, 'data:image/png;base64,DESKTOP');
  assert.equal(parsed.screenshots[0]?.resourceUri, 'file:///desktop.png');
  assert.equal(parsed.screenshots[1]?.imageUrl, 'data:image/png;base64,MOBILE');
});

test('allows partial preview mappings without guessing associations', () => {
  const parsed = parseCaptureToolResult(result([{ deviceId: 'mobile', contentIndex: 0, resourceUri: null }]));
  assert.equal(parsed.screenshots[0]?.imageUrl, undefined);
  assert.equal(parsed.screenshots[1]?.imageUrl, 'data:image/png;base64,MOBILE');
});

test('allows a valid capture with no inline previews', () => {
  const parsed = parseCaptureToolResult(result([]));
  assert.ok(parsed.screenshots.every((screenshot) => screenshot.imageUrl === undefined));
});

test('rejects malformed, duplicate, and out-of-range preview mappings', () => {
  assert.throws(() => parseCaptureToolResult(result([{ deviceId: 'desktop', contentIndex: 99, resourceUri: null }])), CaptureResultParseError);
  assert.throws(() => parseCaptureToolResult(result([
    { deviceId: 'mobile', contentIndex: 0, resourceUri: null },
    { deviceId: 'mobile', contentIndex: 0, resourceUri: null },
  ])), /duplicated/);
  assert.throws(() => parseCaptureToolResult(result([{ deviceId: 'tablet', contentIndex: 0, resourceUri: null }])), /unknown device/);
});

test('surfaces tool errors and rejects malformed structured capture data', () => {
  assert.throws(() => parseCaptureToolResult({ isError: true, content: [{ type: 'text', text: 'Browser failed.' }] }), /Browser failed/);
  assert.throws(() => parseCaptureToolResult({ structuredContent: { url: '', count: 0, screenshots: [], inlinePreviews: [] }, content: [] }), /URL/);
});
