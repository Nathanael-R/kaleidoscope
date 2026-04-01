import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const serverCommand = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : npmCommand;
const serverArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npm run dev:server']
  : ['run', 'dev:server'];

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

function prefixPipe(stream, label) {
  if (!stream) {
    return;
  }

  stream.on('data', (chunk) => {
    const text = chunk.toString();
    const lines = text.split(/\r?\n/);
    const trailingNewline = /\r?\n$/.test(text);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line && index === lines.length - 1 && trailingNewline) {
        continue;
      }

      process.stdout.write(`[${label}] ${line}\n`);
    }
  });
}

const client = spawn(
  process.execPath,
  [resolve(workspaceRoot, 'scripts', 'run-client-dev.mjs'), ...(requestedPort !== null ? [String(requestedPort)] : [])],
  {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      ...(requestedPort !== null ? { KALEIDOSCOPE_CLIENT_PORT: String(requestedPort) } : {}),
    },
    stdio: ['inherit', 'pipe', 'pipe'],
  },
);

const server = spawn(
  serverCommand,
  serverArgs,
  {
    cwd: workspaceRoot,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  },
);

prefixPipe(client.stdout, 'client');
prefixPipe(client.stderr, 'client');
prefixPipe(server.stdout, 'server');
prefixPipe(server.stderr, 'server');

let shuttingDown = false;

function shutdownChildren() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  if (client.exitCode === null) {
    client.kill('SIGTERM');
  }
  if (server.exitCode === null) {
    server.kill('SIGTERM');
  }
}

function handleChildExit(label, code, signal) {
  if (!shuttingDown) {
    shutdownChildren();
  }

  const exitCode = code ?? (signal ? 1 : 0);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }

  if (client.exitCode !== null && server.exitCode !== null) {
    process.exit(process.exitCode ?? 0);
  }
}

client.on('exit', (code, signal) => handleChildExit('client', code, signal));
server.on('exit', (code, signal) => handleChildExit('server', code, signal));

client.on('error', (error) => {
  console.error(error);
  shutdownChildren();
  process.exit(1);
});

server.on('error', (error) => {
  console.error(error);
  shutdownChildren();
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdownChildren();
  });
}