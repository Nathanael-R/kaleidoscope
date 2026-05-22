import { mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { chromium, type Locator, type Page } from 'playwright';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { DEVICE_IDS, DEVICES, type SharedDevice } from '../../../shared/devices.js';
import {
  createErrorResult,
  createStructuredResult,
  formatToolError,
  toFileUri,
} from '../tool-utils.js';

const ALL_DEVICE_IDS = [...DEVICE_IDS] as [string, ...string[]];
const DEFAULT_DEVICE_ID = 'desktop';
const DEFAULT_OUTPUT_DIR = 'walkthroughs';
const WALKTHROUGH_OUTPUT_DIR_ENV = 'KALEIDOSCOPE_WALKTHROUGH_DIR';
const ARTIFACT_ROOT_ENV = 'KALEIDOSCOPE_ARTIFACT_ROOT';
const DEFAULT_ARTIFACT_MODE = 'deliverable';
const DEFAULT_SLOW_MO_MS = 180;
const DEFAULT_WAIT_AFTER_STEP_MS = 350;
const MAX_RECORDING_EDGE = 1280;
const MAX_WALKTHROUGH_STEPS = 50;
const MAX_SCRIPT_CHARS = 10_000;
const MAX_SELECTOR_CHARS = 1000;
const MAX_TEXT_CHARS = 5000;
const MAX_URL_CHARS = 2048;

const urlSchema = z.string().url().max(MAX_URL_CHARS).refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}, 'Only http:// and https:// URLs are supported.');
const selectorSchema = z.string().min(1).max(MAX_SELECTOR_CHARS);

const cursorOverlayScript = `
(() => {
  const rootId = '__kaleidoscope_cursor_overlay';
  const pulseClass = '__kaleidoscope_cursor_pulse';

  function install() {
    if (document.getElementById(rootId)) {
      return;
    }

    const style = document.createElement('style');
    style.textContent = \`
      #\${rootId} {
        position: fixed;
        top: 0;
        left: 0;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        border: 2px solid rgba(14, 165, 233, 0.96);
        background: rgba(14, 165, 233, 0.18);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.92), 0 8px 24px rgba(14, 165, 233, 0.3);
        pointer-events: none;
        transform: translate(-50%, -50%);
        z-index: 2147483647;
        transition: left 80ms linear, top 80ms linear, transform 120ms ease;
      }

      #\${rootId}[data-clicking="true"] {
        transform: translate(-50%, -50%) scale(0.9);
      }

      .\${pulseClass} {
        position: fixed;
        width: 22px;
        height: 22px;
        border-radius: 999px;
        border: 2px solid rgba(14, 165, 233, 0.55);
        pointer-events: none;
        transform: translate(-50%, -50%) scale(1);
        animation: kaleidoscope-cursor-pulse 420ms ease-out forwards;
        z-index: 2147483646;
      }

      @keyframes kaleidoscope-cursor-pulse {
        from {
          opacity: 0.9;
          transform: translate(-50%, -50%) scale(0.7);
        }

        to {
          opacity: 0;
          transform: translate(-50%, -50%) scale(2.4);
        }
      }
    \`;

    document.head.appendChild(style);

    const cursor = document.createElement('div');
    cursor.id = rootId;
    cursor.style.left = '24px';
    cursor.style.top = '24px';
    document.body.appendChild(cursor);

    const moveCursor = (x, y) => {
      cursor.style.left = \`\${x}px\`;
      cursor.style.top = \`\${y}px\`;
    };

    const pulse = (x, y) => {
      const ring = document.createElement('div');
      ring.className = pulseClass;
      ring.style.left = \`\${x}px\`;
      ring.style.top = \`\${y}px\`;
      document.body.appendChild(ring);
      setTimeout(() => ring.remove(), 450);
    };

    document.addEventListener('mousemove', (event) => {
      moveCursor(event.clientX, event.clientY);
    }, true);

    document.addEventListener('mousedown', (event) => {
      cursor.setAttribute('data-clicking', 'true');
      moveCursor(event.clientX, event.clientY);
      pulse(event.clientX, event.clientY);
    }, true);

    document.addEventListener('mouseup', () => {
      cursor.setAttribute('data-clicking', 'false');
    }, true);
  }

  const ensure = () => {
    if (!document.body || !document.head) {
      requestAnimationFrame(ensure);
      return;
    }

    install();
  };

  ensure();
})();
`;

