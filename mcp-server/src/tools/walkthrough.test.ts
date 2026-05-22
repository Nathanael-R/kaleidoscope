import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  parseWalkthroughScript,
  resolveWalkthroughOutputDir,
  sanitizeWalkthroughFileStem,
  scaleRecordingSize,
  summarizeWalkthroughStep,
} from './walkthrough.js';

test('sanitizeWalkthroughFileStem creates stable file-friendly names', () => {
  assert.equal(sanitizeWalkthroughFileStem('Signup Flow Demo'), 'signup-flow-demo');
  assert.equal(sanitizeWalkthroughFileStem('  Feature / QA Walkthrough  '), 'feature-qa-walkthrough');
  assert.equal(sanitizeWalkthroughFileStem('!!!'), 'walkthrough');
});

test('scaleRecordingSize preserves aspect ratio while capping large videos', () => {
  assert.deepEqual(scaleRecordingSize(390, 844), { width: 390, height: 844 });
  assert.deepEqual(scaleRecordingSize(1920, 1080), { width: 1280, height: 720 });
  assert.deepEqual(scaleRecordingSize(1080, 1920), { width: 720, height: 1280 });
});

test('summarizeWalkthroughStep renders readable action summaries', () => {
  assert.equal(
    summarizeWalkthroughStep({ action: 'click', selector: '#save' }),
    'click #save',
  );
  assert.equal(
    summarizeWalkthroughStep({ action: 'type', selector: '#email', text: 'hello@example.com' }),
    'type "hello@example.com" into #email',
  );
  assert.equal(
    summarizeWalkthroughStep({ action: 'scroll', deltaY: 640 }),
    'scroll by (0, 640)',
  );
});

test('parseWalkthroughScript supports a simple natural-language step format', () => {
  const steps = parseWalkthroughScript(`
    click #open-settings
    type "hello@example.com" into #email
    wait 1.2s
    scroll down 500
    select "dark" in #theme
    press Enter
  `);

  assert.deepEqual(steps, [
    { action: 'click', selector: '#open-settings' },
    { action: 'type', text: 'hello@example.com', selector: '#email' },
    { action: 'wait', ms: 1200 },
    { action: 'scroll', deltaY: 500 },
    { action: 'select', value: 'dark', selector: '#theme' },
    { action: 'press', key: 'Enter' },
  ]);
});

test('parseWalkthroughScript rejects unsupported lines', () => {
  assert.throws(
    () => parseWalkthroughScript('drag #card to #dropzone'),
    /Could not parse walkthrough script line 1/i,
  );
});

test('resolveWalkthroughOutputDir prefers explicit input, then env, then default', () => {
  const previous = process.env.KALEIDOSCOPE_WALKTHROUGH_DIR;
  const previousArtifactRoot = process.env.KALEIDOSCOPE_ARTIFACT_ROOT;
  const artifactRoot = mkdtempSync(path.join(tmpdir(), 'walkthrough-artifacts-'));

  try {
    delete process.env.KALEIDOSCOPE_WALKTHROUGH_DIR;
    process.env.KALEIDOSCOPE_ARTIFACT_ROOT = artifactRoot;
    assert.equal(resolveWalkthroughOutputDir(undefined), path.join(artifactRoot, 'walkthroughs'));

    const configuredRoot = path.join(artifactRoot, 'configured-walkthroughs');
    process.env.KALEIDOSCOPE_WALKTHROUGH_DIR = configuredRoot;
    delete process.env.KALEIDOSCOPE_ARTIFACT_ROOT;
    assert.equal(resolveWalkthroughOutputDir(undefined), configuredRoot);
    assert.equal(resolveWalkthroughOutputDir('explicit-walkthroughs'), path.join(configuredRoot, 'explicit-walkthroughs'));
    assert.equal(resolveWalkthroughOutputDir(undefined, 'inspection'), path.join(tmpdir(), 'kaleidoscope-walkthroughs'));
    assert.equal(resolveWalkthroughOutputDir('explicit-inspection', 'inspection'), path.join(tmpdir(), 'explicit-inspection'));
    assert.throws(() => resolveWalkthroughOutputDir('../escape'), /output_dir must be a safe directory path/i);
  } finally {
    if (previous === undefined) {
      delete process.env.KALEIDOSCOPE_WALKTHROUGH_DIR;
    } else {
      process.env.KALEIDOSCOPE_WALKTHROUGH_DIR = previous;
    }

    if (previousArtifactRoot === undefined) {
      delete process.env.KALEIDOSCOPE_ARTIFACT_ROOT;
    } else {
      process.env.KALEIDOSCOPE_ARTIFACT_ROOT = previousArtifactRoot;
    }

    rmSync(artifactRoot, { recursive: true, force: true });
  }
});
