import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { normalizeLayoutSourceLocation } from './layout-capture.service.js';

const source = (filePath: string) => ({
  filePath,
  lineNumber: 10,
  columnNumber: 2,
  componentName: 'Card',
});

test('layout source normalization keeps only paths inside sourceDir', () => {
  const sourceDir = join(process.cwd(), 'src');
  assert.deepEqual(normalizeLayoutSourceLocation(source(join(sourceDir, 'Card.tsx')), sourceDir), {
    filePath: 'Card.tsx',
    lineNumber: 10,
    columnNumber: 2,
    componentName: 'Card',
  });
  assert.equal(
    normalizeLayoutSourceLocation(source(join(process.cwd(), 'secrets', 'token.ts')), sourceDir),
    null,
  );
});

test('layout source normalization redacts unscoped absolute paths', () => {
  const result = normalizeLayoutSourceLocation(source(join(process.cwd(), 'src', 'Card.tsx')));
  assert.equal(result?.filePath, 'Card.tsx');
});