const clickStepSchema = z.object({
  action: z.literal('click'),
  selector: selectorSchema,
  button: z.enum(['left', 'middle', 'right']).optional(),
  clickCount: z.number().int().min(1).max(3).optional(),
});

const hoverStepSchema = z.object({
  action: z.literal('hover'),
  selector: selectorSchema,
});

const typeStepSchema = z.object({
  action: z.literal('type'),
  selector: selectorSchema,
  text: z.string().max(MAX_TEXT_CHARS),
  clear: z.boolean().optional(),
  delayMs: z.number().int().min(0).max(1000).optional(),
});

const pressStepSchema = z.object({
  action: z.literal('press'),
  key: z.string().min(1).max(80),
});

const waitStepSchema = z.object({
  action: z.literal('wait'),
  ms: z.number().int().min(0).max(120_000),
});

const scrollStepSchema = z.object({
  action: z.literal('scroll'),
  deltaX: z.number().optional(),
  deltaY: z.number(),
});

const gotoStepSchema = z.object({
  action: z.literal('goto'),
  url: urlSchema,
});

const selectStepSchema = z.object({
  action: z.literal('select'),
  selector: selectorSchema,
  value: z.string().max(MAX_TEXT_CHARS),
});

const walkthroughStepSchema = z.discriminatedUnion('action', [
  clickStepSchema,
  hoverStepSchema,
  typeStepSchema,
  pressStepSchema,
  waitStepSchema,
  scrollStepSchema,
  gotoStepSchema,
  selectStepSchema,
]);
const walkthroughStepsSchema = z.array(walkthroughStepSchema).min(1).max(MAX_WALKTHROUGH_STEPS);

const walkthroughInputSchema = {
  url: urlSchema.describe('The page to open before recording starts.'),
  steps: walkthroughStepsSchema.optional().describe(
    'Ordered structured interaction steps. Supported actions: click, hover, type, press, wait, scroll, goto, select.',
  ),
  script: z.string().max(MAX_SCRIPT_CHARS).optional().describe(
    'Optional natural-language walkthrough script, one step per line. ' +
    'Examples: "click #save", "type \\"hello@example.com\\" into #email", "wait 800ms".',
  ),
  device: z.enum(ALL_DEVICE_IDS).optional().describe(
    'Single device viewport to emulate. Defaults to desktop. ' +
    'Available: iphone-14, samsung-s21, pixel-6, ipad, ipad-pro, macbook-air, desktop, desktop-4k',
  ),
  output_dir: z.string().max(500).optional().describe(
    `Directory to save recorded videos. Must stay inside ${ARTIFACT_ROOT_ENV} or ${WALKTHROUGH_OUTPUT_DIR_ENV}. Defaults to ${DEFAULT_OUTPUT_DIR}`,
  ),
  artifact_mode: z.enum(['deliverable', 'inspection']).optional().describe(
    'Artifact intent. deliverable uses output_dir/env/defaults; inspection defaults to the OS temp directory unless output_dir is provided.',
  ),
  include_cursor: z.boolean().optional().describe(
    'If true, inject a visible cursor overlay with click pulses into the recording. Default: true',
  ),
  slow_mo_ms: z.number().int().min(0).max(1000).optional().describe(
    `Optional Playwright slow-motion delay between low-level actions. Default: ${DEFAULT_SLOW_MO_MS}`,
  ),
  name: z.string().max(120).optional().describe(
    'Optional file name prefix for the saved walkthrough video.',
  ),
} satisfies z.ZodRawShape;

const walkthroughOutputSchema = {
  url: z.string().url(),
  artifactMode: z.enum(['deliverable', 'inspection']),
  deviceId: z.string(),
  deviceName: z.string(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }),
  recordingSize: z.object({
    width: z.number(),
    height: z.number(),
  }),
  outputDirectory: z.string(),
  videoPath: z.string(),
  fileUri: z.string().nullable(),
  mimeType: z.string(),
  stepsExecuted: z.number(),
  stepSummaries: z.array(z.string()),
  cursorOverlayEnabled: z.boolean(),
  displayAdvice: z.string(),
};

