import { createServer } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KALEIDOSCOPE_SERVER } from './kaleidoscope-api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const DEFAULT_CLIENT_PORTS = [5173, 5174, 4173];
const KALEIDOSCOPE_CLIENT_TITLE = '<title>Kaleidoscope</title>';
const KALEIDOSCOPE_CLIENT_ROOT = '<div id="root"></div>';
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return LOOPBACK_HOSTNAMES.has(normalized) || normalized.endsWith('.localhost');
}

export function isKaleidoscopeClientHtml(html: string): boolean {
  return html.includes(KALEIDOSCOPE_CLIENT_TITLE) && html.includes(KALEIDOSCOPE_CLIENT_ROOT);
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
    try {
      const res = await fetch(`http://localhost:${port}/`);
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
    const reachableClientPort = await this.findReachableClientPort();
    const clientPort = reachableClientPort ?? this.clientPort;
    const serverReachable = await this.isServerReachable();

    return {
      client: {
        running: (this.clientProcess !== null && this.clientProcess.exitCode === null) || reachableClientPort !== null,
        pid: this.clientProcess?.pid,
        port: clientPort,
        url: `http://localhost:${clientPort}`,
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

    this.serverProcess = spawn('npx', ['tsx', 'index.ts'], {
      cwd: resolve(PROJECT_ROOT, 'server'),
      env: { ...process.env, PORT: String(this.serverPort), NODE_ENV: 'development' },
      stdio: 'pipe',
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
    const reachableClientPort = await this.findReachableClientPort();
    if (reachableClientPort !== null) {
      this.clientPort = reachableClientPort;
      return;
    }

    this.clientPort = await this.resolveClientPort();
    this.clientLogTail = '';
    let spawnErrorMessage: string | null = null;

    this.clientProcess = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', String(this.clientPort), '--strictPort'], {
      cwd: resolve(PROJECT_ROOT, 'mosaic-client'),
      env: { ...process.env },
      stdio: 'pipe',
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
      this.clientProcess.kill('SIGTERM');
      this.clientProcess = null;
    }
    if (this.serverProcess && this.serverProcess.exitCode === null) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
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
