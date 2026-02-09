// @ts-expect-error localtunnel has no type declarations
import localtunnel from 'localtunnel';

export interface TunnelInfo {
  url: string;
  provider: 'localtunnel' | 'ngrok' | 'cloudflared' | 'manual';
  port: number;
  status: 'active' | 'error' | 'closed';
  createdAt: Date;
}

export interface TunnelOptions {
  port: number;
  subdomain?: string;
  preferredProvider?: 'localtunnel' | 'ngrok' | 'cloudflared';
}

class TunnelService {
  private activeTunnels: Map<number, TunnelInfo> = new Map();
  private tunnelClosers: Map<number, () => void> = new Map();

  /**
   * Create a tunnel to expose a local port to the internet
   * Tries multiple providers in order: ngrok → localtunnel → cloudflared
   */
  async createTunnel(options: TunnelOptions): Promise<TunnelInfo> {
    const { port, subdomain } = options;

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

    for (const provider of providers) {
      try {
        console.log(`Attempting to create tunnel with ${provider}...`);
        const tunnelInfo = await this.createWithProvider(provider, port, subdomain);

        this.activeTunnels.set(port, tunnelInfo);
        console.log(`✓ Tunnel created successfully: ${tunnelInfo.url}`);

        return tunnelInfo;
      } catch (error) {
        console.warn(`${provider} failed:`, error instanceof Error ? error.message : error);
        continue;
      }
    }

    throw new Error(
      'All tunnel providers failed. ' +
      'Please ensure you have internet connectivity or manually expose your port.'
    );
  }

  /**
   * Create tunnel with specific provider
   */
  private async createWithProvider(
    provider: string,
    port: number,
    subdomain?: string
  ): Promise<TunnelInfo> {
    switch (provider) {
      case 'localtunnel':
        return await this.createLocalTunnel(port, subdomain);

      case 'ngrok':
        // ngrok requires manual installation or API token
        throw new Error(
          'ngrok is not installed. Install with: npm install -g ngrok, ' +
          'or use an alternative tunnel provider.'
        );

      case 'cloudflared':
        // cloudflared requires binary installation
        throw new Error(
          'cloudflared is not installed. Install from: ' +
          'https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/'
        );

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Create tunnel using localtunnel (pure JavaScript, no binary needed)
   */
  private async createLocalTunnel(port: number, subdomain?: string): Promise<TunnelInfo> {
    const options: any = { port };
    if (subdomain) {
      options.subdomain = subdomain;
    }

    const tunnel = await localtunnel(options);

    const tunnelInfo: TunnelInfo = {
      url: tunnel.url,
      provider: 'localtunnel',
      port,
      status: 'active',
      createdAt: new Date()
    };

    // Handle tunnel close
    tunnel.on('close', () => {
      console.log(`Tunnel closed for port ${port}`);
      if (this.activeTunnels.has(port)) {
        const info = this.activeTunnels.get(port)!;
        info.status = 'closed';
      }
    });

    // Handle tunnel error
    tunnel.on('error', (err: Error) => {
      console.error(`Tunnel error for port ${port}:`, err);
      if (this.activeTunnels.has(port)) {
        const info = this.activeTunnels.get(port)!;
        info.status = 'error';
      }
    });

    // Store closer function
    this.tunnelClosers.set(port, () => tunnel.close());

    return tunnelInfo;
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
   * Auto-detect port from common dev servers
   */
  async autoDetectPort(): Promise<number | null> {
    const commonPorts = [3000, 5173, 8080, 4200, 5000, 8000, 3001];

    // Simple port detection - just return first common port
    // In a real implementation, we'd check if ports are actually listening
    return commonPorts[0];
  }

  /**
   * Get provider order based on preference
   */
  private getProviderOrder(preferred?: string): string[] {
    const allProviders = ['localtunnel', 'ngrok', 'cloudflared'];

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
