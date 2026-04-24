import test from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdownImagePath, toMarkdownImageTag } from './tool-utils.js';

test('toMarkdownImagePath supports absolute local paths across operating systems', () => {
  assert.equal(
    toMarkdownImagePath('C:\\Users\\HP\\screenshots\\desktop.png'),
    'C:/Users/HP/screenshots/desktop.png',
  );
  assert.equal(
    toMarkdownImagePath('/Users/hp/screenshots/desktop.png'),
    '/Users/hp/screenshots/desktop.png',
  );
  assert.equal(
    toMarkdownImagePath('/home/hp/screenshots/desktop.png'),
    '/home/hp/screenshots/desktop.png',
  );
  assert.equal(
    toMarkdownImagePath('\\\\server\\share\\screenshots\\desktop.png'),
    '//server/share/screenshots/desktop.png',
  );
});

test('toMarkdownImagePath rejects relative paths', () => {
  assert.equal(toMarkdownImagePath('./screenshots/desktop.png'), null);
  assert.equal(toMarkdownImagePath('screenshots\\desktop.png'), null);
});

test('toMarkdownImageTag produces a copy-paste-ready markdown image', () => {
  assert.equal(
    toMarkdownImageTag('/tmp/screenshots/desktop.png', 'Desktop preview'),
    '![Desktop preview](</tmp/screenshots/desktop.png>)',
  );
  assert.equal(
    toMarkdownImageTag('C:\\Users\\HP\\screenshots\\desktop.png', 'Desktop preview'),
    '![Desktop preview](<C:/Users/HP/screenshots/desktop.png>)',
  );
});
