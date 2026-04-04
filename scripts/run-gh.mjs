import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function resolveGhBinary() {
  const executable = process.platform === 'win32' ? 'gh.exe' : 'gh';
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);

  for (const entry of pathEntries) {
    const candidate = path.join(entry, executable);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  if (process.platform === 'win32') {
    const windowsCandidates = [
      'C:\\Program Files\\GitHub CLI\\gh.exe',
      'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',
    ];

    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      windowsCandidates.push(path.join(localAppData, 'GitHub CLI', 'gh.exe'));
    }

    return windowsCandidates.find((candidate) => existsSync(candidate)) ?? null;
  }

  return executable;
}

const ghBinary = resolveGhBinary();
if (!ghBinary) {
  console.error(
    'Unable to locate GitHub CLI. Install `gh` or add it to PATH before using this helper.',
  );
  process.exit(1);
}

const result = spawnSync(ghBinary, process.argv.slice(2), {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
