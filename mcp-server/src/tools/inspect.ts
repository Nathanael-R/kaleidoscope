import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { processManager } from '../process-manager.js';
import { DEVICE_IDS, DEVICES } from '../../../shared/devices.js';
import { KALEIDOSCOPE_SERVER, kaleidoscopeFetch } from '../kaleidoscope-api.js';
import {
  createErrorResult,
  createStructuredResult,
  formatToolError,
  toPrettyJson,
} from '../tool-utils.js';

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

const inspectDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['mobile', 'tablet', 'desktop']),
  width: z.number(),
  height: z.number(),
});

const discoverCandidateSchema = z.object({
  selector: z.string(),
  tagName: z.string(),
  text: z.string().nullable(),
  role: z.string().nullable(),
  attributes: z.object({
    id: z.string().nullable(),
    className: z.string().nullable(),
    ariaLabel: z.string().nullable(),
    title: z.string().nullable(),
    name: z.string().nullable(),
    placeholder: z.string().nullable(),
    testId: z.string().nullable(),
  }),
  score: z.number(),
  reasons: z.array(z.string()),
});

const discoverOutputSchema = {
  success: z.boolean(),
  page: z.object({
    title: z.string().nullable(),
    url: z.string().nullable(),
  }),
  device: inspectDeviceSchema.nullable(),
  query: z.string(),
  candidates: z.array(discoverCandidateSchema),
};

const inspectOutputSchema = z.object({
  capability: z.string(),
  resolver: z.string(),
  confidence: z.string(),
  page: z.object({
    title: z.string().nullable(),
    url: z.string().nullable(),
  }),
  device: inspectDeviceSchema.nullable(),
  selector: z.string().nullable(),
  tagName: z.string().nullable(),
  text: z.string().nullable(),
  componentName: z.string().nullable(),
  source: z.object({}).passthrough().nullable(),
  stack: z.array(z.object({}).passthrough()),
  diagnostics: z.array(z.string()),
}).passthrough();

const discoverInputSchema = {
  url: z.string().url().describe('The local URL to inspect, for example http://localhost:3000/checkout'),
  query: z.string().min(1).describe('A natural-language hint like "save button", "hero section", or "email field".'),
  device: z.enum(ALL_DEVICE_IDS).optional().describe(
    'Optional device viewport to emulate before scanning the page for candidate elements.',
  ),
  limit: z.number().int().min(1).max(10).optional().describe(
    'Maximum number of candidates to return. Defaults to 5.',
  ),
} satisfies z.ZodRawShape;

const inspectInputSchema = {
  url: z.string().url().describe('The local URL to inspect, for example http://localhost:3000/checkout'),
  selector: z.string().min(1).describe('A CSS selector for the element to inspect, for example #save-button or main > section.hero'),
  device: z.enum(ALL_DEVICE_IDS).optional().describe(
    'Optional device viewport to emulate before resolving the selector. ' +
    'If omitted, the page is inspected using the browser default viewport.',
  ),
  source_dir: z.string().optional().describe(
    'Optional source directory used for heuristic source matching when exact runtime metadata is unavailable.',
  ),
} satisfies z.ZodRawShape;

interface InspectDeviceResult {
  id: string;
  name: string;
  type: 'mobile' | 'tablet' | 'desktop';
  width: number;
  height: number;
}

interface DiscoverCandidateResult {
  selector: string;
  tagName: string;
  text: string | null;
  role: string | null;
  attributes: {
    id: string | null;
    className: string | null;
    ariaLabel: string | null;
    title: string | null;
    name: string | null;
    placeholder: string | null;
    testId: string | null;
  };
  score: number;
  reasons: string[];
}

interface DiscoverOutputResult {
  success: boolean;
  page: {
    title: string | null;
    url: string | null;
  };
  device: InspectDeviceResult | null;
  query: string;
  candidates: DiscoverCandidateResult[];
  error?: string;
}

interface InspectOutputResult {
  capability: string;
  resolver: string;
  confidence: string;
  page: {
    title: string | null;
    url: string | null;
  };
  device: InspectDeviceResult | null;
  selector: string | null;
  tagName: string | null;
  text: string | null;
  componentName: string | null;
  source: Record<string, unknown> | null;
  stack: Array<Record<string, unknown>>;
  diagnostics: string[];
  [key: string]: unknown;
}

export function registerInspectTools(server: McpServer) {
  const registerTool = server.registerTool.bind(server) as (
    name: string,
    config: {
      description: string;
      inputSchema: z.ZodRawShape;
      outputSchema: z.ZodRawShape | z.AnyZodObject;
    },
    handler: (args: any) => Promise<ReturnType<typeof createStructuredResult> | ReturnType<typeof createErrorResult>>,
  ) => void;

  registerTool(
    'discover_page_elements',
    {
      description:
        'Discover likely page elements from a natural-language query and return scored selector candidates. ' +
        'Use this before inspect_element_source when you know the element semantically, such as "save button" or "hero section", but do not know the CSS selector yet.',
      inputSchema: discoverInputSchema as z.ZodRawShape,
      outputSchema: discoverOutputSchema as z.ZodRawShape,
    },
    async ({ url, query, device, limit }) => {
      try {
        const serverReachable = await processManager.isServerReachable();
        if (!serverReachable) {
          await processManager.startServer();
        }

        const selectedDevice = device ? DEVICE_MAP.get(device) ?? null : null;

        const response = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/inspect/discover`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            query,
            limit,
            device: selectedDevice,
          }),
        });

        const body = await response.json() as DiscoverOutputResult;

        if (!response.ok) {
          return createErrorResult(`Discovery failed: ${body.error ?? 'Unknown error'}`);
        }

        return createStructuredResult(body, toPrettyJson(body));
      } catch (error) {
        return createErrorResult(await formatToolError('discovering page elements', error));
      }
    },
  );

  registerTool(
    'inspect_element_source',
    {
      description:
        'Inspect a single element on a local page by CSS selector and return structured source resolution data. ' +
        'This uses Kaleidoscope server-side browser automation, so it can capture page metadata and device viewport context without manual UI clicking. ' +
        'Use this when you know the selector you want to inspect and want the same source payload exposed by the Kaleidoscope inspect panel JSON export.',
      inputSchema: inspectInputSchema as z.ZodRawShape,
      outputSchema: inspectOutputSchema as z.AnyZodObject,
    },
    async ({ url, selector, device, source_dir }) => {
      try {
        const serverReachable = await processManager.isServerReachable();
        if (!serverReachable) {
          await processManager.startServer();
        }

        const selectedDevice = device ? DEVICE_MAP.get(device) ?? null : null;

        const response = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/inspect/selector`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            selector,
            sourceDir: source_dir,
            device: selectedDevice,
          }),
        });

        const body = await response.json() as { error?: string; result?: InspectOutputResult };

        if (!response.ok || !body.result) {
          return createErrorResult(`Inspect failed: ${body.error ?? 'Unknown error'}`);
        }

        return createStructuredResult(body.result, toPrettyJson(body.result));
      } catch (error) {
        return createErrorResult(await formatToolError('inspecting element source', error));
      }
    },
  );
}
