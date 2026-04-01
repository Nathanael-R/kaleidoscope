import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

export interface TunnelInfo {
  url: string;
  provider: TunnelProvider;
  port: number;
  status: 'active' | 'error' | 'closed';
  createdAt: Date;
}

export type TunnelProvider = 'cloudflared' | 'ngrok';

export interface TunnelOptions {
  port: number;
  preferredProvider?: TunnelProvider;
}

type ManagedTunnel = {
  info: TunnelInfo;
  process: ChildProcessByStdio<null, Readable, Readable>;
  close: () => void;
};

const TUNNEL_READY_TIMEOUT_MS = 15_000;

function formatRecentOutput(output: string[]): string {
  const recent = output
    .join('\n')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(-240);

  return recent.length > 0 ? ` Output: ${recent}` : '';
}

function getProviderInstallHelp(provider: TunnelProvider): string {
  switch (provider) {
    case 'cloudflared':
      return 'Install cloudflared from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/';
    case 'ngrok':
      return 'Install ngrok from https://ngrok.com/download';
  }
}

export function extractTunnelUrl(provider: TunnelProvider, line: string): string | null {
  switch (provider) {
    case 'cloudflared':
      return line.match(/https:\/\/[a-z0-9.-]+\.trycloudflare\.com/iu)?.[0] ?? null;
    case 'ngrok':
      return line.match(/https:\/\/[\w.-]*ngrok[\w./-]*/iu)?.[0] ?? null;
  }
}

class TunnelService {
  private activeTunnels: Map<number, TunnelInfo> = new Map();
  private tunnelClosers: Map<number, () => void> = new Map();

  /**
   * Create a tunnel to expose a local port to the internet
   * Tries supported external providers in order: cloudflared → ngrok
   */
  async createTunnel(options: TunnelOptions): Promise<TunnelInfo> {
    const { port } = options;

    // Check if tunnel already exists for this port
    if (this.activeTunnels.has(port)) {
      const existing = this.activeTunnels.get(port)!;
      if (existing.status === 'active') {
        console.log(`Tunnel already exists for port ${port}: ${existing.url}`);
        return existing;
      }
    }

    // Try providers in order
    const providers = this.getProviderOrder(options.preferredProvider);
    const failures: string[] = [];

    for (const provider of providers) {
      try {
        console.log(`Attempting to create tunnel with ${provider}...`);
        const managedTunnel = await this.createWithProvider(provider, port);
        const tunnelInfo = managedTunnel.info;

        this.activeTunnels.set(port, tunnelInfo);
        this.tunnelClosers.set(port, managedTunnel.close);

        managedTunnel.process.once('exit', () => {
          this.tunnelClosers.delete(port);

          const active = this.activeTunnels.get(port);
          if (active?.url === tunnelInfo.url) {
            active.status = 'closed';
          }
        });

        console.log(`✓ Tunnel created successfully: ${tunnelInfo.url}`);

        return tunnelInfo;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${provider}: ${message}`);
        console.warn(`${provider} failed:`, message);
        continue;
      }
    }

    throw new Error(
      'All tunnel providers failed. '
      + failures.join(' ')
    );
  }

  /**
   * Create tunnel with specific provider
   */
  private async createWithProvider(
    provider: TunnelProvider,
    port: number,
  ): Promise<ManagedTunnel> {
    switch (provider) {
      case 'ngrok':
        return await this.createNgrokTunnel(port);

      case 'cloudflared':
        return await this.createCloudflaredTunnel(port);
    }
  }

  /**
   * Create tunnel using cloudflared quick tunnels.
   */
  private async createCloudflaredTunnel(port: number): Promise<ManagedTunnel> {
    return await this.createProcessTunnel({
      provider: 'cloudflared',
      port,
      command: 'cloudflared',
      args: ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'],
    });
  }

  /**
   * Create tunnel using the ngrok CLI.
   */
  private async createNgrokTunnel(port: number): Promise<ManagedTunnel> {
    return await this.createProcessTunnel({
      provider: 'ngrok',
      port,
      command: 'ngrok',
      args: ['http', `http://127.0.0.1:${port}`, '--log', 'stdout', '--log-format', 'json'],
    });
  }

