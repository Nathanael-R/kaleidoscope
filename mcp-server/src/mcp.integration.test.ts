import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAbWQAAAAASUVORK5CYII=';

let apiServer: Server;
let clientServer: Server;
let apiBaseUrl = '';
let clientBaseUrl = '';
let transport: StdioClientTransport | null = null;
let client: Client | null = null;
let tempDir = '';
let screenshotPath = '';

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected a bound TCP address');
  }

  return address.port;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res: ServerResponse, body: unknown, status = 200) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function createLayoutCapture(id: string) {
  return {
    id,
    url: 'http://127.0.0.1:3100/checkout',
    sourceDir: null,
    capturedAt: '2026-07-04T00:00:00.000Z',
    updatedAt: '2026-07-04T00:00:00.000Z',
    durationMs: 12,
    devices: [
      {
        device: {
          id: 'desktop',
          name: 'Desktop HD',
          type: 'desktop',
          width: 1920,
          height: 1080,
        },
        page: {
          title: 'Checkout',
          url: 'http://127.0.0.1:3100/checkout',
        },
        viewport: {
          width: 1920,
          height: 1080,
          scrollWidth: 1920,
          scrollHeight: 1080,
        },
        elements: [
          {
            key: 'button|0',
            selector: '[data-testid="save-button"]',
            selectorKind: 'test-id',
            selectorStability: 'stable',
            fallbackKey: 'button|button|save-button',
            structuralPath: 'html > body:nth-of-type(1) > button:nth-of-type(1)',
            tagName: 'button',
            role: 'button',
            text: 'Save changes',
            accessibleName: 'Save changes',
            attributes: {
              id: null,
              className: null,
              testId: 'save-button',
              ariaLabel: null,
              name: null,
              href: null,
              type: 'button',
            },
            rect: {
              x: 10,
              y: 20,
              width: 120,
              height: 40,
              top: 20,
              right: 130,
              bottom: 60,
              left: 10,
            },
            depth: 2,
            visible: true,
            source: {
              filePath: 'src/App.tsx',
              lineNumber: 42,
              columnNumber: 7,
              componentName: 'SaveButton',
            },
          },
        ],
        stats: {
          elementCount: 1,
          capturedCount: 1,
          truncated: false,
        },
        diagnostics: [],
      },
    ],
    warnings: [],
  };
}

function createLayoutDiff(beforeCaptureId: string, afterCaptureId: string) {
  return {
    verdict: 'noChange',
    beforeCaptureId,
    afterCaptureId,
    url: 'http://127.0.0.1:3100/checkout',
    deviceCount: 1,
    changedDeviceCount: 0,
    changeCount: 0,
    truncated: false,
    coverageChanged: false,
    devices: [
      {
        device: {
          id: 'desktop',
          name: 'Desktop HD',
          type: 'desktop',
          width: 1920,
          height: 1080,
        },
        beforeElementCount: 1,
        afterElementCount: 1,
        matchedCount: 1,
        changes: [],
        diagnostics: [],
      },
    ],
    warnings: [],
  };
}

