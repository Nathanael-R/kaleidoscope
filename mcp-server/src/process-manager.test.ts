import test from 'node:test';
import assert from 'node:assert/strict';
import { isKaleidoscopeClientHtml } from './process-manager.js';

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