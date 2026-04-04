import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { processManager } from '../process-manager.js';
import { DEVICE_IDS, DEVICES } from '../../../shared/devices.js';
import { KALEIDOSCOPE_SERVER, kaleidoscopeFetch } from '../kaleidoscope-api.js';
import {
  buildScreenshotContent,
  createErrorResult,
  createStructuredResult,
  formatToolError,
  toFileUri,
  toMarkdownImagePath,
  toMarkdownImageTag,
} from '../tool-utils.js';

const ALL_DEVICE_IDS = [...DEVICE_IDS] as [string, ...string[]];
const DEFAULT_CAPTURE_DEVICES = ['iphone-14', 'ipad', 'desktop'] as const;

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
  device: z.string(),
  path: z.string(),
  fileUri: z.string().nullable(),
  preferredDisplayPath: z.string().nullable(),
  preferredDisplayUri: z.string().nullable(),
  chatDisplayPath: z.string().nullable(),
  markdownImageTag: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  width: z.number(),
  height: z.number(),
  error: z.string().nullable(),
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
  displayAdvice: z.string(),
  screenshots: z.array(screenshotEntrySchema),
};

const screenshotInputSchema = {
  url: z.string().url().describe('The URL to screenshot'),
  devices: z.array(z.enum(ALL_DEVICE_IDS)).optional().describe(
    'Device viewports to capture. Defaults to iphone-14, ipad, desktop. ' +
    'Available: iphone-14, samsung-s21, pixel-6, ipad, ipad-pro, macbook-air, desktop, desktop-4k',
  ),
  output_dir: z.string().optional().describe(
    'Directory to save screenshots. Defaults to ./screenshots/',
  ),
  full_page: z.boolean().optional().describe(
    'Capture full scrollable page instead of just the viewport. Default: false',
  ),
} satisfies z.ZodRawShape;

interface ScreenshotEntryResult {
  device: string;
  path: string;
  fileUri: string | null;
  preferredDisplayPath: string | null;
  preferredDisplayUri: string | null;
  chatDisplayPath: string | null;
  markdownImageTag: string | null;
  downloadUrl: string | null;
  width: number;
  height: number;
  error: string | null;
}

interface ScreenshotOutput {
  url: string;
  outputDirectory: string;
  count: number;
  inlineImageCount: number;
  displayAdvice: string;
  screenshots: ScreenshotEntryResult[];
}

export function registerScreenshotTools(server: McpServer) {
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
        'For reliable user-visible rendering in chat, use markdownImageTag or chatDisplayPath instead of localhost download URLs or transient image viewers. ' +
        'Requires Kaleidoscope server to be running.',
      inputSchema: screenshotInputSchema as z.ZodRawShape,
      outputSchema: screenshotOutputSchema as z.ZodRawShape,
    },
    async ({ url, devices: selectedDevices, output_dir, full_page }) => {
      try {
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
          return createErrorResult(`Screenshot capture failed: ${errData.error}`);
        }

        const data = await screenshotRes.json() as {
          screenshots: Array<{ device: string; path: string; width: number; height: number; url?: string }>;
        };

        const screenshots = data.screenshots.map((screenshot) => {
          const error = screenshot.path.startsWith('ERROR:') ? screenshot.path : null;
          const chatDisplayPath = error ? null : toMarkdownImagePath(screenshot.path);
          return {
            device: screenshot.device,
            path: screenshot.path,
            fileUri: error ? null : toFileUri(screenshot.path),
            preferredDisplayPath: error ? null : screenshot.path,
            preferredDisplayUri: error ? null : toFileUri(screenshot.path),
            chatDisplayPath,
            markdownImageTag: error ? null : toMarkdownImageTag(screenshot.path, `${screenshot.device} preview`),
            downloadUrl: screenshot.url ? new URL(screenshot.url, KALEIDOSCOPE_SERVER).toString() : null,
            width: screenshot.width,
            height: screenshot.height,
            error,
          };
        });

        const { content: screenshotContent, inlineImageCount } = await buildScreenshotContent(screenshots);
        const result: ScreenshotOutput = {
          url,
          outputDirectory: outputDir,
          count: screenshots.length,
          inlineImageCount,
          displayAdvice:
            'For reliable chat rendering, paste markdownImageTag directly into the response or use chatDisplayPath inside a Markdown image tag. ' +
            'Do not rely on localhost downloadUrl links, transient inline previews, or temporary image viewers.',
          screenshots,
        };

        const lines = [
          `Screenshots captured for: ${url}`,
          `Output directory: ${outputDir}`,
          '',
        ];

        for (const screenshot of screenshots) {
          const suffix = screenshot.error ? ` [error: ${screenshot.error}]` : '';
          lines.push(`  ${screenshot.device}: ${screenshot.path} (${screenshot.width}x${screenshot.height})${suffix}`);
        }

        lines.push('');
        lines.push(`Total: ${screenshots.length} screenshots saved.`);
        if (inlineImageCount > 0) {
          lines.push(`Inline previews attached: ${inlineImageCount}.`);
        }
        lines.push('For reliable chat rendering, use markdownImageTag or chatDisplayPath from structuredContent; localhost links and transient preview blocks can be flaky.');

        return createStructuredResult(result, lines.join('\n'), screenshotContent);
      } catch (error) {
        return createErrorResult(await formatToolError('capturing screenshots', error));
      }
    },
  );
}