test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'kaleidoscope-mcp-'));
  const screenshotDir = join(tempDir, 'folder with spaces');
  mkdirSync(screenshotDir, { recursive: true });
  screenshotPath = join(screenshotDir, 'desktop test.png');
  writeFileSync(screenshotPath, Buffer.from(TINY_PNG_BASE64, 'base64'));

  apiServer = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (requestUrl.pathname === '/api/health') {
      return sendJson(res, { status: 'ok' });
    }

    if (requestUrl.pathname === '/api/screenshots' && req.method === 'POST') {
      return sendJson(res, {
        success: true,
        screenshots: [
          {
            device: 'Desktop HD',
            path: screenshotPath,
            width: 1920,
            height: 1080,
            url: '/api/screenshots-files/folder with spaces/desktop test.png',
          },
        ],
      });
    }

    if (requestUrl.pathname === '/api/inspect/discover' && req.method === 'POST') {
      const body = await readJson(req) as { query?: string; device?: unknown };
      return sendJson(res, {
        success: true,
        page: {
          title: 'Checkout',
          url: 'http://127.0.0.1:3100/checkout',
        },
        device: body.device ?? null,
        query: body.query ?? '',
        candidates: [
          {
            selector: '#save',
            tagName: 'button',
            text: 'Save changes',
            role: 'button',
            attributes: {
              id: 'save',
              className: 'primary',
              ariaLabel: 'Save changes',
              title: null,
              name: null,
              placeholder: null,
              testId: 'save-button',
            },
            score: 120,
            reasons: ['exact text match'],
          },
        ],
      });
    }

    if (requestUrl.pathname === '/api/inspect/selector' && req.method === 'POST') {
      const body = await readJson(req) as { selector?: string; device?: unknown };
      return sendJson(res, {
        success: true,
        result: {
          capability: 'partial',
          resolver: 'heuristic',
          confidence: 'medium',
          page: {
            title: 'Checkout',
            url: 'http://127.0.0.1:3100/checkout',
          },
          device: body.device ?? null,
          selector: body.selector ?? null,
          tagName: 'button',
          text: 'Save changes',
          componentName: 'SaveButton',
          source: {
            filePath: 'src/App.tsx',
            lineNumber: 42,
            columnNumber: 7,
          },
          stack: [],
          diagnostics: ['Heuristic source match used.'],
        },
      });
    }

    if (requestUrl.pathname === '/api/screenshots/compare' && req.method === 'POST') {
      const body = await readJson(req) as { baselinePath?: string; currentPath?: string };
      return sendJson(res, {
        success: true,
        verdict: 'changed',
        baselinePath: body.baselinePath,
        currentPath: body.currentPath,
        diffPath: screenshotPath,
        diffUrl: '/api/screenshots-files/folder with spaces/desktop test.png',
        width: 1,
        height: 1,
        totalPixels: 1,
        mismatchedPixels: 1,
        mismatchPercentage: 100,
        colorThreshold: 0.1,
        allowedDiffPercentage: 0,
        includeAntialiasing: false,
      });
    }

    if (requestUrl.pathname === '/api/layout/capture' && req.method === 'POST') {
      return sendJson(res, {
        success: true,
        capture: createLayoutCapture('layout_00000000-0000-0000-0000-000000000001'),
      });
    }

    if (requestUrl.pathname === '/api/layout/after-edit' && req.method === 'POST') {
      return sendJson(res, {
        success: true,
        baselineCaptureId: 'layout_00000000-0000-0000-0000-000000000001',
        afterCaptureId: 'layout_00000000-0000-0000-0000-000000000002',
        verdict: 'noChange',
        summary: {
          verdict: 'noChange',
          text: 'noChange: 1 device(s) checked (desktop); no visible layout/text changes detected.',
          changedDevices: [],
          topChanges: [],
        },
        diff: {
          ...createLayoutDiff(
            'layout_00000000-0000-0000-0000-000000000001',
            'layout_00000000-0000-0000-0000-000000000002',
          ),
        },
        capture: createLayoutCapture('layout_00000000-0000-0000-0000-000000000002'),
      });
    }

    if (requestUrl.pathname === '/api/breakpoints/scan' && req.method === 'POST') {
      return sendJson(res, {
        success: true,
        result: {
          url: 'http://127.0.0.1:3100/checkout',
          minWidth: 320,
          maxWidth: 400,
          step: 16,
          height: 900,
          scannedWidths: [320, 336, 352, 368, 384, 400],
          issueRanges: [
            {
              type: 'horizontal-overflow',
              key: 'document',
              message: 'document is 24px wider than the viewport',
              selector: null,
              startWidth: 320,
              endWidth: 336,
              sampledWidths: [320, 336],
              maxOverflowPx: 24,
            },
          ],
          verdict: 'issues-found',
          durationMs: 45,
        },
      });
    }

    sendJson(res, { error: `Unhandled route ${requestUrl.pathname}` }, 404);
  });

  clientServer = createServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><html><head><title>Kaleidoscope</title></head><body><div id="root"></div></body></html>');
  });

  const apiPort = await listen(apiServer);
  const clientPort = await listen(clientServer);
  apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  clientBaseUrl = `http://127.0.0.1:${clientPort}`;

  transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/index.ts'],
    cwd: process.cwd(),
    env: {
      KALEIDOSCOPE_SERVER_URL: apiBaseUrl,
      KALEIDOSCOPE_CLIENT_PORT: String(clientPort),
    },
    stderr: 'pipe',
  });

  transport.stderr?.on('data', () => {
    // Suppress MCP server stderr noise during tests.
  });

  client = new Client({ name: 'mcp-integration-test', version: '1.0.0' });
  await client.connect(transport);
});

