import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedVersion: string | null = null;

export function resolveServerVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = path.join(dir, 'package.json');
    try {
      if (existsSync(candidate)) {
        const pkg = createRequire(import.meta.url)(candidate) as { version?: unknown };
        if (typeof pkg.version === 'string' && pkg.version.trim()) {
          cachedVersion = pkg.version.trim();
          return cachedVersion;
        }
      }
    } catch {
      // Keep walking up.
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  cachedVersion = 'unknown';
  return cachedVersion;
}
