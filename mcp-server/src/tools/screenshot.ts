import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { processManager } from '../process-manager.js';
import { DEVICE_IDS, DEVICES } from '../../../shared/devices.js';
import { KALEIDOSCOPE_SERVER, kaleidoscopeFetch } from '../kaleidoscope-api.js';
import {
  buildScreenshotContent,
  createScreenshotEntry,
  type ScreenshotCaptureResult,
  type ScreenshotEntryResult,
} from '../screenshot-artifacts.js';
import {
  createErrorResult,
  createStructuredResult,
  formatToolError,
} from '../tool-utils.js';
import { RESULTS_APP_TOOL_META } from '../mcp-app.js';

const DEFAULT_CAPTURE_DEVICES = ['iphone-14', 'ipad', 'desktop'] as const;

function normalizeDeviceLookupKey(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const DEVICE_ALIASES = new Map<string, string>(
  DEVICES.flatMap((device) => {
    const entries: Array<[string, string]> = [
      [device.id, device.id],
      [device.name, device.id],
      [device.id.replace(/-/g, ' '), device.id],
    ];

    return entries.map(([alias, id]) => [normalizeDeviceLookupKey(alias), id]);
  }),
);

export function normalizeScreenshotDevices(requestedDevices: string[]): string[] {
  return [...new Set(requestedDevices.map((requestedDevice) => {
    const deviceId = DEVICE_ALIASES.get(normalizeDeviceLookupKey(requestedDevice));
    if (!deviceId) {
      throw new Error(
        `Unknown device "${requestedDevice}". Use kaleidoscope_list_devices to see supported devices. ` +
        `Available device IDs: ${DEVICE_IDS.join(', ')}`,
      );
    }

    return deviceId;
  }))];
}

const deviceCatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number(),
  height: z.number(),
  type: z.enum(['mobile', 'tablet', 'desktop']),
  category: z.string(),
  isDefault: z.boolean(),
});

