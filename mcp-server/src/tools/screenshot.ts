import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { processManager } from '../process-manager.js';
import { DEVICE_IDS } from '../../../shared/devices.js';
import { KALEIDOSCOPE_SERVER, kaleidoscopeFetch } from '../kaleidoscope-api.js';
const ALL_DEVICE_IDS = [...DEVICE_IDS] as [string, ...string[]];
const DEFAULT_CAPTURE_DEVICES = ['iphone-14', 'ipad', 'desktop'];

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

export function registerScreenshotTools(server: McpServer) {
  server.tool(
    'capture_screenshots',
    'Capture screenshots of a URL across multiple device viewport sizes. ' +
    'Returns file paths to the saved screenshot images. ' +
    'Requires Kaleidoscope server to be running.',
    {
      url: z.string().url().describe('The URL to screenshot'),
      devices: z.array(z.enum(ALL_DEVICE_IDS)).optional().describe(
        'Device viewports to capture. Defaults to iphone-14, ipad, desktop. ' +
        'Available: iphone-14, samsung-s21, pixel-6, ipad, ipad-pro, macbook-air, desktop, desktop-4k'
      ),
      output_dir: z.string().optional().describe(
        'Directory to save screenshots. Defaults to ./screenshots/'
      ),
      full_page: z.boolean().optional().describe(
        'Capture full scrollable page instead of just the viewport. Default: false'
      ),
    },
    async ({ url, devices: selectedDevices, output_dir, full_page }) => {
      try {
        // Ensure server is running
        const serverReachable = await processManager.isServerReachable();
        if (!serverReachable) {
          await processManager.startServer();
        }

        const devicesToCapture = selectedDevices ?? DEFAULT_CAPTURE_DEVICES;
        const outputDir = output_dir ?? './screenshots';

        const screenshotRes = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/screenshots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            devices: devicesToCapture,
            outputDir,
            fullPage: full_page ?? false,
          }),
        });

        if (!screenshotRes.ok) {
          const errData = await screenshotRes.json() as { error: string };
          return {
            content: [{
              type: 'text' as const,
              text: `Screenshot capture failed: ${errData.error}`,
            }],
            isError: true,
          };
        }

        const data = await screenshotRes.json() as {
          screenshots: Array<{ device: string; path: string; width: number; height: number }>;
        };

        const lines = [
          `Screenshots captured for: ${url}`,
          `Output directory: ${outputDir}`,
          '',
        ];

        for (const screenshot of data.screenshots) {
          lines.push(`  ${screenshot.device}: ${screenshot.path} (${screenshot.width}x${screenshot.height})`);
        }

        lines.push('');
        lines.push(`Total: ${data.screenshots.length} screenshots saved.`);

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: await formatToolError('capturing screenshots', error),
          }],
          isError: true,
        };
      }
    }
  );
}