type WalkthroughStep = z.infer<typeof walkthroughStepSchema>;
type WalkthroughRequest = z.infer<typeof walkthroughRequestSchema>;
type ArtifactMode = 'deliverable' | 'inspection';

const walkthroughRequestSchema = z.object({
  url: urlSchema,
  steps: walkthroughStepsSchema.optional(),
  script: z.string().max(MAX_SCRIPT_CHARS).optional(),
  device: z.enum(ALL_DEVICE_IDS).optional(),
  output_dir: z.string().max(500).optional(),
  artifact_mode: z.enum(['deliverable', 'inspection']).optional(),
  include_cursor: z.boolean().optional(),
  slow_mo_ms: z.number().int().min(0).max(1000).optional(),
  name: z.string().max(120).optional(),
}).superRefine((value, ctx) => {
  const hasSteps = Boolean(value.steps && value.steps.length > 0);
  const hasScript = Boolean(value.script?.trim());

  if (hasSteps === hasScript) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide exactly one of steps or script.',
      path: ['steps'],
    });
  }
});

interface WalkthroughResult {
  url: string;
  artifactMode: ArtifactMode;
  deviceId: string;
  deviceName: string;
  viewport: {
    width: number;
    height: number;
  };
  recordingSize: {
    width: number;
    height: number;
  };
  outputDirectory: string;
  videoPath: string;
  fileUri: string | null;
  mimeType: string;
  stepsExecuted: number;
  stepSummaries: string[];
  cursorOverlayEnabled: boolean;
  displayAdvice: string;
}

export function sanitizeWalkthroughFileStem(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'walkthrough';
}

