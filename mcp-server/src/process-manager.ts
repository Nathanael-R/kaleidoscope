import { createServer } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KALEIDOSCOPE_SERVER } from './kaleidoscope-api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PROJECT_ROOT = resolve(__dirname, '..', '..');
const DIST_PROJECT_ROOT = resolve(__dirname, '..', '..', '..');
const DEFAULT_CLIENT_PORTS = [5173, 5174, 4173];
const KALEIDOSCOPE_CLIENT_TITLE = '<title>Kaleidoscope</title>';
const KALEIDOSCOPE_CLIENT_ROOT = '<div id="root"></div>';
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
const IS_WINDOWS = process.platform === 'win32';
const PACKAGED_APP_ROOT_CANDIDATE = resolve(__dirname, 'app');

function hasKaleidoscopeAppSource(projectRoot: string): boolean {
  return (
    existsSync(resolve(projectRoot, 'server', 'index.ts'))
    && existsSync(resolve(projectRoot, 'mosaic-client', 'package.json'))
  );
}

function resolveProjectRoot(): string | null {
  if (hasKaleidoscopeAppSource(SOURCE_PROJECT_ROOT)) {
    return SOURCE_PROJECT_ROOT;
  }

  if (hasKaleidoscopeAppSource(DIST_PROJECT_ROOT)) {
    return DIST_PROJECT_ROOT;
  }

  return null;
}

const PROJECT_ROOT = resolveProjectRoot();

function hasPackagedAppRuntime(appRoot: string): boolean {
  return (
    existsSync(resolve(appRoot, 'server', 'index.js'))
    && existsSync(resolve(appRoot, 'public', 'index.html'))
  );
}

const PACKAGED_APP_ROOT = hasPackagedAppRuntime(PACKAGED_APP_ROOT_CANDIDATE)
  ? PACKAGED_APP_ROOT_CANDIDATE
  : null;

function shouldUsePackagedAppRuntime(): boolean {
  return PROJECT_ROOT === null && PACKAGED_APP_ROOT !== null;
}

function requireProjectRoot(): string {
  if (PROJECT_ROOT) {
    return PROJECT_ROOT;
  }

  throw new Error(
    'Kaleidoscope cannot auto-start local services because neither app source directories nor a packaged app runtime were found next to this MCP server. ' +
    'Reinstall the kaleidoscope-mcp-server npm package, or start the Kaleidoscope app manually and set KALEIDOSCOPE_SERVER_URL to that running server.',
  );
}

function requirePackagedAppRoot(): string {
  if (PACKAGED_APP_ROOT) {
    return PACKAGED_APP_ROOT;
  }

  throw new Error(
    'Kaleidoscope cannot auto-start from npm because the packaged app runtime is missing. ' +
    'Reinstall the kaleidoscope-mcp-server npm package, or start the Kaleidoscope app manually and set KALEIDOSCOPE_SERVER_URL to that running server.',
  );
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return LOOPBACK_HOSTNAMES.has(normalized) || normalized.endsWith('.localhost');
}

export function isKaleidoscopeClientHtml(html: string): boolean {
  return html.includes(KALEIDOSCOPE_CLIENT_TITLE) && html.includes(KALEIDOSCOPE_CLIENT_ROOT);
}

export interface ResolvedSpawnCommand {
  command: string;
  args: string[];
  shell: boolean;
}

function windowsShellCommand(command: string, args: string[]): ResolvedSpawnCommand {
  return {
    command,
    args,
    shell: true,
  };
}

function resolveWindowsCmdShim(command: string, args: string[]): ResolvedSpawnCommand | null {
  if (!IS_WINDOWS || !command.toLowerCase().endsWith('.cmd')) {
    return null;
  }

  let shimContents: string;
  try {
    shimContents = readFileSync(command, 'utf8');
  } catch {
    return null;
  }

  const match = shimContents.match(/"%_prog%"\s+"%dp0%\\([^"]+)"\s+%\*/i);
  if (!match) {
    return null;
  }

  const binEntryPoint = resolve(dirname(command), match[1]);
  if (!existsSync(binEntryPoint)) {
    return null;
  }

  return {
    command: process.execPath,
    args: [binEntryPoint, ...args],
    shell: false,
  };
}

