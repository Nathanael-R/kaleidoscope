import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DEVICE_IDS } from '../../../shared/devices.js';
import { processManager } from '../process-manager.js';
import { KALEIDOSCOPE_SERVER, kaleidoscopeFetch } from '../kaleidoscope-api.js';
import {
  createErrorResult,
  createStructuredResult,
  formatToolError,
} from '../tool-utils.js';
import { normalizeScreenshotDevices } from './screenshot.js';

const layoutSourceSchema = z.object({
  filePath: z.string(),
  lineNumber: z.number().nullable(),
  columnNumber: z.number().nullable(),
  componentName: z.string().nullable(),
});

const layoutRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
});

const layoutDeviceContextSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['mobile', 'tablet', 'desktop']),
  width: z.number(),
  height: z.number(),
});

const layoutElementSchema = z.object({
  key: z.string(),
  selector: z.string(),
  selectorKind: z.enum(['test-id', 'id', 'attribute', 'aria', 'href', 'structural']),
  selectorStability: z.enum(['stable', 'generated', 'structural']),
  fallbackKey: z.string(),
  structuralPath: z.string(),
  tagName: z.string(),
  role: z.string().nullable(),
  text: z.string().nullable(),
  accessibleName: z.string().nullable(),
  attributes: z.object({
    id: z.string().nullable(),
    className: z.string().nullable(),
    testId: z.string().nullable(),
    ariaLabel: z.string().nullable(),
    name: z.string().nullable(),
    href: z.string().nullable(),
    type: z.string().nullable(),
  }),
  rect: layoutRectSchema,
  depth: z.number(),
  visible: z.boolean(),
  source: layoutSourceSchema.nullable(),
});

const layoutDeviceCaptureSchema = z.object({
  device: layoutDeviceContextSchema,
  page: z.object({
    title: z.string().nullable(),
    url: z.string().nullable(),
  }),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
    scrollWidth: z.number(),
    scrollHeight: z.number(),
  }),
  elements: z.array(layoutElementSchema),
  stats: z.object({
    elementCount: z.number(),
    capturedCount: z.number(),
    truncated: z.boolean(),
  }),
  diagnostics: z.array(z.string()),
});

const layoutCaptureOutputSchema = {
  id: z.string(),
  url: z.string().url(),
  sourceDir: z.string().nullable(),
  capturedAt: z.string(),
  updatedAt: z.string(),
  durationMs: z.number(),
  devices: z.array(layoutDeviceCaptureSchema),
  warnings: z.array(z.string()),
} satisfies z.ZodRawShape;

const storedLayoutCaptureSchema = z.object(layoutCaptureOutputSchema);

const layoutElementReferenceSchema = z.object({
  key: z.string(),
  selector: z.string(),
  selectorStability: z.enum(['stable', 'generated', 'structural']),
  fallbackKey: z.string(),
  structuralPath: z.string(),
  tagName: z.string(),
  role: z.string().nullable(),
  text: z.string().nullable(),
  accessibleName: z.string().nullable(),
  rect: layoutRectSchema,
  source: layoutSourceSchema.nullable(),
});

const layoutChangeSchema = z.object({
  type: z.enum(['added', 'removed', 'text', 'geometry']),
  severity: z.enum(['low', 'medium', 'high']),
  deviceId: z.string(),
  deviceName: z.string(),
  matchKey: z.string(),
  label: z.string(),
  selector: z.string().nullable(),
  before: layoutElementReferenceSchema.nullable(),
  after: layoutElementReferenceSchema.nullable(),
  details: z.string(),
  source: layoutSourceSchema.nullable(),
});

const layoutDeviceDiffSchema = z.object({
  device: layoutDeviceContextSchema,
  beforeElementCount: z.number(),
  afterElementCount: z.number(),
  matchedCount: z.number(),
  changes: z.array(layoutChangeSchema),
  diagnostics: z.array(z.string()),
});

const layoutDiffSchema = z.object({
  verdict: z.enum(['noChange', 'changed', 'inconclusive']),
  beforeCaptureId: z.string().nullable(),
  afterCaptureId: z.string().nullable(),
  url: z.string().url(),
  deviceCount: z.number(),
  changedDeviceCount: z.number(),
  changeCount: z.number(),
  truncated: z.boolean(),
  coverageChanged: z.boolean(),
  devices: z.array(layoutDeviceDiffSchema),
  warnings: z.array(z.string()),
});

