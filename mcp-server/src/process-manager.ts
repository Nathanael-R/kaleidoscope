import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

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
  private clientPort = 5173;
  private serverPort = 5000;
  private serverLogTail = '';
  private clientLogTail = '';

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
    return {
      client: {
        running: this.clientProcess !== null && this.clientProcess.exitCode === null,
        pid: this.clientProcess?.pid,
        port: this.clientPort,
        url: `http://localhost:${this.clientPort}`,
      },
      server: {
        running: this.serverProcess !== null && this.serverProcess.exitCode === null,
        pid: this.serverProcess?.pid,
        port: this.serverPort,
        url: `http://localhost:${this.serverPort}`,
      },
    };
  }

  async isServerReachable(): Promise<boolean> {
    try {
      const res = await fetch(`http://localhost:${this.serverPort}/api/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async startServer(): Promise<void> {
    if (await this.isServerReachable()) {
      return; // Already running
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
      await this.waitForServer(this.serverPort, 15_000, '/api/health');
    } catch (error) {
      const reason = spawnErrorMessage
        || (error instanceof Error ? error.message : String(error));
      throw this.formatStartupError('server', this.serverPort, reason, this.serverProcess, this.serverLogTail);
    }
  }

  async startClient(): Promise<void> {
    try {
      const res = await fetch(`http://localhost:${this.clientPort}`);
      if (res.ok) return; // Already running
    } catch {
      // not running, start it
    }

    this.clientLogTail = '';
    let spawnErrorMessage: string | null = null;

    this.clientProcess = spawn('npx', ['vite', '--port', String(this.clientPort)], {
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
      await this.waitForServer(this.clientPort, 20_000);
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

  private waitForServer(port: number, timeoutMs: number, path: string = '/'): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = async () => {
        try {
          const res = await fetch(`http://localhost:${port}${path}`);
          if (res.ok || res.status < 500) {
            resolve();
            return;
          }
        } catch {
          // not ready yet
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for server on port ${port}`));
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