test.after(async () => {
  await client?.close();
  await transport?.close();
  await Promise.all([closeServer(apiServer), closeServer(clientServer)]);
  rmSync(tempDir, { recursive: true, force: true });
});

test('lists tools with output schemas', async () => {
  assert.ok(client, 'client should be connected');

  const tools = await client.listTools();
  const toolMap = new Map(tools.tools.map((tool) => [tool.name, tool]));

  assert.equal(toolMap.size, 10);
  assert.ok(toolMap.get('kaleidoscope_list_devices')?.outputSchema);
  assert.ok(toolMap.get('preview_responsive')?.outputSchema);
  assert.ok(toolMap.get('capture_screenshots')?.outputSchema);
  assert.ok(toolMap.get('compare_screenshots')?.outputSchema);
  assert.ok(toolMap.get('inspect_element_source')?.outputSchema);
  assert.ok(toolMap.get('kaleidoscope_read_layout')?.outputSchema);
  assert.ok(toolMap.get('kaleidoscope_after_edit')?.outputSchema);
  assert.ok(toolMap.get('kaleidoscope_scan_breakpoints')?.outputSchema);
});

test('kaleidoscope_list_devices returns device presets and defaults', async () => {
  assert.ok(client, 'client should be connected');

  const result = await client.callTool({
    name: 'kaleidoscope_list_devices',
    arguments: {},
  });

  assert.equal(result.isError, undefined);
  const structured = result.structuredContent as {
    defaultCaptureDevices: string[];
    devices: Array<{ id: string; isDefault: boolean }>;
  };

  assert.deepEqual(structured.defaultCaptureDevices, ['iphone-14', 'ipad', 'desktop']);
  assert.ok(structured.devices.some((device) => device.id === 'iphone-14' && device.isDefault));
  assert.ok(structured.devices.some((device) => device.id === 'desktop' && device.isDefault));
  assert.ok(structured.devices.some((device) => device.id === 'desktop-4k' && !device.isDefault));
});

test('preview_responsive returns structured content', async () => {
  assert.ok(client, 'client should be connected');

  const result = await client.callTool({
    name: 'preview_responsive',
    arguments: {
      url: 'https://example.com',
      devices: ['desktop'],
    },
  });

  assert.equal(result.isError, undefined);
  const structured = result.structuredContent as {
    url: string;
    clientUrl: string;
    devices: string[];
    services: {
      client: { running: boolean; port: number | null; url: string | null };
      server: { running: boolean; port: number | null; url: string | null };
    };
    warnings: string[];
    instructions: string[];
  };

  assert.equal(structured.url, 'https://example.com');
  assert.deepEqual(structured.devices, ['desktop']);
  assert.equal(structured.services.client.running, true);
  assert.equal(structured.services.client.port, Number(new URL(clientBaseUrl).port));
  assert.match(structured.clientUrl, new RegExp(`:${new URL(clientBaseUrl).port}$`));
  assert.match(structured.services.client.url ?? '', new RegExp(`:${new URL(clientBaseUrl).port}$`));
  assert.equal(structured.services.server.running, true);
  assert.equal(structured.services.server.port, Number(new URL(apiBaseUrl).port));
  assert.equal(structured.services.server.url, apiBaseUrl);
  assert.deepEqual(structured.warnings, []);
  assert.equal(structured.instructions.length, 1);
  assert.match(structured.instructions[0] ?? '', /Open Kaleidoscope at http:\/\/(localhost|127\.0\.0\.1):\d+/);
});

