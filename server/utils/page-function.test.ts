import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { toPageFunction } from './page-function.js';

function pageFunctionWithNestedNames(label: string) {
  const describe = (value: string) => `${value}:${describe.name}`;
  function upper(value: string) {
    return value.toUpperCase();
  }
  return upper(describe(label));
}

test('page functions survive serialization without the bundler __name helper', () => {
  const serialized = `(${String(toPageFunction(pageFunctionWithNestedNames))})('card')`;
  assert.equal(runInNewContext(serialized, {}), 'CARD:DESCRIBE');
});