export function resolveLocalBinCommand(
  binName: string,
  args: string[],
  cwd: string,
): ResolvedSpawnCommand {
  const executableNames = IS_WINDOWS
    ? [`${binName}.cmd`, `${binName}.exe`, binName]
    : [binName];
  const binDirs = [
    join(cwd, 'node_modules', '.bin'),
    ...(PROJECT_ROOT
      ? [
        join(PROJECT_ROOT, 'node_modules', '.bin'),
        join(PROJECT_ROOT, 'mcp-server', 'node_modules', '.bin'),
      ]
      : []),
  ];

  for (const binDir of binDirs) {
    for (const executableName of executableNames) {
      const candidate = join(binDir, executableName);
      if (!existsSync(candidate)) {
        continue;
      }

      const resolvedCmdShim = resolveWindowsCmdShim(candidate, args);
      if (resolvedCmdShim) {
        return resolvedCmdShim;
      }

      if (IS_WINDOWS && candidate.toLowerCase().endsWith('.cmd')) {
        return windowsShellCommand(candidate, args);
      }

      return {
        command: candidate,
        args,
        shell: false,
      };
    }
  }

  if (IS_WINDOWS) {
    return windowsShellCommand(binName, args);
  }

  return {
    command: binName,
    args,
    shell: false,
  };
}

function appendNodeBinPath(env: NodeJS.ProcessEnv, ...roots: string[]): NodeJS.ProcessEnv {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const binPaths = roots.map((root) => join(root, 'node_modules', '.bin'));
  const currentPath = env[pathKey];
  return {
    ...env,
    [pathKey]: [binPaths, currentPath].flat().filter(Boolean).join(IS_WINDOWS ? ';' : ':'),
  };
}

export interface ServiceStatus {
  running: boolean;
  pid?: number;
  port?: number;
  url?: string;
}

export interface KaleidoscopeStatus {
  client: ServiceStatus;
  server: ServiceStatus;
}

class ProcessManager {
  private clientProcess: ChildProcess | null = null;
  private serverProcess: ChildProcess | null = null;
  private clientPort = this.getPreferredClientPorts()[0] ?? 5173;
  private readonly serverUrl = new URL(KALEIDOSCOPE_SERVER);
  private readonly serverCanBeManagedLocally = (
    this.serverUrl.protocol === 'http:'
    && isLoopbackHostname(this.serverUrl.hostname)
  );
  private serverPort = Number.parseInt(this.serverUrl.port, 10)
    || (this.serverUrl.protocol === 'https:' ? 443 : 80);
  private serverLogTail = '';
  private clientLogTail = '';

  private getPreferredClientPorts(): number[] {
    const envPort = Number.parseInt(process.env.KALEIDOSCOPE_CLIENT_PORT ?? '', 10);
    const ports = Number.isInteger(envPort) && envPort > 0 && envPort <= 65535
      ? [envPort, ...DEFAULT_CLIENT_PORTS]
      : [...DEFAULT_CLIENT_PORTS];

    return Array.from(new Set(ports));
  }

  private async isReachable(url: string): Promise<boolean> {
    try {
      const res = await fetch(url);
      return res.ok || res.status < 500;
    } catch {
      return false;
    }
  }

  private async isKaleidoscopeClientReachable(port: number): Promise<boolean> {
    return this.isKaleidoscopeClientReachableAtUrl(`http://localhost:${port}/`);
  }

  private async isKaleidoscopeClientReachableAtUrl(url: string): Promise<boolean> {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return false;
      }

