import { lstat, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXPIRY_SUFFIX = '.kaleidoscope-expiry.json';
export const DEFAULT_IMAGE_RETENTION_MINUTES = 5;

export function imageExpiresAt(retentionMinutes?: number, now = Date.now()): string | null {
  const configured = process.env.KALEIDOSCOPE_IMAGE_RETENTION_MINUTES;
  const minutes = retentionMinutes ?? (configured?.trim() ? Number(configured) : DEFAULT_IMAGE_RETENTION_MINUTES);
  const validMinutes = Number.isFinite(minutes) && minutes >= 0 && minutes <= 10080
    ? minutes : DEFAULT_IMAGE_RETENTION_MINUTES;
  return validMinutes === 0 ? null : new Date(now + validMinutes * 60_000).toISOString();
}

export async function registerImageExpiry(filePath: string, expiresAt: string | null): Promise<void> {
  if (expiresAt !== null && !Number.isFinite(Date.parse(expiresAt))) throw new Error('Invalid image expiry timestamp.');
  // Persist only an expiry beside the owned file, never an arbitrary deletion path.
  await writeFile(`${filePath}${EXPIRY_SUFFIX}`, JSON.stringify({ expiresAt }), { flag: 'wx' });
}

export async function pruneExpiredImages(root: string, now = Date.now()): Promise<void> {
  let entries;
  try {
    if (!(await lstat(root)).isDirectory()) return; // Never follow symlinks/junctions.
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await pruneExpiredImages(entryPath, now);
    } else if (entry.isFile() && entry.name.endsWith(`.png${EXPIRY_SUFFIX}`)) {
      try {
        const metadata: unknown = JSON.parse(await readFile(entryPath, 'utf8'));
        if (typeof metadata !== 'object' || metadata === null || !('expiresAt' in metadata)) continue;
        if (typeof metadata.expiresAt !== 'string' || !(Date.parse(metadata.expiresAt) <= now)) continue;
        const imagePath = entryPath.slice(0, -EXPIRY_SUFFIX.length);
        try {
          // unlink removes only this file (or the link itself), never a target tree.
          await unlink(imagePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        await unlink(entryPath);
      } catch (error) {
        if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
    }
  }
}

export function startImageExpiryCleanup(roots: string[], intervalMs = 10_000): () => void {
  let cleaning = false;
  const clean = async () => {
    if (cleaning) return;
    cleaning = true;
    try {
      const results = await Promise.allSettled(roots.map((root) => pruneExpiredImages(root)));
      for (const result of results) {
        if (result.status === 'rejected') process.stderr.write('Kaleidoscope image cleanup failed; will retry.\n');
      }
    } finally {
      cleaning = false;
    }
  };
  void clean();
  const timer = setInterval(() => { void clean(); }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