test('capture_screenshots returns structured metadata and rich content', async () => {
  assert.ok(client, 'client should be connected');

  const result = await client.callTool({
    name: 'capture_screenshots',
    arguments: {
      url: 'https://example.com',
      devices: ['desktop'],
      output_dir: 'mcp-test',
    },
  });

  assert.equal(result.isError, undefined);
  assert.equal((result.structuredContent as { count: number }).count, 1);

  const contentTypes = ((result.content ?? []) as Array<{ type: string }>).map((item) => item.type);
  assert.ok(contentTypes.includes('resource_link'));
  assert.ok(contentTypes.includes('image'));

  const structured = result.structuredContent as {
    screenshots: Array<{
      path: string;
      fileUri: string | null;
      preferredDisplayPath: string | null;
      preferredDisplayUri: string | null;
      chatDisplayPath: string | null;
      markdownImageTag: string | null;
      markdownImageTagFallbacks: string[];
      chatSafePath: string | null;
      chatSafeMarkdownImageTag: string | null;
      downloadUrl: string | null;
    }>;
    inlineImageCount: number;
    displayAdvice: string;
    primaryMarkdownImageTag: string | null;
    finalResponseInstruction: string;
    readyToPasteMarkdown: string[];
    fallbackMarkdownImageTags: string[];
  };
  assert.equal(structured.inlineImageCount, 1);
  assert.match(structured.displayAdvice, /primaryMarkdownImageTag/i);
  assert.equal(structured.screenshots[0]?.path, screenshotPath);
  assert.match(structured.screenshots[0]?.fileUri ?? '', /^file:/);
  assert.equal(structured.screenshots[0]?.preferredDisplayPath, screenshotPath);
  assert.match(structured.screenshots[0]?.preferredDisplayUri ?? '', /^file:/);
  const entry = structured.screenshots[0] as {
    chatDisplayPath: string | null;
    markdownImageTag: string | null;
    markdownImageTagFallbacks: string[];
    chatSafePath: string | null;
    chatSafeMarkdownImageTag: string | null;
  };
  const chatSafePath = entry.chatSafePath;
  assert.ok(chatSafePath, 'screenshots should include a chat-safe copy path');
  assert.equal(existsSync(chatSafePath), true);
  assert.doesNotMatch(basename(chatSafePath), /\s/);
  assert.equal(entry.chatDisplayPath, chatSafePath.replace(/\\/g, '/'));
  assert.equal(entry.markdownImageTag, entry.chatSafeMarkdownImageTag);
  assert.equal(structured.primaryMarkdownImageTag, entry.chatSafeMarkdownImageTag);
  assert.deepEqual(structured.readyToPasteMarkdown, [entry.chatSafeMarkdownImageTag]);
  assert.ok(
    entry.markdownImageTagFallbacks.some((tag) => tag.includes(screenshotPath.replace(/\\/g, '/'))),
    'fallbacks should keep an original-path Markdown form',
  );
  assert.ok(
    structured.fallbackMarkdownImageTags.some((tag) => tag.includes('desktop%20test.png')),
    'fallbacks should include an encoded original-path Markdown form',
  );
  assert.match(structured.finalResponseInstruction, /include this exact Markdown image tag/i);
  assert.equal(
    structured.screenshots[0]?.downloadUrl,
    `${apiBaseUrl}/api/screenshots-files/folder%20with%20spaces/desktop%20test.png`,
  );

  const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
  const primaryTextBlock = content.find((item) => item.type === 'text');
  assert.match(primaryTextBlock?.text ?? '', /Show this image in your final response:/);
  assert.match(primaryTextBlock?.text ?? '', /Ready-to-paste Markdown image tags:/);
  assert.match(
    primaryTextBlock?.text ?? '',
    new RegExp((entry.chatSafeMarkdownImageTag ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
});

test('compare_screenshots returns metrics and a diff artifact', async () => {
  assert.ok(client, 'client should be connected');

  const result = await client.callTool({
    name: 'compare_screenshots',
    arguments: {
      baseline_path: screenshotPath,
      current_path: screenshotPath,
    },
  });

  assert.equal(result.isError, undefined);
  const structured = result.structuredContent as {
    verdict: string;
    mismatchedPixels: number;
    mismatchPercentage: number;
    diff: { path: string; markdownImageTag: string | null };
  };
  assert.equal(structured.verdict, 'changed');
  assert.equal(structured.mismatchedPixels, 1);
  assert.equal(structured.mismatchPercentage, 100);
  assert.equal(structured.diff.path, screenshotPath);
  assert.ok(structured.diff.markdownImageTag);
});

test('inspect tool returns structured results', async () => {
  assert.ok(client, 'client should be connected');

  const inspectResult = await client.callTool({
    name: 'inspect_element_source',
    arguments: {
      url: 'http://127.0.0.1:3100/checkout',
      selector: '#save',
      device: 'desktop',
    },
  });

  const inspectStructured = inspectResult.structuredContent as {
    selector: string | null;
    componentName: string | null;
  };
  assert.equal(inspectStructured.selector, '#save');
  assert.equal(inspectStructured.componentName, 'SaveButton');
});

test('layout tools return structured results', async () => {
  assert.ok(client, 'client should be connected');

  const captureResult = await client.callTool({
    name: 'kaleidoscope_read_layout',
    arguments: {
      url: 'http://127.0.0.1:3100/checkout',
      devices: ['desktop'],
      include_source: true,
    },
  });
  const afterEditResult = await client.callTool({
    name: 'kaleidoscope_after_edit',
    arguments: {
      baseline_capture_id: 'layout_00000000-0000-0000-0000-000000000001',
    },
  });
  assert.equal(captureResult.isError, undefined);
  assert.equal(afterEditResult.isError, undefined);
  assert.equal(
    (captureResult.structuredContent as { id: string }).id,
    'layout_00000000-0000-0000-0000-000000000001',
  );
  assert.equal(
    (afterEditResult.structuredContent as { verdict: string }).verdict,
    'noChange',
  );
});

test('kaleidoscope_scan_breakpoints returns compact structured findings', async () => {
  assert.ok(client, 'client should be connected');

  const result = await client.callTool({
    name: 'kaleidoscope_scan_breakpoints',
    arguments: {
      url: 'http://127.0.0.1:3100/checkout',
      min_width: 320,
      max_width: 400,
      step: 16,
    },
  });

  assert.equal(result.isError, undefined);
  const structured = result.structuredContent as {
    verdict: string;
    scannedWidthCount: number;
    issueRanges: Array<{ type: string; startWidth: number; endWidth: number }>;
  };
  assert.equal(structured.verdict, 'issues-found');
  assert.equal(structured.scannedWidthCount, 6);
  assert.deepEqual(structured.issueRanges, [
    {
      type: 'horizontal-overflow',
      key: 'document',
      message: 'document is 24px wider than the viewport',
      selector: null,
      startWidth: 320,
      endWidth: 336,
      sampledWidths: [320, 336],
      maxOverflowPx: 24,
    },
  ]);
});
