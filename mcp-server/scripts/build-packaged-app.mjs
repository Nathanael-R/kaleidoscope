import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, '..');
const workspaceRoot = resolve(packageRoot, '..');
const serverRoot = resolve(workspaceRoot, 'server');
const clientRoot = resolve(workspaceRoot, 'mosaic-client');
const packagedAppRoot = resolve(packageRoot, 'dist', 'app');

const npmCliCandidates = [
  process.env.npm_execpath,
  process.platform === 'win32'
    ? resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : null,
].filter(Boolean);

const npmCliPath = npmCliCandidates.find((candidate) => existsSync(candidate));
const npmCommand = npmCliPath ? process.execPath : 'npm';

function run(args, cwd) {
  const commandArgs = npmCliPath ? [npmCliPath, ...args] : args;
  const result = spawnSync(npmCommand, commandArgs, {
    cwd,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(['run', 'build'], serverRoot);
run(['run', 'build'], clientRoot);

const serverEntry = resolve(serverRoot, 'dist', 'index.js');
const clientDist = resolve(clientRoot, 'dist');

if (!existsSync(serverEntry)) {
  throw new Error(`Server build output not found: ${serverEntry}`);
}

if (!existsSync(resolve(clientDist, 'index.html'))) {
  throw new Error(`Client build output not found: ${clientDist}`);
}

rmSync(packagedAppRoot, { recursive: true, force: true });
mkdirSync(resolve(packagedAppRoot, 'server'), { recursive: true });

cpSync(serverEntry, resolve(packagedAppRoot, 'server', 'index.js'));
cpSync(clientDist, resolve(packagedAppRoot, 'public'), { recursive: true });

console.log(`Packaged Kaleidoscope app runtime at ${packagedAppRoot}`);