function isPathInside(baseDir: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return relative === '' || (relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function containsTraversal(input: string): boolean {
  return input.split(/[\\/]+/).some((segment) => segment === '..');
}

function resolveSafeOutputDir(explicitOutputDir: string, rootDir: string): string {
  const explicit = explicitOutputDir.trim();
  if (!explicit || explicit.includes('\0') || containsTraversal(explicit)) {
    throw new Error('output_dir must be a safe directory path without null bytes or .. traversal segments.');
  }

  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, explicit);
  if (!isPathInside(root, resolved)) {
    throw new Error(`output_dir must stay inside ${ARTIFACT_ROOT_ENV} or ${WALKTHROUGH_OUTPUT_DIR_ENV}.`);
  }

  return resolved;
}

export function resolveWalkthroughOutputDir(
  explicitOutputDir?: string,
  artifactMode: ArtifactMode = DEFAULT_ARTIFACT_MODE,
): string {
  const explicit = explicitOutputDir?.trim();

  if (artifactMode === 'inspection') {
    return explicit
      ? resolveSafeOutputDir(explicit, process.env[ARTIFACT_ROOT_ENV]?.trim() || tmpdir())
      : path.resolve(tmpdir(), 'kaleidoscope-walkthroughs');
  }

  const configured = process.env[WALKTHROUGH_OUTPUT_DIR_ENV]?.trim();
  const root = process.env[ARTIFACT_ROOT_ENV]?.trim() || configured || process.cwd();

  if (explicit) {
    return resolveSafeOutputDir(explicit, root);
  }

  if (configured) {
    return path.resolve(configured);
  }

  return path.resolve(root, DEFAULT_OUTPUT_DIR);
}

export function scaleRecordingSize(width: number, height: number): { width: number; height: number } {
  const largestEdge = Math.max(width, height);
  if (largestEdge <= MAX_RECORDING_EDGE) {
    return { width, height };
  }

  const ratio = MAX_RECORDING_EDGE / largestEdge;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

export function summarizeWalkthroughStep(step: WalkthroughStep): string {
  switch (step.action) {
    case 'click':
      return `click ${step.selector}`;
    case 'hover':
      return `hover ${step.selector}`;
    case 'type':
      return `type "${step.text.slice(0, 40)}" into ${step.selector}`;
    case 'press':
      return `press ${step.key}`;
    case 'wait':
      return `wait ${step.ms}ms`;
    case 'scroll':
      return `scroll by (${step.deltaX ?? 0}, ${step.deltaY})`;
    case 'goto':
      return `navigate to ${step.url}`;
    case 'select':
      return `select "${step.value}" in ${step.selector}`;
  }
}

function normalizeScriptLine(line: string): string {
  return line
    .trim()
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .trim();
}

function unquoteToken(input: string): string {
  const trimmed = input.trim();
  const quotePairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['`', '`'],
  ];

  for (const [start, end] of quotePairs) {
    if (trimmed.startsWith(start) && trimmed.endsWith(end) && trimmed.length >= 2) {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}

function parseWaitDuration(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(ms|millisecond|milliseconds|s|sec|secs|second|seconds)?$/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  const unit = match[2]?.toLowerCase() ?? 'ms';
  if (unit === 'ms' || unit === 'millisecond' || unit === 'milliseconds') {
    return Math.round(value);
  }

  return Math.round(value * 1000);
}

export function parseWalkthroughScript(script: string): WalkthroughStep[] {
  if (script.length > MAX_SCRIPT_CHARS) {
    throw new Error(`Walkthrough script must be ${MAX_SCRIPT_CHARS} characters or fewer.`);
  }

  const steps: WalkthroughStep[] = [];
  const lines = script.split(/\r?\n/);

  for (const [index, rawLine] of lines.entries()) {
    const line = normalizeScriptLine(rawLine);
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }

    let match: RegExpMatchArray | null = null;

    match = line.match(/^click(?:\s+on)?\s+(.+)$/i);
    if (match) {
      steps.push({ action: 'click', selector: match[1].trim() });
      continue;
    }

    match = line.match(/^hover\s+(.+)$/i);
    if (match) {
      steps.push({ action: 'hover', selector: match[1].trim() });
      continue;
    }

    match = line.match(/^(?:type|enter)\s+(.+?)\s+(?:into|in)\s+(.+)$/i);
    if (match) {
      steps.push({
        action: 'type',
        text: unquoteToken(match[1]),
        selector: match[2].trim(),
      });
      continue;
    }

    match = line.match(/^press\s+(.+)$/i);
    if (match) {
      steps.push({ action: 'press', key: match[1].trim() });
      continue;
    }

    match = line.match(/^wait\s+(.+)$/i);
    if (match) {
      const ms = parseWaitDuration(match[1]);
      if (ms === null) {
        throw new Error(`Invalid wait duration on line ${index + 1}: ${rawLine.trim()}`);
      }

      steps.push({ action: 'wait', ms });
      continue;
    }

    match = line.match(/^scroll(?:\s+by)?\s+(-?\d+)\s*$/i);
    if (match) {
      steps.push({ action: 'scroll', deltaY: Number(match[1]) });
      continue;
    }

    match = line.match(/^scroll\s+(down|up)\s+(\d+)$/i);
    if (match) {
      const magnitude = Number(match[2]);
      steps.push({
        action: 'scroll',
        deltaY: match[1].toLowerCase() === 'up' ? -magnitude : magnitude,
      });
      continue;
    }

    match = line.match(/^(?:goto|open|navigate\s+to)\s+(https?:\/\/\S+)$/i);
    if (match) {
      steps.push({ action: 'goto', url: match[1] });
      continue;
    }

    match = line.match(/^(?:select|choose)\s+(.+?)\s+(?:in|from)\s+(.+)$/i);
    if (match) {
      steps.push({
        action: 'select',
        value: unquoteToken(match[1]),
        selector: match[2].trim(),
      });
      continue;
    }

    throw new Error(
      `Could not parse walkthrough script line ${index + 1}: ${rawLine.trim()}. ` +
      'Supported commands: click, hover, type ... into ..., press, wait, scroll, goto/open, select ... in ...',
    );
  }

  if (steps.length === 0) {
    throw new Error('Walkthrough script did not contain any actionable steps.');
  }

  if (steps.length > MAX_WALKTHROUGH_STEPS) {
    throw new Error(`Walkthroughs are limited to ${MAX_WALKTHROUGH_STEPS} steps.`);
  }

  return steps;
}

function resolveWalkthroughSteps(request: WalkthroughRequest): WalkthroughStep[] {
  if (request.steps) {
    return request.steps;
  }

  return parseWalkthroughScript(request.script ?? '');
}

function getDevice(deviceId?: string): SharedDevice {
  return DEVICES.find((device) => device.id === (deviceId ?? DEFAULT_DEVICE_ID))
    ?? DEVICES.find((device) => device.id === DEFAULT_DEVICE_ID)
    ?? DEVICES[0]!;
}

function timestampSuffix(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function waitForPageSettled(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.waitForLoadState('networkidle', { timeout: 5_000 });
  } catch {
    // Some apps keep long-running connections alive; domcontentloaded is good enough.
  }
}

async function centerPoint(locator: Locator): Promise<{ x: number; y: number } | null> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    return null;
  }

  return {
    x: box.x + (box.width / 2),
    y: box.y + (box.height / 2),
  };
}

