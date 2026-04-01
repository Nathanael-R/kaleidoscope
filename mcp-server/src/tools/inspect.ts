import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { processManager } from '../process-manager.js';
import { DEVICE_IDS, DEVICES } from '../../../shared/devices.js';

const KALEIDOSCOPE_SERVER = 'http://localhost:5000';
const ALL_DEVICE_IDS = [...DEVICE_IDS] as [string, ...string[]];

const DEVICE_MAP = new Map(
  DEVICES.map((device) => [
    device.id,
    {
      id: device.id,
      name: device.name,
      type: device.type,
      width: device.width,
      height: device.height,
    },
  ]),
);

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

export function registerInspectTools(server: McpServer) {
  // @ts-expect-error MCP SDK server.tool() causes TS2589 with complex zod schemas
  server.tool(
    'discover_page_elements',
    'Discover likely page elements from a natural-language query and return scored selector candidates. ' +
    'Use this before inspect_element_source when you know the element semantically, such as "save button" or "hero section", but do not know the CSS selector yet.',
    {
      url: z.string().url().describe('The local URL to inspect, for example http://localhost:3000/checkout'),
      query: z.string().min(1).describe('A natural-language hint like "save button", "hero section", or "email field".'),
      device: z.enum(ALL_DEVICE_IDS).optional().describe(
        'Optional device viewport to emulate before scanning the page for candidate elements.'
      ),
      limit: z.number().int().min(1).max(10).optional().describe(
        'Maximum number of candidates to return. Defaults to 5.'
      ),
    },
    async ({ url, query, device, limit }) => {
      try {
        const serverReachable = await processManager.isServerReachable();
        if (!serverReachable) {
          await processManager.startServer();
        }

        const selectedDevice = device ? DEVICE_MAP.get(device) ?? null : null;

        const response = await fetch(`${KALEIDOSCOPE_SERVER}/api/inspect/discover`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            query,
            limit,
            device: selectedDevice,
          }),
        });

        const body = await response.json() as { error?: string } & Record<string, unknown>;

        if (!response.ok) {
          return {
            content: [{
              type: 'text' as const,
              text: `Discovery failed: ${body.error ?? 'Unknown error'}`,
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(body, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: await formatToolError('discovering page elements', error),
          }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'inspect_element_source',
    'Inspect a single element on a local page by CSS selector and return structured source resolution data. ' +
    'This uses Kaleidoscope server-side browser automation, so it can capture page metadata and device viewport context without manual UI clicking. ' +
    'Use this when you know the selector you want to inspect and want the same source payload exposed by the Kaleidoscope inspect panel JSON export.',
    {
      url: z.string().url().describe('The local URL to inspect, for example http://localhost:3000/checkout'),
      selector: z.string().min(1).describe('A CSS selector for the element to inspect, for example #save-button or main > section.hero'),
      device: z.enum(ALL_DEVICE_IDS).optional().describe(
        'Optional device viewport to emulate before resolving the selector. ' +
        'If omitted, the page is inspected using the browser default viewport.'
      ),
      source_dir: z.string().optional().describe(
        'Optional source directory used for heuristic source matching when exact runtime metadata is unavailable.'
      ),
    },
    async ({ url, selector, device, source_dir }) => {
      try {
        const serverReachable = await processManager.isServerReachable();
        if (!serverReachable) {
          await processManager.startServer();
        }

        const selectedDevice = device ? DEVICE_MAP.get(device) ?? null : null;

        const response = await fetch(`${KALEIDOSCOPE_SERVER}/api/inspect/selector`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            selector,
            sourceDir: source_dir,
            device: selectedDevice,
          }),
        });

        const body = await response.json() as { error?: string; result?: unknown };

        if (!response.ok || !body.result) {
          return {
            content: [{
              type: 'text' as const,
              text: `Inspect failed: ${body.error ?? 'Unknown error'}`,
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(body.result, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: await formatToolError('inspecting element source', error),
          }],
          isError: true,
        };
      }
    }
  );
}