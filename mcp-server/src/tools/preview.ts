import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { processManager } from '../process-manager.js';
import { DEVICE_IDS } from '../../../shared/devices.js';
import { KALEIDOSCOPE_SERVER, kaleidoscopeFetch } from '../kaleidoscope-api.js';

const ALL_DEVICE_IDS = [...DEVICE_IDS] as [string, ...string[]];

async function formatToolError(action: string, error: unknown): Promise<string> {
  const reason = error instanceof Error ? error.message : String(error);
  try {
    const status = await processManager.getStatus();
    return [
      `Error ${action}: ${reason}`,
      '',
      'Current service status:',
      `  Client: ${status.client.running ? 'running' : 'stopped'} (${status.client.url})`,
      `  Server: ${status.server.running ? 'running' : 'stopped'} (${status.server.url})`,
    ].join('\n');
  } catch {
    return `Error ${action}: ${reason}`;
  }
}

export function registerPreviewTools(server: McpServer) {
  // @ts-expect-error MCP SDK server.tool() causes TS2589 with complex zod schemas
  server.tool(
    'preview_responsive',
    'Open a URL for responsive preview across multiple device sizes in Kaleidoscope. ' +
    'Returns the Kaleidoscope UI URL and status of each device preview. ' +
    'Automatically starts Kaleidoscope services if not running.',
    {
      url: z.string().url().describe('The URL to preview (e.g. http://localhost:3000)'),
      devices: z.array(z.enum(ALL_DEVICE_IDS)).optional().describe(
        'Optional list of device IDs to preview. Defaults to all devices. ' +
        'Available: iphone-14, samsung-s21, pixel-6, ipad, ipad-pro, macbook-air, desktop, desktop-4k'
      ),
      tunnel: z.boolean().optional().describe(
        'If true, creates a public tunnel URL for the target so it can be shared'
      ),
    },
    async ({ url, devices: selectedDevices, tunnel }) => {
      try {
        const status = await processManager.startAll();
        if (!status.client.url) {
          throw new Error('Kaleidoscope client URL is unavailable after startup.');
        }

        const clientUrl = status.client.url;

        // Check health
        const healthRes = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/health`);
        if (!healthRes.ok) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Kaleidoscope server is not responding. Please start it manually with `npm run dev:all` from the Kaleidoscope directory.',
            }],
          };
        }

        const results: string[] = [];
        results.push(`Preview ready for: ${url}`);
        results.push(`Kaleidoscope UI: ${clientUrl}`);
        results.push('');

        // Create tunnel if requested
        if (tunnel) {
          try {
            const portMatch = url.match(/:(\d+)/);
            const port = portMatch ? parseInt(portMatch[1], 10) : 3000;

            const tunnelRes = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/tunnel/create`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ port }),
            });

            if (tunnelRes.ok) {
              const tunnelData = await tunnelRes.json() as { tunnel: { url: string } };
              results.push(`Public tunnel URL: ${tunnelData.tunnel.url}`);
              results.push('Share this URL with others to view the preview remotely.');
              results.push('');
            }
          } catch {
            results.push('Warning: Could not create tunnel. Localhost preview still works.');
            results.push('');
          }
        }

        // List device previews
        const devicesToShow = selectedDevices ?? [...ALL_DEVICE_IDS];
        results.push('Device previews:');
        for (const deviceId of devicesToShow) {
          results.push(`  - ${deviceId}`);
        }
        results.push('');
        results.push(`Open Kaleidoscope at ${clientUrl} and enter the URL to see previews across all devices.`);

        return {
          content: [{
            type: 'text' as const,
            text: results.join('\n'),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: await formatToolError('setting up preview', error),
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'kaleidoscope_status',
    'Check if Kaleidoscope services are running and get their URLs.',
    {},
    async () => {
      try {
        const status = await processManager.getStatus();
        const serverReachable = await processManager.isServerReachable();

        const lines = [
          'Kaleidoscope Status:',
          `  Client: ${status.client.running ? 'Running' : 'Stopped'} (${status.client.url})`,
          `  Server: ${serverReachable ? 'Running' : 'Stopped'} (${status.server.url})`,
        ];

        // Check for active tunnels
        if (serverReachable) {
          try {
            const tunnelRes = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/tunnel`);
            if (tunnelRes.ok) {
              const data = await tunnelRes.json() as { tunnels: Array<{ port: number; url: string; status: string }> };
              if (data.tunnels.length > 0) {
                lines.push('  Active tunnels:');
                for (const t of data.tunnels) {
                  lines.push(`    - Port ${t.port}: ${t.url} (${t.status})`);
                }
              }
            }
          } catch {
            // ignore tunnel check errors
          }
        }

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: await formatToolError('checking status', error),
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'kaleidoscope_start',
    'Start Kaleidoscope services (client + server). Idempotent - safe to call even if already running.',
    {},
    async () => {
      try {
        const status = await processManager.startAll();
        return {
          content: [{
            type: 'text' as const,
            text: [
              'Kaleidoscope started successfully!',
              `  Client: ${status.client.url}`,
              `  Server: ${status.server.url}`,
              '',
              'Open the client URL in a browser to use the preview tool.',
            ].join('\n'),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: await formatToolError('starting Kaleidoscope', error),
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'kaleidoscope_stop',
    'Stop all Kaleidoscope services.',
    {},
    async () => {
      try {
        await processManager.stopAll();
        return {
          content: [{ type: 'text' as const, text: 'Kaleidoscope services stopped.' }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: await formatToolError('stopping services', error),
          }],
          isError: true,
        };
      }
    }
  );
}
