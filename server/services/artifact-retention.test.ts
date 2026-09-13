import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageExpiresAt, pruneExpiredImages, registerImageExpiry, startImageExpiryCleanup } from '../../shared/artifact-retention.js';

async function waitForRemoval(file: string) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      await readFile(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail('The cleanup timer did not remove the expired file.');
}

test('expiry deletes only managed expired images, including nested captures, and never follows junctions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kaleidoscope-retention-'));
  const outside = await mkdtemp(join(tmpdir(), 'kaleidoscope-retention-outside-'));
  try {
    const nested = join(root, 'capture');
    await mkdir(nested);
    const expired = join(nested, 'expired.png');
    const fresh = join(root, 'fresh.png');
    const retained = join(root, 'retained.png');
    const unrelated = join(root, 'user-image.png');
    const external = join(outside, 'external.png');
    for (const file of [expired, fresh, retained, unrelated, external]) await writeFile(file, 'image');
    await registerImageExpiry(expired, new Date(100).toISOString());
    await registerImageExpiry(fresh, new Date(300).toISOString());
    await registerImageExpiry(retained, null);
    await registerImageExpiry(external, new Date(100).toISOString());
    await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await pruneExpiredImages(root, 200);
    await assert.rejects(readFile(expired), { code: 'ENOENT' });
    for (const file of [fresh, retained, unrelated, external]) assert.equal(await readFile(file, 'utf8'), 'image');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('expiry runs without another capture and survives restarting cleanup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kaleidoscope-expiry-timer-'));
  let stop = () => {};
  try {
    const file = join(root, 'timer.png');
    await writeFile(file, 'image');
    await registerImageExpiry(file, new Date(Date.now() + 75).toISOString());
    stop = startImageExpiryCleanup([root], 15);
    await waitForRemoval(file);
    stop();
    const abandoned = join(root, 'abandoned.png');
    await writeFile(abandoned, 'image');
    await registerImageExpiry(abandoned, new Date(0).toISOString());
    stop = startImageExpiryCleanup([root], 15);
    await waitForRemoval(abandoned);
  } finally {
    stop();
    await rm(root, { recursive: true, force: true });
  }
});

test('retention supports five-minute expiry, explicit duration, and keeping images', () => {
  assert.equal(imageExpiresAt(5, 0), new Date(300_000).toISOString());
  assert.equal(imageExpiresAt(2, 0), new Date(120_000).toISOString());
  assert.equal(imageExpiresAt(0, 0), null);
});