async function moveMouseToLocator(page: Page, locator: Locator) {
  const point = await centerPoint(locator);
  if (!point) {
    return null;
  }

  await page.mouse.move(point.x, point.y, { steps: 16 });
  return point;
}

async function performStep(page: Page, step: WalkthroughStep) {
  switch (step.action) {
    case 'click': {
      const locator = page.locator(step.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 30_000 });
      const point = await moveMouseToLocator(page, locator);
      if (point) {
        await page.mouse.click(point.x, point.y, {
          button: step.button ?? 'left',
          clickCount: step.clickCount ?? 1,
        });
      } else {
        await locator.click({
          button: step.button ?? 'left',
          clickCount: step.clickCount ?? 1,
        });
      }
      break;
    }

    case 'hover': {
      const locator = page.locator(step.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 30_000 });
      const point = await moveMouseToLocator(page, locator);
      if (!point) {
        await locator.hover();
      }
      break;
    }

    case 'type': {
      const locator = page.locator(step.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 30_000 });
      const point = await moveMouseToLocator(page, locator);
      if (point) {
        await page.mouse.click(point.x, point.y);
      } else {
        await locator.click();
      }

      if (step.clear ?? true) {
        await locator.fill('');
      }

      await locator.pressSequentially(step.text, { delay: step.delayMs ?? 65 });
      break;
    }

    case 'press':
      await page.keyboard.press(step.key);
      break;

    case 'wait':
      await page.waitForTimeout(step.ms);
      break;

    case 'scroll':
      await page.mouse.wheel(step.deltaX ?? 0, step.deltaY);
      break;

    case 'goto':
      await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await waitForPageSettled(page);
      break;

    case 'select': {
      const locator = page.locator(step.selector).first();
      await locator.waitFor({ state: 'visible', timeout: 30_000 });
      const point = await moveMouseToLocator(page, locator);
      if (point) {
        await page.mouse.click(point.x, point.y);
      }
      await locator.selectOption(step.value);
      break;
    }
  }

  await page.waitForTimeout(DEFAULT_WAIT_AFTER_STEP_MS);
}