  private async createProcessTunnel(options: {
    provider: TunnelProvider;
    port: number;
    command: string;
    args: string[];
  }): Promise<ManagedTunnel> {
    const { provider, port, command, args } = options;

    return await new Promise<ManagedTunnel>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      const recentOutput: string[] = [];
      let buffer = '';
      let settled = false;

      const close = () => {
        if (child.killed) {
          return;
        }

        child.kill();
      };

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        child.stdout.off('data', onData);
        child.stderr.off('data', onData);
        callback();
      };

      const rejectWithMessage = (message: string) => {
        finish(() => {
          close();
          reject(new Error(message));
        });
      };

      const onLine = (line: string) => {
        const normalized = line.trim();
        if (normalized.length === 0) {
          return;
        }

        recentOutput.push(normalized);
        if (recentOutput.length > 12) {
          recentOutput.shift();
        }

        const url = extractTunnelUrl(provider, normalized);
        if (!url) {
          return;
        }

        const info: TunnelInfo = {
          url,
          provider,
          port,
          status: 'active',
          createdAt: new Date(),
        };

        finish(() => {
          resolve({
            info,
            process: child,
            close,
          });
        });
      };

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          onLine(line);
        }
      };

      const timeout = setTimeout(() => {
        rejectWithMessage(
          `Timed out waiting for ${provider} to return a public URL.${formatRecentOutput(recentOutput)}`,
        );
      }, TUNNEL_READY_TIMEOUT_MS);

      child.stdout.on('data', onData);
      child.stderr.on('data', onData);

      child.once('error', (error) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          rejectWithMessage(`${provider} is not installed. ${getProviderInstallHelp(provider)}`);
          return;
        }

        rejectWithMessage(
          `Failed to start ${provider}: ${error.message}.${formatRecentOutput(recentOutput)}`,
        );
      });

      child.once('exit', (code, signal) => {
        if (settled) {
          return;
        }

        rejectWithMessage(
          `${provider} exited before publishing a public URL (code: ${code ?? 'unknown'}, signal: ${signal ?? 'none'}).${formatRecentOutput(recentOutput)}`,
        );
      });
    });
  }

  /**
   * Get tunnel info for a specific port
   */
  getTunnel(port: number): TunnelInfo | null {
    return this.activeTunnels.get(port) || null;
  }

  /**
   * Get all active tunnels
   */
  getAllTunnels(): TunnelInfo[] {
    return Array.from(this.activeTunnels.values());
  }

  /**
   * Close a tunnel
   */
  async closeTunnel(port: number): Promise<void> {
    const closer = this.tunnelClosers.get(port);
    if (closer) {
      closer();
      this.tunnelClosers.delete(port);
    }

    if (this.activeTunnels.has(port)) {
      const info = this.activeTunnels.get(port)!;
      info.status = 'closed';
      this.activeTunnels.delete(port);
    }
  }

  /**
   * Close all tunnels
   */
  async closeAllTunnels(): Promise<void> {
    const ports = Array.from(this.activeTunnels.keys());
    await Promise.all(ports.map(port => this.closeTunnel(port)));
  }

  /**
   * Check if a tunnel is active
   */
  isActive(port: number): boolean {
    const tunnel = this.activeTunnels.get(port);
    return tunnel?.status === 'active';
  }

  /**
   * Auto-detect port from common dev servers by checking which ones are listening
   */
  async autoDetectPort(): Promise<number | null> {
    const commonPorts = [3000, 5173, 5174, 4173, 8080, 4200, 8000, 3001];

    for (const port of commonPorts) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1000);
        await fetch(`http://localhost:${port}/`, {
          signal: controller.signal,
          redirect: 'manual',
        });
        clearTimeout(timeout);
        return port; // Got a response — something is listening
      } catch {
        continue; // Connection refused or timed out — port not in use
      }
    }

    return null;
  }

  /**
   * Get provider order based on preference
   */
  private getProviderOrder(preferred?: TunnelProvider): TunnelProvider[] {
    const allProviders: TunnelProvider[] = ['cloudflared', 'ngrok'];

    if (preferred && allProviders.includes(preferred)) {
      // Put preferred first
      return [
        preferred,
        ...allProviders.filter(p => p !== preferred)
      ];
    }

    return allProviders;
  }
}

// Singleton instance
export const tunnelService = new TunnelService();

// Cleanup is centralized in index.ts
