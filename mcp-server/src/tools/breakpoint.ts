import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { processManager } from '../process-manager.js';
import { KALEIDOSCOPE_SERVER, kaleidoscopeFetch } from '../kaleidoscope-api.js';
import { createErrorResult, createStructuredResult, formatToolError } from '../tool-utils.js';

const issueSchema = z.object({
  type: z.enum(['horizontal-overflow', 'clipped-interactive']),
  key: z.string(),
  message: z.string(),
  selector: z.string().nullable(),
  startWidth: z.number(),
  endWidth: z.number(),
  sampledWidths: z.array(z.number()),
  maxOverflowPx: z.number().nullable(),
});

const scanInputSchema = {
  url: z.string().url().describe('The local or public HTTP/HTTPS page to scan.'),
  min_width: z.number().int().min(240).max(3840).optional().describe('Smallest viewport width to scan. Defaults to 320.'),
  max_width: z.number().int().min(240).max(3840).optional().describe('Largest viewport width to scan. Defaults to 1440.'),
  step: z.number().int().min(8).max(256).optional().describe('Width increment between probes. Defaults to 16. A smaller step is more precise but slower.'),
  height: z.number().int().min(320).max(2160).optional().describe('Viewport height used for every width. Defaults to 900.'),
  settle_ms: z.number().int().min(0).max(2000).optional().describe('Delay after each resize before measurement. Defaults to 100.'),
  wait_until: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().describe(
    'Navigation readiness signal. Defaults to domcontentloaded; use networkidle only for pages that become idle.',
  ),
} satisfies z.ZodRawShape;

const scanOutputSchema = {
  url: z.string().url(),
  verdict: z.enum(['clear', 'issues-found']),
  scannedWidthCount: z.number(),
  minWidth: z.number(),
  maxWidth: z.number(),
  step: z.number(),
  height: z.number(),
  durationMs: z.number(),
  issueRanges: z.array(issueSchema),
};

const serverResultSchema = z.object({
  success: z.boolean().optional(),
  result: z.object({
    url: z.string().url(),
    minWidth: z.number(),
    maxWidth: z.number(),
    step: z.number(),
    height: z.number(),
    scannedWidths: z.array(z.number()),
    issueRanges: z.array(issueSchema),
    verdict: z.enum(['clear', 'issues-found']),
    durationMs: z.number(),
  }),
});

function formatScanText(result: z.infer<typeof serverResultSchema>['result']): string {
  const headline = result.verdict === 'clear'
    ? `clear: ${result.scannedWidths.length} widths checked (${result.minWidth}px–${result.maxWidth}px).`
    : `issues-found: ${result.issueRanges.length} issue range(s) across ${result.scannedWidths.length} widths (${result.minWidth}px–${result.maxWidth}px).`;

  if (result.issueRanges.length === 0) {
    return headline;
  }

  return [
    headline,
    ...result.issueRanges.map((issue) => {
      const widthRange = issue.startWidth === issue.endWidth
        ? `${issue.startWidth}px`
        : `${issue.startWidth}px–${issue.endWidth}px`;
      const overflow = issue.maxOverflowPx ? ` (max overflow ${issue.maxOverflowPx}px)` : '';
      return `- ${widthRange}: ${issue.message}${overflow}`;
    }),
  ].join('\n');
}

export function registerBreakpointTools(server: McpServer) {
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
    'kaleidoscope_scan_breakpoints',
    {
      description:
        'Sweep a page through a continuous viewport-width range and return only concrete responsive failures. ' +
        'The first deterministic checks detect document-level horizontal overflow and visible interactive controls clipped horizontally. ' +
        'Use this to discover failing sampled width ranges beyond the fixed device presets. A clear result means no supported failure was detected, not that every visual issue is impossible.',
      inputSchema: scanInputSchema,
      outputSchema: scanOutputSchema,
    },
    async ({ url, min_width, max_width, step, height, settle_ms, wait_until }) => {
      try {
        if (!(await processManager.isServerReachable())) {
          await processManager.startServer();
        }

        const response = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/breakpoints/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            minWidth: min_width,
            maxWidth: max_width,
            step,
            height,
            settleMs: settle_ms,
            waitUntil: wait_until,
          }),
        });
        const rawBody: unknown = await response.json();
        if (!response.ok) {
          const error = typeof rawBody === 'object' && rawBody !== null && 'error' in rawBody && typeof rawBody.error === 'string'
            ? rawBody.error
            : response.statusText;
          return createErrorResult(`Breakpoint scan failed: ${error}`);
        }

        const parsed = serverResultSchema.safeParse(rawBody);
        if (!parsed.success) {
          return createErrorResult('Breakpoint scan failed: invalid server response.');
        }

        const { result } = parsed.data;
        const compactResult = {
          url: result.url,
          verdict: result.verdict,
          scannedWidthCount: result.scannedWidths.length,
          minWidth: result.minWidth,
          maxWidth: result.maxWidth,
          step: result.step,
          height: result.height,
          durationMs: result.durationMs,
          issueRanges: result.issueRanges,
        };
        return createStructuredResult(compactResult, formatScanText(result));
      } catch (error) {
        return createErrorResult(await formatToolError('scanning responsive breakpoints', error));
      }
    },
  );
}
