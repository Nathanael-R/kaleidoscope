import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScanWidths, groupBreakpointIssues } from './breakpoint-scan.service.js';

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