const readLayoutInputSchema = {
  url: z.string().url().describe(
    'The URL to capture. Local dev URLs and Kaleidoscope proxy URLs are supported.',
  ),
  devices: z.array(z.string()).optional().describe(
    'Device viewports to capture. Accepts device IDs or names. Defaults to iphone-14, ipad, desktop. ' +
    `Available IDs: ${DEVICE_IDS.join(', ')}`,
  ),
  source_dir: z.string().max(500).optional().describe(
    'Optional source directory used to keep later source attribution scoped to the app workspace.',
  ),
  max_elements: z.number().int().min(1).max(300).optional().describe(
    'Maximum visible elements to capture per device. Defaults to 100.',
  ),
  include_source: z.boolean().optional().describe(
    'Whether to try runtime source attribution with element-source. Defaults to true.',
  ),
  wait_until: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().describe(
    'Playwright navigation readiness signal. Defaults to networkidle.',
  ),
  settle_ms: z.number().int().min(0).max(2000).optional().describe(
    'Extra delay after navigation before reading layout. Defaults to 250.',
  ),
} satisfies z.ZodRawShape;

const afterEditInputSchema = {
  baseline_capture_id: z.string().regex(/^layout_[0-9a-f-]{36}$/i).describe(
    'The baseline capture ID returned by kaleidoscope_read_layout before editing.',
  ),
  url: z.string().url().optional().describe(
    'Optional URL override. Defaults to the baseline capture URL.',
  ),
  devices: z.array(z.string()).optional().describe(
    'Optional device IDs or names to recapture. Defaults to the devices from the baseline capture.',
  ),
  source_dir: z.string().max(500).optional().describe(
    'Optional source directory override. Defaults to the baseline capture source_dir.',
  ),
  max_elements: z.number().int().min(1).max(300).optional().describe(
    'Maximum visible elements to capture per device. Defaults to 100.',
  ),
  include_source: z.boolean().optional().describe(
    'Whether to try runtime source attribution with element-source. Defaults to true.',
  ),
  wait_until: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().describe(
    'Playwright navigation readiness signal. Defaults to networkidle.',
  ),
  settle_ms: z.number().int().min(0).max(2000).optional().describe(
    'Extra delay after navigation before reading layout. Defaults to 250.',
  ),
} satisfies z.ZodRawShape;

const layoutSummarySchema = z.object({
  verdict: z.enum(['noChange', 'changed', 'inconclusive']),
  text: z.string(),
  changedDevices: z.array(z.string()),
  topChanges: z.array(z.object({
    deviceId: z.string(),
    type: z.enum(['added', 'removed', 'text', 'geometry']),
    severity: z.enum(['low', 'medium', 'high']),
    label: z.string(),
    details: z.string(),
    source: z.string().nullable(),
  })),
});

const afterEditOutputSchema = {
  baselineCaptureId: z.string(),
  afterCaptureId: z.string(),
  verdict: z.enum(['noChange', 'changed', 'inconclusive']),
  summary: layoutSummarySchema,
  diff: layoutDiffSchema,
  capture: storedLayoutCaptureSchema,
} satisfies z.ZodRawShape;

const errorResponseSchema = z.object({
  error: z.string().optional(),
});
const layoutCaptureResponseSchema = z.object({
  success: z.boolean().optional(),
  capture: storedLayoutCaptureSchema,
});
const afterEditResultSchema = z.object(afterEditOutputSchema);
const afterEditResponseSchema = afterEditResultSchema.extend({
  success: z.boolean().optional(),
}).transform(({ success: _success, ...result }) => result);
type LayoutCaptureResult = z.infer<typeof storedLayoutCaptureSchema>;
type LayoutElementResult = z.infer<typeof layoutElementSchema>;

function formatZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return 'unknown schema mismatch';
  }

  const path = issue.path.length > 0 ? issue.path.join('.') : 'response';
  return `${path}: ${issue.message}`;
}

async function readServerError(response: Response, rawBody: unknown): Promise<string> {
  const parsed = errorResponseSchema.safeParse(rawBody);
  if (parsed.success && parsed.data.error) {
    return parsed.data.error;
  }

  return response.statusText || `HTTP ${response.status}`;
}

function summarizeElement(element: LayoutElementResult): string {
  const label = element.accessibleName ?? element.text ?? element.selector;
  const source = element.source?.filePath
    ? ` (${element.source.filePath}${element.source.lineNumber ? `:${element.source.lineNumber}` : ''})`
    : '';
  const role = element.role ? `/${element.role}` : '';
  return `${element.tagName}${role}${label ? ` "${label.slice(0, 60)}"` : ''}${source}`;
}

