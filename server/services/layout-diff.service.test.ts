import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  LayoutCaptureResult,
  LayoutDeviceCapture,
  LayoutElementSnapshot,
  LayoutRect,
} from './layout-types.js';
import { diffLayoutCaptures } from './layout-diff.service.js';
import { summarizeLayoutDiff } from './layout-summary.service.js';

const baseRect: LayoutRect = {
  x: 10,
  y: 20,
  width: 120,
  height: 40,
  top: 20,
  right: 130,
  bottom: 60,
  left: 10,
};

function element(overrides: Partial<LayoutElementSnapshot> = {}): LayoutElementSnapshot {
  return {
    key: 'button|0',
    selector: 'html > body > button:nth-of-type(1)',
    selectorKind: 'structural',
    selectorStability: 'structural',
    fallbackKey: 'button|button|',
    structuralPath: 'html > body:nth-of-type(1) > button:nth-of-type(1)',
    tagName: 'button',
    role: 'button',
    text: 'Save changes',
    accessibleName: 'Save changes',
    attributes: {
      id: null,
      className: 'jsx-12345678 primary',
      testId: null,
      ariaLabel: null,
      name: null,
      href: null,
      type: 'button',
    },
    rect: baseRect,
    depth: 2,
    visible: true,
    source: {
      filePath: 'src/App.tsx',
      lineNumber: 42,
      columnNumber: 7,
      componentName: 'SaveButton',
    },
    ...overrides,
  };
}

function deviceCapture(elements: LayoutElementSnapshot[]): LayoutDeviceCapture {
  return {
    device: {
      id: 'desktop',
      name: 'Desktop HD',
      type: 'desktop',
      width: 1920,
      height: 1080,
    },
    page: {
      title: 'Checkout',
      url: 'http://localhost:3000/checkout',
    },
    viewport: {
      width: 1920,
      height: 1080,
      scrollWidth: 1920,
      scrollHeight: 1080,
    },
    elements,
    stats: {
      elementCount: elements.length,
      capturedCount: elements.length,
      truncated: false,
    },
    diagnostics: [],
  };
}

function capture(id: string, elements: LayoutElementSnapshot[]): LayoutCaptureResult & { id: string } {
  return {
    id,
    url: 'http://localhost:3000/checkout',
    sourceDir: null,
    capturedAt: '2026-07-04T00:00:00.000Z',
    durationMs: 10,
    devices: [deviceCapture(elements)],
    warnings: [],
  };
}

test('layout diff matches by semantic fallback when generated selectors change', () => {
  const before = capture('layout_before', [
    element({
      selector: 'html > body > div:nth-of-type(1) > button:nth-of-type(1)',
      structuralPath: 'html > body:nth-of-type(1) > div:nth-of-type(1) > button:nth-of-type(1)',
    }),
  ]);
  const after = capture('layout_after', [
    element({
      key: 'button|1',
      selector: 'html > body > main:nth-of-type(1) > button:nth-of-type(2)',
      structuralPath: 'html > body:nth-of-type(1) > main:nth-of-type(1) > button:nth-of-type(2)',
    }),
  ]);

  const diff = diffLayoutCaptures(before, after);
  const summary = summarizeLayoutDiff(diff);

  assert.equal(diff.verdict, 'noChange');
  assert.equal(diff.changeCount, 0);
  assert.match(summary.text, /^noChange:/);
});

test('layout summary includes source location for geometry changes', () => {
  const before = capture('layout_before', [element()]);
  const after = capture('layout_after', [
    element({
      rect: {
        ...baseRect,
        y: 90,
        top: 90,
        bottom: 130,
      },
    }),
  ]);

  const diff = diffLayoutCaptures(before, after);
  const summary = summarizeLayoutDiff(diff);

  assert.equal(diff.verdict, 'changed');
  assert.equal(summary.verdict, 'changed');
  assert.equal(summary.topChanges[0]?.source, 'src/App.tsx:42');
  assert.match(summary.text, /desktop: geometry/);
  assert.match(summary.text, /src\/App\.tsx:42/);
});

test('layout diff reports text changes on matched elements', () => {
  const before = capture('layout_before', [element()]);
  const after = capture('layout_after', [
    element({
      text: 'Submit order',
      accessibleName: 'Submit order',
      fallbackKey: 'button|button|',
    }),
  ]);

  const diff = diffLayoutCaptures(before, after);

  assert.equal(diff.verdict, 'changed');
  assert.equal(diff.devices[0]?.changes[0]?.type, 'text');
  assert.match(diff.devices[0]?.changes[0]?.details ?? '', /Save changes/);
  assert.match(diff.devices[0]?.changes[0]?.details ?? '', /Submit order/);
});

test('layout diff does not parse pipe-delimited fallback keys as identity', () => {
  const before = capture('layout_before', [
    element({
      selector: 'html > body > div:nth-of-type(1) > button:nth-of-type(1)',
      selectorStability: 'structural',
      fallbackKey: 'button|button|save|primary',
      structuralPath: 'html > body:nth-of-type(1) > div:nth-of-type(1) > button:nth-of-type(1)',
      attributes: {
        id: null,
        className: 'jsx-12345678 primary',
        testId: 'save|primary',
        ariaLabel: null,
        name: null,
        href: null,
        type: 'button',
      },
    }),
  ]);
  const after = capture('layout_after', [
    element({
      selector: 'html > body > main:nth-of-type(1) > button:nth-of-type(1)',
      selectorStability: 'structural',
      fallbackKey: 'button|button|save|secondary',
      structuralPath: 'html > body:nth-of-type(1) > main:nth-of-type(1) > button:nth-of-type(1)',
      attributes: {
        id: null,
        className: 'jsx-87654321 primary',
        testId: 'save|secondary',
        ariaLabel: null,
        name: null,
        href: null,
        type: 'button',
      },
    }),
  ]);

  const diff = diffLayoutCaptures(before, after);

  assert.equal(diff.verdict, 'changed');
  assert.equal(diff.changeCount, 2);
  assert.deepEqual(
    diff.devices[0]?.changes.map(change => change.type).sort(),
    ['added', 'removed'],
  );
});

test('layout diff treats device coverage changes as inconclusive', () => {
  const before = {
    ...capture('layout_before', [element()]),
    devices: [
      deviceCapture([element()]),
      {
        ...deviceCapture([element({ key: 'button|mobile' })]),
        device: {
          id: 'iphone-14',
          name: 'iPhone 14',
          type: 'mobile' as const,
          width: 390,
          height: 844,
        },
      },
    ],
  };
  const after = capture('layout_after', [element()]);

  const diff = diffLayoutCaptures(before, after);

  assert.equal(diff.verdict, 'inconclusive');
  assert.equal(diff.coverageChanged, true);
  assert.match(diff.warnings.join('\n'), /Device missing/);
});