export function registerWalkthroughTools(server: McpServer) {
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
    'record_walkthrough',
    {
      description:
        'Record a scripted video walkthrough of a page using Playwright. ' +
        'Useful for feature demos, bug reproductions, or showing a flow with a visible cursor overlay. ' +
        'Returns the saved local video path plus metadata for the captured walkthrough. ' +
        `Deliverable recordings use output_dir when provided, otherwise ${WALKTHROUGH_OUTPUT_DIR_ENV}, otherwise ${DEFAULT_OUTPUT_DIR}. ` +
        'Inspection recordings default to the OS temp directory unless output_dir is provided.',
      inputSchema: walkthroughInputSchema as z.ZodRawShape,
      outputSchema: walkthroughOutputSchema as z.ZodRawShape,
    },
    async (rawArgs) => {
      let request: WalkthroughRequest;
      try {
        request = walkthroughRequestSchema.parse(rawArgs);
      } catch (error) {
        return createErrorResult(error instanceof Error ? error.message : 'Invalid walkthrough input.');
      }

      const { url, device: deviceId, output_dir, include_cursor, slow_mo_ms, name } = request;
      let steps: WalkthroughStep[];
      try {
        steps = walkthroughStepsSchema.parse(resolveWalkthroughSteps(request));
      } catch (error) {
        return createErrorResult(error instanceof Error ? error.message : 'Invalid walkthrough steps.');
      }
      const artifactMode = request.artifact_mode ?? DEFAULT_ARTIFACT_MODE;
      const device = getDevice(deviceId);
      let outputDirectory: string;
      try {
        outputDirectory = resolveWalkthroughOutputDir(output_dir, artifactMode);
      } catch (error) {
        return createErrorResult(error instanceof Error ? error.message : 'Invalid output_dir.');
      }
      const recordingSize = scaleRecordingSize(device.width, device.height);
      const fileStem = sanitizeWalkthroughFileStem(name ?? `${device.id}-${new URL(url).hostname}`);
      const finalVideoPath = path.join(outputDirectory, `${fileStem}-${timestampSuffix()}.webm`);
      const cursorOverlayEnabled = include_cursor ?? true;

      let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

      try {
        await mkdir(outputDirectory, { recursive: true });

        browser = await chromium.launch({
          headless: true,
          slowMo: slow_mo_ms ?? DEFAULT_SLOW_MO_MS,
        });

        const context = await browser.newContext({
          viewport: {
            width: device.width,
            height: device.height,
          },
          recordVideo: {
            dir: outputDirectory,
            size: recordingSize,
          },
        });

        const page = await context.newPage();
        if (cursorOverlayEnabled) {
          await page.addInitScript({ content: cursorOverlayScript });
        }

        let video = page.video();
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await waitForPageSettled(page);

          for (const step of steps as WalkthroughStep[]) {
            await performStep(page, step);
          }

          await page.waitForTimeout(600);
        } finally {
          await context.close().catch(() => undefined);
        }

        await browser.close();
        browser = null;

        const recordedVideoPath = await video?.path();
        if (!recordedVideoPath) {
          throw new Error('Playwright did not return a recorded video path.');
        }

        await rename(recordedVideoPath, finalVideoPath);

        const result: WalkthroughResult = {
          url,
          artifactMode,
          deviceId: device.id,
          deviceName: device.name,
          viewport: {
            width: device.width,
            height: device.height,
          },
          recordingSize,
          outputDirectory,
          videoPath: finalVideoPath,
          fileUri: toFileUri(finalVideoPath),
          mimeType: 'video/webm',
          stepsExecuted: steps.length,
          stepSummaries: steps.map((step) => summarizeWalkthroughStep(step)),
          cursorOverlayEnabled,
          displayAdvice:
            artifactMode === 'inspection'
              ? 'This walkthrough was saved as an inspection artifact in a temporary location. Use videoPath or fileUri to review it while debugging. Some MCP clients will show the attached resource link, but not every chat surface can inline-play video yet.'
              : 'Open the local video file from videoPath or fileUri to review the walkthrough. Some MCP clients will show the attached resource link, but not every chat surface can inline-play video yet.',
        };

        const content: ContentBlock[] = [];
        if (result.fileUri) {
          content.push({
            type: 'resource_link',
            name: `${device.name} walkthrough`,
            uri: result.fileUri,
            mimeType: result.mimeType,
            description: `${device.name} walkthrough video with ${result.stepsExecuted} scripted step(s)`,
          });
        }

        const lines = [
          `Walkthrough recorded for: ${url}`,
          `Artifact mode: ${artifactMode}`,
          `Device: ${device.name} (${device.width}x${device.height})`,
          `Saved video: ${finalVideoPath}`,
          '',
          'Steps:',
          ...result.stepSummaries.map((summary, index) => `  ${index + 1}. ${summary}`),
          '',
          result.displayAdvice,
        ];

        return createStructuredResult(result, lines.join('\n'), content);
      } catch (error) {
        if (browser) {
          await browser.close().catch(() => undefined);
        }

        return createErrorResult(await formatToolError('recording walkthrough', error));
      }
    },
  );
}
