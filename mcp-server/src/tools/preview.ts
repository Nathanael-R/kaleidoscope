import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { processManager } from '../process-manager.js';
import { DEVICE_IDS } from '../../../shared/devices.js';
import { KALEIDOSCOPE_SERVER, kaleidoscopeFetch } from '../kaleidoscope-api.js';
import {
  createErrorResult,
  createStructuredResult,
  formatToolError,
} from '../tool-utils.js';

const ALL_DEVICE_IDS = [...DEVICE_IDS] as [string, ...string[]];

const serviceStatusSchema = z.object({
  running: z.boolean(),
  pid: z.number().nullable(),
  port: z.number().nullable(),
  url: z.string().nullable(),
});

const previewOutputSchema = {
  url: z.string().url(),
  clientUrl: z.string().url(),
  devices: z.array(z.string()),
  services: z.object({
    client: serviceStatusSchema,
    server: serviceStatusSchema,
  }),
  warnings: z.array(z.string()),
  instructions: z.array(z.string()),
};

const statusOutputSchema = {
  client: serviceStatusSchema,
  server: serviceStatusSchema,
};

const previewInputSchema = {
  url: z.string().url().describe('The URL to preview (e.g. http://localhost:3000)'),
  devices: z.array(z.enum(ALL_DEVICE_IDS)).optional().describe(
    'Optional list of device IDs to preview. Defaults to all devices. ' +
    'Available: iphone-14, samsung-s21, pixel-6, ipad, ipad-pro, macbook-air, desktop, desktop-4k',
  ),
} satisfies z.ZodRawShape;

const stopOutputSchema = {
  stopped: z.boolean(),
  message: z.string(),
} satisfies z.ZodRawShape;

interface ServiceStatusResult {
  running: boolean;
  pid: number | null;
  port: number | null;
  url: string | null;
}

interface PreviewResult {
  url: string;
  clientUrl: string;
  devices: string[];
  services: {
    client: ServiceStatusResult;
    server: ServiceStatusResult;
  };
  warnings: string[];
  instructions: string[];
}

interface StatusResult {
  client: ServiceStatusResult;
  server: ServiceStatusResult;
}

function normalizeServiceStatus(status: {
  running: boolean;
  pid?: number;
  port?: number;
  url?: string;
}): ServiceStatusResult {
  return {
    running: status.running,
    pid: status.pid ?? null,
    port: status.port ?? null,
    url: status.url ?? null,
  };
}

function formatPreviewText(result: PreviewResult): string {
  const lines = [
    `Preview ready for: ${result.url}`,
    `Kaleidoscope UI: ${result.clientUrl}`,
    '',
    'Device previews:',
    ...result.devices.map((deviceId) => `  - ${deviceId}`),
  ];

  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:');
    lines.push(...result.warnings.map((warning) => `  - ${warning}`));
  }

  lines.push('', ...result.instructions);
  return lines.join('\n');
}

function formatStatusText(result: StatusResult): string {
  const lines = [
    'Kaleidoscope Status:',
    `  Client: ${result.client.running ? 'Running' : 'Stopped'} (${result.client.url})`,
    `  Server: ${result.server.running ? 'Running' : 'Stopped'} (${result.server.url})`,
  ];

  return lines.join('\n');
}

export function registerPreviewTools(server: McpServer) {
  const registerTool = server.registerTool.bind(server) as (
    name: string,
    config: {
      description: string;
      inputSchema: z.ZodRawShape;
      outputSchema: z.ZodRawShape;
    },
    handler: (args: any) => Promise<ReturnType<typeof createStructuredResult> | ReturnType<typeof createErrorResult>>,
  ) => void;

  registerTool(
    'preview_responsive',
    {
      description:
        'Open a URL for responsive preview across multiple device sizes in Kaleidoscope. ' +
        'Returns the Kaleidoscope UI URL and status of each device preview. ' +
        'Automatically starts Kaleidoscope services if not running.',
      inputSchema: previewInputSchema as z.ZodRawShape,
      outputSchema: previewOutputSchema as z.ZodRawShape,
    },
    async ({ url, devices: selectedDevices }) => {
      try {
        const status = await processManager.startAll();
        if (!status.client.url) {
          throw new Error('Kaleidoscope client URL is unavailable after startup.');
        }

        const clientUrl = status.client.url;
        const healthRes = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/health`);
        if (!healthRes.ok) {
          return createErrorResult(
            'Kaleidoscope server is not responding. Please start it manually with `npm run dev:all` from the Kaleidoscope directory.',
          );
        }

        const warnings: string[] = [];

        const devices = selectedDevices ?? [...ALL_DEVICE_IDS];
        const result: PreviewResult = {
          url,
          clientUrl,
          devices,
          services: {
            client: normalizeServiceStatus(status.client),
            server: normalizeServiceStatus(status.server),
          },
          warnings,
          instructions: [
            `Open Kaleidoscope at ${clientUrl} and enter the URL to see previews across all devices.`,
          ],
        };

        return createStructuredResult(result, formatPreviewText(result));
      } catch (error) {
        return createErrorResult(await formatToolError('setting up preview', error));
      }
    },
  );

  registerTool(
    'kaleidoscope_status',
    {
      description: 'Check if Kaleidoscope services are running and get their URLs.',
      inputSchema: {},
      outputSchema: statusOutputSchema as z.ZodRawShape,
    },
    async () => {
      try {
        const status = await processManager.getStatus();
        const serverReachable = await processManager.isServerReachable();

        const result: StatusResult = {
          client: normalizeServiceStatus(status.client),
          server: {
            ...normalizeServiceStatus(status.server),
            running: serverReachable,
          },
        };

        return createStructuredResult(result, formatStatusText(result));
      } catch (error) {
        return createErrorResult(await formatToolError('checking status', error));
      }
    },
  );

  registerTool(
    'kaleidoscope_start',
    {
      description:
        'Start Kaleidoscope services (client + server). Idempotent - safe to call even if already running.',
      inputSchema: {},
      outputSchema: statusOutputSchema as z.ZodRawShape,
    },
    async () => {
      try {
        const status = await processManager.startAll();
        const result: StatusResult = {
          client: normalizeServiceStatus(status.client),
          server: normalizeServiceStatus(status.server),
        };

        return createStructuredResult(
          result,
          [
            'Kaleidoscope started successfully!',
            `  Client: ${result.client.url}`,
            `  Server: ${result.server.url}`,
            '',
            'Open the client URL in a browser to use the preview tool.',
          ].join('\n'),
        );
      } catch (error) {
        return createErrorResult(await formatToolError('starting Kaleidoscope', error));
      }
    },
  );

  registerTool(
    'kaleidoscope_stop',
    {
      description: 'Stop all Kaleidoscope services.',
      inputSchema: {},
      outputSchema: stopOutputSchema as z.ZodRawShape,
    },
    async () => {
      try {
        await processManager.stopAll();
        const result = {
          stopped: true,
          message: 'Kaleidoscope services stopped.',
        };
        return createStructuredResult(result, result.message);
      } catch (error) {
        return createErrorResult(await formatToolError('stopping services', error));
      }
    },
  );
}
