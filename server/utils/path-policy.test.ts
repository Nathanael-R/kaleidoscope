import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ARTIFACT_ROOT_ENV,
  WORKSPACE_ROOT_ENV,
  isPathInside,
  resolveBoundedPath,
  resolveSourceDirectory,
} from './path-policy.js';

test('isPathInside allows the root and descendants only', () => {
  const root = path.join(tmpdir(), 'kaleidoscope-root');
  assert.equal(isPathInside(root, root), true);
  assert.equal(isPathInside(root, path.join(root, 'src', 'App.tsx')), true);
  assert.equal(isPathInside(root, path.join(root, '..', 'secret.txt')), false);
});

test('resolveBoundedPath rejects traversal and outside absolute paths', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'path-policy-'));

  try {
    const inside = resolveBoundedPath('screenshots/run', { root, label: 'output_dir' });
    assert.equal(inside.ok, true);
    assert.equal(inside.path, path.join(root, 'screenshots', 'run'));

    assert.equal(resolveBoundedPath('../secret', { root, label: 'output_dir' }).ok, false);
    assert.equal(resolveBoundedPath(path.join(root, '..', 'secret'), { root, label: 'output_dir' }).ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveSourceDirectory uses KALEIDOSCOPE_WORKSPACE_ROOT boundary', () => {
  const previousWorkspaceRoot = process.env[WORKSPACE_ROOT_ENV];
  const previousArtifactRoot = process.env[ARTIFACT_ROOT_ENV];
  const root = mkdtempSync(path.join(tmpdir(), 'source-root-'));
  const project = path.join(root, 'project');
  const outside = mkdtempSync(path.join(tmpdir(), 'source-outside-'));

  mkdirSync(project, { recursive: true });
  process.env[WORKSPACE_ROOT_ENV] = root;

  try {
    assert.equal(resolveSourceDirectory(project).ok, true);
    assert.equal(resolveSourceDirectory(outside).ok, false);
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env[WORKSPACE_ROOT_ENV];
    } else {
      process.env[WORKSPACE_ROOT_ENV] = previousWorkspaceRoot;
    }

    if (previousArtifactRoot === undefined) {
      delete process.env[ARTIFACT_ROOT_ENV];
    } else {
      process.env[ARTIFACT_ROOT_ENV] = previousArtifactRoot;
    }

    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

