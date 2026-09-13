import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScanWidths, groupBreakpointIssues } from './breakpoint-scan.service.js';
import { breakpointScanService } from './breakpoint-scan.service.js';
import { closeSharedBrowser } from './browser.service.js';

test('breakpoint scan evaluates real visible controls in the isolated browser context', { timeout: 20_000 }, async () => {
  try {
    const result = await breakpointScanService.scan({
      url: `data:text/html,${encodeURIComponent('<style>body{margin:0}button{width:400px}#hidden{display:none}</style><button id="save">Save</button><button id="hidden">Hidden</button>')}`,
      minWidth: 320, maxWidth: 480, step: 80, height: 900, settleMs: 0, waitUntil: 'domcontentloaded',
    });
    assert.equal(result.verdict, 'issues-found');
    assert.deepEqual(result.scannedWidths, [320, 400, 480]);
    const clipped = result.issueRanges.find((issue) => issue.type === 'clipped-interactive');
    assert.equal(clipped?.selector, '#save');
    assert.deepEqual(clipped?.sampledWidths, [320]);
    assert.ok(result.issueRanges.every((issue) => issue.selector !== '#hidden'));
    assert.deepEqual(result.probes[2]?.issues, []);
  } finally {
    await closeSharedBrowser();
  }
});

test('buildScanWidths includes both bounds when the step does not land on the maximum', () => {
  assert.deepEqual(buildScanWidths(320, 375, 24), [320, 344, 368, 375]);
});

test('groupBreakpointIssues groups adjacent samples but keeps separated ranges distinct', () => {
  const ranges = groupBreakpointIssues([
    {
      width: 320,
      scrollWidth: 350,
      issues: [{ type: 'horizontal-overflow', key: 'document', message: 'overflow', selector: null, overflowPx: 30 }],
    },
    {
      width: 336,
      scrollWidth: 350,
      issues: [{ type: 'horizontal-overflow', key: 'document', message: 'overflow', selector: null, overflowPx: 14 }],
    },
    { width: 352, scrollWidth: 352, issues: [] },
    {
      width: 368,
      scrollWidth: 390,
      issues: [{ type: 'horizontal-overflow', key: 'document', message: 'overflow', selector: null, overflowPx: 22 }],
    },
  ]);

  assert.deepEqual(ranges, [
    {
      type: 'horizontal-overflow',
      key: 'document',
      message: 'overflow',
      selector: null,
      startWidth: 320,
      endWidth: 336,
      sampledWidths: [320, 336],
      maxOverflowPx: 30,
    },
    {
      type: 'horizontal-overflow',
      key: 'document',
      message: 'overflow',
      selector: null,
      startWidth: 368,
      endWidth: 368,
      sampledWidths: [368],
      maxOverflowPx: 22,
    },
  ]);
});