      const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.includes('text/html')) {
        return false;
      }

      const html = await res.text();
      return isKaleidoscopeClientHtml(html);
    } catch {
      return false;
    }
  }

  private async findReachableClientPort(): Promise<number | null> {
    const ports = Array.from(new Set([this.clientPort, ...this.getPreferredClientPorts()]));

    for (const port of ports) {
      if (await this.isKaleidoscopeClientReachable(port)) {
        return port;
      }
    }

    return null;
  }

  private getPackagedClientUrl(): string {
    return new URL('/', this.serverUrl).toString().replace(/\/$/, '');
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolveAvailability) => {
      const tester = createServer();

      tester.once('error', () => {
        resolveAvailability(false);
      });

      tester.once('listening', () => {
        tester.close(() => resolveAvailability(true));
      });

      tester.listen(port);
    });
  }

  private getEphemeralPort(): Promise<number> {
    return new Promise((resolvePort, reject) => {
      const tester = createServer();

      tester.once('error', reject);
      tester.once('listening', () => {
        const address = tester.address();
        if (!address || typeof address === 'string') {
          tester.close(() => reject(new Error('Failed to allocate a client port.')));
          return;
        }

        tester.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolvePort(address.port);
        });
      });

      tester.listen(0);
    });
  }

  private async resolveClientPort(): Promise<number> {
    const reachablePort = await this.findReachableClientPort();
    if (reachablePort !== null) {
      return reachablePort;
    }

    for (const port of this.getPreferredClientPorts()) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }

    return this.getEphemeralPort();
  }

  private appendLogTail(target: 'server' | 'client', chunk: string): void {
    const maxChars = 4000;
    const current = target === 'server' ? this.serverLogTail : this.clientLogTail;
    const next = (current + chunk).slice(-maxChars);
    if (target === 'server') {
      this.serverLogTail = next;
      return;
    }
    this.clientLogTail = next;
  }

  private formatStartupError(
    serviceName: 'server' | 'client',
    port: number,
    reason: string,
    processRef: ChildProcess | null,
    logTail: string,
  ): Error {
    const pid = processRef?.pid;
    const exitCode = processRef?.exitCode;
    const signal = processRef?.signalCode;
    const diagnostics = [
      `Failed to start Kaleidoscope ${serviceName} on port ${port}.`,
      `Reason: ${reason}`,
      `PID: ${pid ?? 'n/a'}`,
      `Exit code: ${exitCode ?? 'n/a'}`,
      `Signal: ${signal ?? 'n/a'}`,
      logTail ? `Recent ${serviceName} logs:\n${logTail.trim()}` : `Recent ${serviceName} logs: n/a`,
    ].join('\n');

    return new Error(diagnostics);
  }

  async getStatus(): Promise<KaleidoscopeStatus> {
    const serverReachable = await this.isServerReachable();
    const usePackagedRuntime = shouldUsePackagedAppRuntime();
    const packagedClientReachable = usePackagedRuntime
      ? await this.isKaleidoscopeClientReachableAtUrl(this.getPackagedClientUrl())
      : false;
    const reachableClientPort = usePackagedRuntime ? null : await this.findReachableClientPort();
    const clientPort = usePackagedRuntime
      ? this.serverPort
      : reachableClientPort ?? this.clientPort;

    return {
      client: {
        running:
          (this.clientProcess !== null && this.clientProcess.exitCode === null)
          || reachableClientPort !== null
          || packagedClientReachable,
        pid: this.clientProcess?.pid,
        port: clientPort,
        url: usePackagedRuntime ? this.getPackagedClientUrl() : `http://localhost:${clientPort}`,
      },
      server: {
        running: (this.serverProcess !== null && this.serverProcess.exitCode === null) || serverReachable,
        pid: this.serverProcess?.pid,
        port: this.serverCanBeManagedLocally ? this.serverPort : undefined,
        url: this.serverUrl.toString().replace(/\/$/, ''),
      },
    };
  }

  async isServerReachable(): Promise<boolean> {
    return this.isReachable(new URL('/api/health', this.serverUrl).toString());
  }

  async startServer(): Promise<void> {
    if (await this.isServerReachable()) {
      return; // Already running
    }

    if (!this.serverCanBeManagedLocally) {
      throw new Error(
        `Configured Kaleidoscope server ${this.serverUrl.toString()} is not reachable and cannot be started automatically because it is not a local loopback URL.`,
      );
    }

    this.serverLogTail = '';
    let spawnErrorMessage: string | null = null;

    const packagedAppRoot = shouldUsePackagedAppRuntime() ? requirePackagedAppRoot() : null;
    let serverCwd: string;
    let serverCommand: ResolvedSpawnCommand;
    let nodeBinRoots: string[];

    if (packagedAppRoot) {
      serverCwd = resolve(packagedAppRoot, 'server');
      serverCommand = {
        command: process.execPath,
        args: [resolve(packagedAppRoot, 'server', 'index.js')],
        shell: false,
      };
      nodeBinRoots = [serverCwd];
    } else {
      const projectRoot = requireProjectRoot();
      serverCwd = resolve(projectRoot, 'server');
      serverCommand = resolveLocalBinCommand('tsx', ['index.ts'], serverCwd);
      nodeBinRoots = [serverCwd, projectRoot, resolve(projectRoot, 'mcp-server')];
    }

    const serverOrigin = new URL('/', this.serverUrl).toString().replace(/\/$/, '');

    this.serverProcess = spawn(serverCommand.command, serverCommand.args, {
      cwd: serverCwd,
      env: appendNodeBinPath(
        {
          ...process.env,
          PORT: String(this.serverPort),
          NODE_ENV: packagedAppRoot ? 'production' : 'development',
          ...(packagedAppRoot
            ? {
              CORS_ORIGIN: process.env.CORS_ORIGIN ?? serverOrigin,
              STATIC_DIR: process.env.STATIC_DIR ?? resolve(packagedAppRoot, 'public'),
            }
            : {}),
        },
        ...nodeBinRoots,
      ),
      stdio: 'pipe',
      shell: serverCommand.shell,
      detached: IS_WINDOWS,
    });

    this.serverProcess.on('error', (error: Error) => {
      spawnErrorMessage = error.message;
    });

    this.serverProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString();
      this.appendLogTail('server', msg);
      process.stderr.write(`[kaleidoscope-server] ${msg}`);
    });

    this.serverProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString();
      this.appendLogTail('server', msg);
      if (!msg.includes('ExperimentalWarning')) {
        process.stderr.write(`[kaleidoscope-server] ${msg}`);
      }
    });

    // Wait for server to be ready
    try {
      await this.waitForUrl(new URL('/api/health', this.serverUrl).toString(), 15_000);
    } catch (error) {
      const reason = spawnErrorMessage
        || (error instanceof Error ? error.message : String(error));
      throw this.formatStartupError('server', this.serverPort, reason, this.serverProcess, this.serverLogTail);
    }
  }

  async startClient(): Promise<void> {
    if (shouldUsePackagedAppRuntime()) {
      await this.startServer();
      this.clientPort = this.serverPort;

      try {
        await this.waitForKaleidoscopeClientUrl(this.getPackagedClientUrl(), 10_000);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw this.formatStartupError('client', this.clientPort, reason, this.serverProcess, this.serverLogTail);
      }

      return;
    }

    const reachableClientPort = await this.findReachableClientPort();
    if (reachableClientPort !== null) {
      this.clientPort = reachableClientPort;
      return;
    }

    this.clientPort = await this.resolveClientPort();
    this.clientLogTail = '';
    let spawnErrorMessage: string | null = null;

    const projectRoot = requireProjectRoot();
    const clientCwd = resolve(projectRoot, 'mosaic-client');
    const clientCommand = resolveLocalBinCommand(
      'vite',
      ['--host', '0.0.0.0', '--port', String(this.clientPort), '--strictPort'],
      clientCwd,
    );

    this.clientProcess = spawn(clientCommand.command, clientCommand.args, {
      cwd: clientCwd,
      env: appendNodeBinPath(
        { ...process.env },
        clientCwd,
        projectRoot,
        resolve(projectRoot, 'mcp-server'),
      ),
      stdio: 'pipe',
      shell: clientCommand.shell,
      detached: IS_WINDOWS,
    });

    this.clientProcess.on('error', (error: Error) => {
      spawnErrorMessage = error.message;
    });

    this.clientProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString();
      this.appendLogTail('client', msg);
      process.stderr.write(`[kaleidoscope-client] ${msg}`);
    });

    this.clientProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString();
      this.appendLogTail('client', msg);
      if (!msg.includes('ExperimentalWarning')) {
        process.stderr.write(`[kaleidoscope-client] ${msg}`);
      }
    });

    try {
      await this.waitForUrl(`http://localhost:${this.clientPort}/`, 20_000);
    } catch (error) {
      const reason = spawnErrorMessage
        || (error instanceof Error ? error.message : String(error));
      throw this.formatStartupError('client', this.clientPort, reason, this.clientProcess, this.clientLogTail);
    }
  }

  async startAll(): Promise<KaleidoscopeStatus> {
    await this.startServer();
    await this.startClient();
    return this.getStatus();
  }

  async stopAll(): Promise<void> {
    if (this.clientProcess && this.clientProcess.exitCode === null) {
      this.stopProcessTree(this.clientProcess);
      this.clientProcess = null;
    }
    if (this.serverProcess && this.serverProcess.exitCode === null) {
      this.stopProcessTree(this.serverProcess);
      this.serverProcess = null;
    }
  }

  private stopProcessTree(processRef: ChildProcess): void {
    if (!processRef.pid) {
      return;
    }

    if (IS_WINDOWS) {
      spawn('taskkill', ['/pid', String(processRef.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    }

    try {
      process.kill(-processRef.pid, 'SIGTERM');
    } catch {
      processRef.kill('SIGTERM');
    }
  }

  private waitForUrl(url: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = async () => {
        try {
          const res = await fetch(url);
          if (res.ok || res.status < 500) {
            resolve();
            return;
          }
        } catch {
          // not ready yet
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for ${url}`));
          return;
        }
        setTimeout(check, 500);
      };
      check();
    });
  }

  private waitForKaleidoscopeClientUrl(url: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = async () => {
        if (await this.isKaleidoscopeClientReachableAtUrl(url)) {
          resolve();
          return;
        }

        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for Kaleidoscope client at ${url}`));
          return;
        }
        setTimeout(check, 500);
      };
      check();
    });
  }
}

export const processManager = new ProcessManager();

// Cleanup on exit
process.on('SIGINT', async () => {
  await processManager.stopAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await processManager.stopAll();
  process.exit(0);
});
