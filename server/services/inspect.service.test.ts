import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectService } from './inspect.service.js';

test('inspectService prefers exact element-source results when available', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'inspect-exact-'));
  const sourceDir = join(tempDir, 'src');
  const filePath = join(sourceDir, 'App.tsx');

  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(filePath, ['export function App() {', '  return <button id="save">Save</button>;', '}'].join('\n'));

  try {
    const result = inspectService.resolve({
      url: 'http://localhost:3000',
      sourceDir,
      device: {
        id: 'iphone-16',
        name: 'iPhone 16',
        type: 'mobile',
        width: 393,
        height: 852,
      },
      selection: {
        selector: '#save',
        tagName: 'button',
        text: 'Save',
        title: 'Checkout',
        pageUrl: 'http://localhost:3000/checkout',
        elementSource: {
          componentName: 'SaveButton',
          source: {
            filePath: 'src/App.tsx',
            lineNumber: 2,
            columnNumber: 10,
            componentName: 'SaveButton',
          },
          stack: [],
        },
      },
    });

    assert.equal(result.resolver, 'element-source');
    assert.equal(result.confidence, 'exact');
    assert.equal(result.page.title, 'Checkout');
    assert.equal(result.page.url, 'http://localhost:3000/checkout');
    assert.equal(result.device?.name, 'iPhone 16');
    assert.equal(result.source?.filePath, 'src/App.tsx');
    assert.equal(result.source?.code, 'return <button id="save">Save</button>;');
    assert.equal(result.source?.context?.startLine, 1);
    assert.match(result.source?.context?.snippet ?? '', /return <button id="save">Save<\/button>;/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('inspectService falls back to heuristic source matching when exact source is unavailable', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'inspect-likely-'));
  const sourceDir = join(tempDir, 'src');
  const filePath = join(sourceDir, 'Hero.tsx');

  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(filePath, ['export function Hero() {', '  return <section className="hero">Hello</section>;', '}'].join('\n'));

  try {
    const result = inspectService.resolve({
      url: 'http://127.0.0.1:5173',
      sourceDir,
      device: {
        id: 'desktop',
        name: 'Desktop HD',
        type: 'desktop',
        width: 1920,
        height: 1080,
      },
      selection: {
        selector: 'main > section.hero',
        tagName: 'section',
        text: 'Hello',
        title: 'Hero',
        pageUrl: 'http://127.0.0.1:5173/',
        elementSource: null,
      },
    });

    assert.equal(result.resolver, 'heuristic');
    assert.equal(result.confidence, 'likely');
    assert.equal(result.page.title, 'Hero');
    assert.equal(result.device?.id, 'desktop');
    assert.equal(result.source?.filePath, 'Hero.tsx');
    assert.equal(result.source?.code, 'return <section className="hero">Hello</section>;');
    assert.equal(result.source?.context?.focusLine, 2);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});