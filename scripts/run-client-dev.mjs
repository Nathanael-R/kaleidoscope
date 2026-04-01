import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const clientRoot = resolve(workspaceRoot, 'mosaic-client');
const require = createRequire(import.meta.url);
const vitePackageJson = require.resolve('vite/package.json', { paths: [clientRoot, workspaceRoot] });
const viteEntry = resolve(dirname(vitePackageJson), 'bin', 'vite.js');

function parsePortArg(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--port') {
      return argv[index + 1] ?? null;
    }

    if (arg.startsWith('--port=')) {
      return arg.slice('--port='.length);
    }

    if (/^\d+$/.test(arg)) {
      return arg;
    }
  }

  return null;
}

function resolveRequestedPort() {
  const fromArgs = parsePortArg(process.argv.slice(2));
  const npmConfigPort = process.env.npm_config_port;
  const candidate = fromArgs
    ?? (npmConfigPort && npmConfigPort !== 'true' ? npmConfigPort : null)
    ?? process.env.KALEIDOSCOPE_CLIENT_PORT
    ?? null;
  if (!candidate) {
    return null;
  }

  const port = Number.parseInt(candidate, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid client port: ${candidate}`);
  }

  return port;
}

const requestedPort = resolveRequestedPort();
const viteArgs = ['--host', '0.0.0.0'];

if (requestedPort !== null) {
  viteArgs.push('--port', String(requestedPort), '--strictPort');
}

const child = spawn(process.execPath, [viteEntry, ...viteArgs], {
  cwd: clientRoot,
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});