function formatLayoutCaptureText(capture: LayoutCaptureResult): string {
  const lines = [
    `Layout capture: ${capture.id}`,
    `URL: ${capture.url}`,
    `Captured: ${capture.capturedAt}`,
    `Duration: ${capture.durationMs}ms`,
    '',
  ];

  for (const deviceCapture of capture.devices) {
    lines.push(
      `${deviceCapture.device.id}: ${deviceCapture.stats.capturedCount}/${deviceCapture.stats.elementCount} visible elements` +
      `${deviceCapture.stats.truncated ? ' (truncated)' : ''}`,
    );

    const interestingElements = deviceCapture.elements
      .filter(element => element.role || element.text || element.accessibleName || element.source)
      .slice(0, 6);

    for (const element of interestingElements) {
      lines.push(`  - ${summarizeElement(element)}`);
    }

    for (const diagnostic of deviceCapture.diagnostics) {
      lines.push(`  ! ${diagnostic}`);
    }
  }

  if (capture.warnings.length > 0) {
    lines.push('', 'Warnings:', ...capture.warnings.map(warning => `  - ${warning}`));
  }

  return lines.join('\n');
}

export function registerLayoutTools(server: McpServer) {
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
    'kaleidoscope_read_layout',
    {
      description:
        'Capture a structured, source-attributed layout snapshot across one or more Kaleidoscope device viewports. ' +
        'Use this before editing UI code to create a baseline for the post-edit layout loop. ' +
        'The capture avoids generated class/id selectors where possible and includes selector-independent fallback keys for diffing.',
      inputSchema: readLayoutInputSchema,
      outputSchema: layoutCaptureOutputSchema,
    },
    async ({ url, devices: selectedDevices, source_dir, max_elements, include_source, wait_until, settle_ms }) => {
      try {
        const serverReachable = await processManager.isServerReachable();
        if (!serverReachable) {
          await processManager.startServer();
        }

        const devicesToCapture = selectedDevices
          ? normalizeScreenshotDevices(selectedDevices)
          : ['iphone-14', 'ipad', 'desktop'];

        const response = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/layout/capture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            devices: devicesToCapture,
            sourceDir: source_dir,
            maxElements: max_elements,
            includeSource: include_source,
            waitUntil: wait_until,
            settleMs: settle_ms,
          }),
        });

        const rawBody: unknown = await response.json();
        if (!response.ok) {
          return createErrorResult(`Layout capture failed: ${await readServerError(response, rawBody)}`);
        }

        const body = layoutCaptureResponseSchema.safeParse(rawBody);
        if (!body.success) {
          return createErrorResult(`Layout capture failed: Invalid server response (${formatZodError(body.error)})`);
        }

        return createStructuredResult(body.data.capture, formatLayoutCaptureText(body.data.capture));
      } catch (error) {
        return createErrorResult(await formatToolError('capturing layout', error));
      }
    },
  );

  registerTool(
    'kaleidoscope_after_edit',
    {
      description:
        'Recapture layout after a UI edit and compare it with a baseline from kaleidoscope_read_layout. ' +
        'Call this only after the target dev server has rebuilt or reloaded; this tool intentionally does not wait for reload events. ' +
        'Returns a terse noChange verdict when nothing visible changed, or a source-attributed summary when layout/text changed.',
      inputSchema: afterEditInputSchema,
      outputSchema: afterEditOutputSchema,
    },
    async ({ baseline_capture_id, url, devices: selectedDevices, source_dir, max_elements, include_source, wait_until, settle_ms }) => {
      try {
        const serverReachable = await processManager.isServerReachable();
        if (!serverReachable) {
          await processManager.startServer();
        }

        const devicesToCapture = selectedDevices
          ? normalizeScreenshotDevices(selectedDevices)
          : undefined;

        const response = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/layout/after-edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baselineCaptureId: baseline_capture_id,
            url,
            devices: devicesToCapture,
            sourceDir: source_dir,
            maxElements: max_elements,
            includeSource: include_source,
            waitUntil: wait_until,
            settleMs: settle_ms,
          }),
        });

        const rawBody: unknown = await response.json();
        if (!response.ok) {
          return createErrorResult(`Layout after-edit comparison failed: ${await readServerError(response, rawBody)}`);
        }

        const body = afterEditResponseSchema.safeParse(rawBody);
        if (!body.success) {
          return createErrorResult(`Layout after-edit comparison failed: Invalid server response (${formatZodError(body.error)})`);
        }

        return createStructuredResult(body.data, body.data.summary.text);
      } catch (error) {
        return createErrorResult(await formatToolError('comparing layout after edit', error));
      }
    },
  );

}