const screenshotEntrySchema = z.object({
  deviceId: z.string(),
  device: z.string(),
  path: z.string(),
  fileUri: z.string().nullable(),
  preferredDisplayPath: z.string().nullable(),
  preferredDisplayUri: z.string().nullable(),
  chatDisplayPath: z.string().nullable(),
  markdownImageTag: z.string().nullable(),
  markdownImageTagFallbacks: z.array(z.string()),
  chatSafePath: z.string().nullable(),
  chatSafeMarkdownImageTag: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  width: z.number(),
  height: z.number(),
  error: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

const listDevicesOutputSchema = {
  defaultCaptureDevices: z.array(z.string()),
  devices: z.array(deviceCatalogEntrySchema),
};

const screenshotOutputSchema = {
  url: z.string().url(),
  outputDirectory: z.string(),
  count: z.number(),
  inlineImageCount: z.number(),
  previewWarnings: z.array(z.string()),
  inlinePreviews: z.array(z.object({
    deviceId: z.string(),
    contentIndex: z.number().int().nonnegative(),
    resourceUri: z.string().nullable(),
  })),
  displayAdvice: z.string(),
  primaryMarkdownImageTag: z.string().nullable(),
  finalResponseInstruction: z.string(),
  readyToPasteMarkdown: z.array(z.string()),
  fallbackMarkdownImageTags: z.array(z.string()),
  screenshots: z.array(screenshotEntrySchema),
};

const screenshotInputSchema = {
  url: z.string().url().describe('The URL to screenshot'),
  devices: z.array(z.string()).min(1).max(10).optional().describe(
    'Device viewports to capture. Accepts device IDs or names, for example "iphone-14" or "iPhone 14". ' +
    'Defaults to iphone-14, ipad, desktop. ' +
    `Available IDs: ${DEVICE_IDS.join(', ')}`,
  ),
  output_dir: z.string().max(120).optional().describe(
    'Directory name to save screenshots under the configured screenshot root. Defaults to ./screenshots/. Path traversal is rejected by the server.',
  ),
  full_page: z.boolean().optional().describe(
    'Capture full scrollable page instead of just the viewport. Default: false',
  ),
  wait_until: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().describe(
    'Navigation readiness. Defaults to domcontentloaded; networkidle can time out on pages with ongoing requests.',
  ),
  settle_ms: z.number().int().min(0).max(2000).optional().describe('Delay before capture after navigation. Defaults to 500 ms.'),
  retention_minutes: z.number().min(0).max(10080).optional().describe(
    'Automatically delete saved images and chat copies after this many minutes. Defaults to the server setting (5 minutes). Use 0 to keep files.',
  ),
} satisfies z.ZodRawShape;

const visualDiffInputSchema = {
  baseline_path: z.string().max(2048).describe(
    'Absolute or screenshot-root-relative PNG path returned by an earlier capture_screenshots call.',
  ),
  current_path: z.string().max(2048).describe(
    'Absolute or screenshot-root-relative PNG path returned by a later capture_screenshots call.',
  ),
  color_threshold: z.number().min(0).max(1).optional().describe(
    'Per-pixel perceptual color threshold. Lower is more sensitive. Defaults to 0.1.',
  ),
  allowed_diff_percentage: z.number().min(0).max(100).optional().describe(
    'Maximum changed-pixel percentage still considered unchanged. Defaults to 0.',
  ),
  include_antialiasing: z.boolean().optional().describe(
    'Count anti-aliased pixel differences instead of ignoring them. Defaults to false.',
  ),
  retention_minutes: screenshotInputSchema.retention_minutes,
} satisfies z.ZodRawShape;

const visualDiffOutputSchema = {
  verdict: z.enum(['unchanged', 'changed']),
  baselinePath: z.string(),
  currentPath: z.string(),
  diffPath: z.string(),
  width: z.number(),
  height: z.number(),
  totalPixels: z.number(),
  mismatchedPixels: z.number(),
  mismatchPercentage: z.number(),
  colorThreshold: z.number(),
  allowedDiffPercentage: z.number(),
  includeAntialiasing: z.boolean(),
  diff: screenshotEntrySchema,
} satisfies z.ZodRawShape;

const visualDiffServerResponseSchema = z.object({
  success: z.boolean().optional(),
  verdict: z.enum(['unchanged', 'changed']),
  baselinePath: z.string(),
  currentPath: z.string(),
  diffPath: z.string(),
  diffUrl: z.string(),
  expiresAt: z.string().nullable().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  totalPixels: z.number().int().nonnegative(),
  mismatchedPixels: z.number().int().nonnegative(),
  mismatchPercentage: z.number().min(0).max(100),
  colorThreshold: z.number().min(0).max(1),
  allowedDiffPercentage: z.number().min(0).max(100),
  includeAntialiasing: z.boolean(),
});

const visualDiffErrorResponseSchema = z.object({ error: z.string().optional() });

interface ScreenshotOutput {
  url: string;
  outputDirectory: string;
  count: number;
  inlineImageCount: number;
  previewWarnings: string[];
  inlinePreviews: Array<{
    deviceId: string;
    contentIndex: number;
    resourceUri: string | null;
  }>;
  displayAdvice: string;
  primaryMarkdownImageTag: string | null;
  finalResponseInstruction: string;
  readyToPasteMarkdown: string[];
  fallbackMarkdownImageTags: string[];
  screenshots: ScreenshotEntryResult[];
}

export function registerScreenshotTools(server: McpServer) {
  const registerTool = server.registerTool.bind(server) as (
    name: string,
    config: {
      description: string;
      inputSchema: z.ZodRawShape;
      outputSchema: z.ZodRawShape;
      _meta?: typeof RESULTS_APP_TOOL_META;
    },
    handler: (args: any) => Promise<ReturnType<typeof createStructuredResult> | ReturnType<typeof createErrorResult>>,
  ) => void;

  registerTool(
    'kaleidoscope_list_devices',
    {
      description:
        'List the available Kaleidoscope device presets and the default screenshot set. ' +
        'Use this before capture_screenshots when you want to show users the supported devices or ask which devices they want.',
      inputSchema: {},
      outputSchema: listDevicesOutputSchema as z.ZodRawShape,
    },
    async () => {
      const devices = DEVICES.map((device) => ({
        id: device.id,
        name: device.name,
        width: device.width,
        height: device.height,
        type: device.type,
        category: device.category,
        isDefault: DEFAULT_CAPTURE_DEVICES.includes(device.id as typeof DEFAULT_CAPTURE_DEVICES[number]),
      }));

      const lines = [
        'Available Kaleidoscope devices:',
        ...devices.map((device) => (
          `  ${device.id}: ${device.name} (${device.width}x${device.height}, ${device.type})${device.isDefault ? ' [default]' : ''}`
        )),
        '',
        `Default screenshot set: ${DEFAULT_CAPTURE_DEVICES.join(', ')}`,
      ];

      return createStructuredResult(
        {
          defaultCaptureDevices: [...DEFAULT_CAPTURE_DEVICES],
          devices,
        },
        lines.join('\n'),
      );
    },
  );

  registerTool(
    'capture_screenshots',
    {
      description:
        'Capture screenshots of a URL across multiple device viewport sizes. ' +
        'Returns screenshot metadata, local file paths, file URIs, chat-ready local markdown paths, and inline previews when practical. ' +
        'Includes native MCP image previews for image-capable clients; local Markdown rendering depends on the chat client. ' +
        'Requires Kaleidoscope server to be running.',
      inputSchema: screenshotInputSchema as z.ZodRawShape,
      outputSchema: screenshotOutputSchema as z.ZodRawShape,
      _meta: RESULTS_APP_TOOL_META,
    },
    async ({ url, devices: selectedDevices, output_dir, full_page, wait_until, settle_ms, retention_minutes }) => {
      try {
        const serverReachable = await processManager.isServerReachable();
        if (!serverReachable) {
          await processManager.startServer();
        }

        const devicesToCapture = selectedDevices
          ? normalizeScreenshotDevices(selectedDevices)
          : [...DEFAULT_CAPTURE_DEVICES];
        const outputDir = output_dir ?? './screenshots';

        const screenshotRes = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/screenshots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            devices: devicesToCapture,
            outputDir,
            fullPage: full_page ?? false,
            waitUntil: wait_until,
            settleMs: settle_ms,
            retentionMinutes: retention_minutes,
          }),
        });

        if (!screenshotRes.ok) {
          const errData = await screenshotRes.json() as { error: string };
          return createErrorResult(`Screenshot capture failed: ${errData.error}`);
        }

        const data = await screenshotRes.json() as { screenshots: Array<Omit<ScreenshotCaptureResult, 'deviceId'>> };
        const seenDeviceIds = new Set<string>();
        const screenshots = await Promise.all(
          data.screenshots.map((screenshot) => {
            const deviceId = DEVICE_ALIASES.get(normalizeDeviceLookupKey(screenshot.device));
            if (!deviceId || !devicesToCapture.includes(deviceId) || seenDeviceIds.has(deviceId)) {
              throw new Error(`Screenshot service returned an unknown or duplicate device: ${screenshot.device}`);
            }
            seenDeviceIds.add(deviceId);
            return createScreenshotEntry({ ...screenshot, deviceId }, KALEIDOSCOPE_SERVER);
          }),
        );
        if (seenDeviceIds.size !== devicesToCapture.length) {
          throw new Error('Screenshot service did not return every requested device.');
        }

        // createStructuredResult prepends the human-readable text block.
        const { content: screenshotContent, inlineImageCount, inlinePreviews, previewWarnings } = await buildScreenshotContent(screenshots, 1);
        const readyToPasteMarkdown = screenshots.flatMap((screenshot) => (
          screenshot.markdownImageTag ? [screenshot.markdownImageTag] : []
        ));
        const fallbackMarkdownImageTags = screenshots.flatMap((screenshot) => screenshot.markdownImageTagFallbacks);
        const primaryMarkdownImageTag = readyToPasteMarkdown[0] ?? null;
        const finalResponseInstruction = primaryMarkdownImageTag
          ? `To show the screenshot to the user, include this exact Markdown image tag in your final response: ${primaryMarkdownImageTag}. If it does not render, try a fallback from fallbackMarkdownImageTags.`
          : 'No chat-renderable screenshot Markdown was produced. Report the screenshot path and error details instead.';
        const result: ScreenshotOutput = {
          url,
          outputDirectory: outputDir,
          count: screenshots.length,
          inlineImageCount,
          inlinePreviews,
          previewWarnings,
          displayAdvice:
            'Native MCP image blocks include a preview for each available image, resized when needed. ' +
            'For clients that render local images, use primaryMarkdownImageTag or readyToPasteMarkdown in the final response. ' +
            'Local paths and localhost URLs are not supported by every client. Saved files and chat copies expire at expiresAt; ' +
            'images already embedded in chat are managed by the chat client.',
          primaryMarkdownImageTag,
          finalResponseInstruction,
          readyToPasteMarkdown,
          fallbackMarkdownImageTags,
          screenshots,
        };

        const lines = [
          `Screenshots captured for: ${url}`,
          `Output directory: ${outputDir}`,
          '',
        ];

        if (primaryMarkdownImageTag) {
          lines.push('Show this image in your final response:');
          lines.push(primaryMarkdownImageTag);
          lines.push('');
        }

        for (const screenshot of screenshots) {
          const suffix = screenshot.error ? ` [error: ${screenshot.error}]` : '';
          lines.push(`  ${screenshot.device}: ${screenshot.path} (${screenshot.width}x${screenshot.height})${suffix}`);
        }

        lines.push('');
        const savedCount = screenshots.filter((screenshot) => !screenshot.error).length;
        lines.push(`Total: ${savedCount} screenshots saved; ${screenshots.length - savedCount} failed.`);
        for (const screenshot of screenshots) {
          if (screenshot.expiresAt) lines.push(`${screenshot.device} files expire at ${screenshot.expiresAt}.`);
        }
        lines.push(...previewWarnings.map((warning) => `Preview unavailable: ${warning}`));
        if (inlineImageCount > 0) {
          lines.push(`Inline previews attached: ${inlineImageCount}.`);
        }
        if (readyToPasteMarkdown.length > 0) {
          lines.push('');
          lines.push('Ready-to-paste Markdown image tags:');
          for (const markdownTag of readyToPasteMarkdown) {
            lines.push(markdownTag);
          }
        }
        if (fallbackMarkdownImageTags.length > 0) {
          lines.push('');
          lines.push('Fallback Markdown image tags:');
          for (const markdownTag of fallbackMarkdownImageTags) {
            lines.push(markdownTag);
          }
        }
        lines.push('Native MCP image previews are attached when available. Local Markdown images require client support.');

        return { ...createStructuredResult(result, lines.join('\n'), screenshotContent), ...(savedCount === 0 ? { isError: true } : {}) };
      } catch (error) {
        return createErrorResult(await formatToolError('capturing screenshots', error));
      }
    },
  );

  registerTool(
    'compare_screenshots',
    {
      description:
        'Compare two PNG screenshots pixel by pixel and write a highlighted diff image. ' +
        'Use paths returned by capture_screenshots for the same device and capture mode. ' +
        'Returns exact mismatch counts, percentage, a thresholded verdict, and a chat-ready diff artifact.',
      inputSchema: visualDiffInputSchema,
      outputSchema: visualDiffOutputSchema,
    },
    async ({
      baseline_path,
      current_path,
      color_threshold,
      allowed_diff_percentage,
      include_antialiasing,
      retention_minutes,
    }) => {
      try {
        if (!(await processManager.isServerReachable())) {
          await processManager.startServer();
        }

        const response = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/screenshots/compare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baselinePath: baseline_path,
            currentPath: current_path,
            colorThreshold: color_threshold,
            allowedDiffPercentage: allowed_diff_percentage,
            includeAntialiasing: include_antialiasing,
            retentionMinutes: retention_minutes,
          }),
        });
        const rawBody: unknown = await response.json();
        if (!response.ok) {
          const errorBody = visualDiffErrorResponseSchema.safeParse(rawBody);
          return createErrorResult(
            `Screenshot comparison failed: ${errorBody.success ? errorBody.data.error ?? response.statusText : response.statusText}`,
          );
        }

        const parsedBody = visualDiffServerResponseSchema.safeParse(rawBody);
        if (!parsedBody.success) {
          const issue = parsedBody.error.issues[0];
          const location = issue?.path.length ? issue.path.join('.') : 'response';
          return createErrorResult(
            `Screenshot comparison failed: invalid server response (${location}: ${issue?.message ?? 'schema mismatch'}).`,
          );
        }
        const body = parsedBody.data;

        const diff = await createScreenshotEntry({
          deviceId: 'visual-diff',
          device: 'Pixel diff',
          path: body.diffPath,
          width: body.width,
          height: body.height,
          url: body.diffUrl,
          expiresAt: body.expiresAt,
        }, KALEIDOSCOPE_SERVER);
        const { content } = await buildScreenshotContent([diff]);
        const result = {
          verdict: body.verdict,
          baselinePath: body.baselinePath,
          currentPath: body.currentPath,
          diffPath: body.diffPath,
          width: body.width,
          height: body.height,
          totalPixels: body.totalPixels,
          mismatchedPixels: body.mismatchedPixels,
          mismatchPercentage: body.mismatchPercentage,
          colorThreshold: body.colorThreshold,
          allowedDiffPercentage: body.allowedDiffPercentage,
          includeAntialiasing: body.includeAntialiasing,
          diff,
        };
        const text = [
          `Pixel comparison: ${body.verdict}`,
          `Changed pixels: ${body.mismatchedPixels}/${body.totalPixels} (${body.mismatchPercentage.toFixed(4)}%)`,
          `Allowed difference: ${body.allowedDiffPercentage}%`,
          `Diff image: ${body.diffPath}`,
          diff.markdownImageTag ? `Show the diff with: ${diff.markdownImageTag}` : '',
        ].filter(Boolean).join('\n');

        return createStructuredResult(result, text, content);
      } catch (error) {
        return createErrorResult(await formatToolError('comparing screenshots', error));
      }
    },
  );
}
