import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isKaleidoscopeClientHtml, resolveLocalBinCommand } from './process-manager.js';

test('isKaleidoscopeClientHtml recognizes Kaleidoscope shell html', () => {
  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '  <head>',
    '    <title>Kaleidoscope</title>',
    '  </head>',
    '  <body>',
    '    <div id="root"></div>',
    '  </body>',
    '</html>',
  ].join('\n');

  assert.equal(isKaleidoscopeClientHtml(html), true);
});

test('isKaleidoscopeClientHtml rejects unrelated app html', () => {
  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '  <head>',
    '    <title>Other App</title>',
    '  </head>',
    '  <body>',
    '    <div id="app"></div>',
    '  </body>',
    '</html>',
  ].join('\n');

  assert.equal(isKaleidoscopeClientHtml(html), false);
});

test('resolveLocalBinCommand prefers locally installed binaries over npx-style PATH lookup', () => {
  const tempDir = join(tmpdir(), `kaleidoscope-bin-${Date.now()}`);
  const binDir = join(tempDir, 'node_modules', '.bin');
  mkdirSync(binDir, { recursive: true });

  const binFile = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const binPath = join(binDir, binFile);
  writeFileSync(binPath, '', 'utf8');

  try {
    const resolved = resolveLocalBinCommand('tsx', ['index.ts'], tempDir);
    assert.equal(resolved.command, binPath);
    assert.deepEqual(resolved.args, ['index.ts']);
    assert.equal(resolved.shell, process.platform === 'win32');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveLocalBinCommand falls back to PATH lookup when no local binary exists', () => {
  const tempDir = join(tmpdir(), `kaleidoscope-empty-bin-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  try {
    const resolved = resolveLocalBinCommand('definitely-not-installed-kaleidoscope-bin', ['--version'], tempDir);
    assert.equal(resolved.command, 'definitely-not-installed-kaleidoscope-bin');
    assert.deepEqual(resolved.args, ['--version']);
    assert.equal(resolved.shell, process.platform === 'win32');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
