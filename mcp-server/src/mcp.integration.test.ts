import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'kaleidoscope-mcp-'));
  mkdirSync(tempDir, { recursive: true });
  screenshotPath = join(tempDir, 'desktop-test.png');
  writeFileSync(screenshotPath, Buffer.from(TINY_PNG_BASE64, 'base64'));

  apiServer = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (requestUrl.pathname === '/api/health') {
      return sendJson(res, { status: 'ok' });
    }

    if (requestUrl.pathname === '/api/tunnel') {
      return sendJson(res, { tunnels: [] });
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
            url: '/api/screenshots-files/desktop-test.png',
          },
        ],
      });
    }

    if (requestUrl.pathname === '/api/proxy/session' && req.method === 'POST') {
      const body = await readJson(req) as { url?: string };
      return sendJson(res, {
        success: true,
        session: {
          id: 'proxy_test',
          proxyUrl: '/api/proxy/proxy_test',
          targetUrl: body.url ?? 'https://example.com',
        },
      });
    }

    if (requestUrl.pathname === '/api/proxy/session/proxy_test/status') {
      return sendJson(res, { authFailed: false });
    }

    if (requestUrl.pathname === '/api/proxy/session/proxy_test/mock' && req.method === 'POST') {
      const body = await readJson(req) as { mocks?: unknown[] };
      return sendJson(res, {
        mockCount: body.mocks?.length ?? 0,
        message: `${body.mocks?.length ?? 0} mock route(s) registered.`,
      });
    }

    if (requestUrl.pathname === '/api/proxy/proxy_test/') {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html');
      res.end('<!doctype html><html><body>proxied</body></html>');
      return;
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
    cwd: 'C:/Code/kaleidoscope/mcp-server',
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
  assert.ok(toolMap.get('inspect_element_source')?.outputSchema);
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
    tunnelUrl: string | null;
    services: {
      client: { running: boolean; port: number | null; url: string | null };
      server: { running: boolean; port: number | null; url: string | null };
    };
    warnings: string[];
    instructions: string[];
  };

  assert.equal(structured.url, 'https://example.com');
  assert.deepEqual(structured.devices, ['desktop']);
  assert.equal(structured.tunnelUrl, null);
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
      downloadUrl: string | null;
    }>;
    inlineImageCount: number;
    displayAdvice: string;
  };
  assert.equal(structured.inlineImageCount, 1);
  assert.match(structured.displayAdvice, /Prefer preferredDisplayPath or preferredDisplayUri/i);
  assert.equal(structured.screenshots[0]?.path, screenshotPath);
  assert.match(structured.screenshots[0]?.fileUri ?? '', /^file:/);
  assert.equal(structured.screenshots[0]?.preferredDisplayPath, screenshotPath);
  assert.match(structured.screenshots[0]?.preferredDisplayUri ?? '', /^file:/);
  assert.equal(
    structured.screenshots[0]?.downloadUrl,
    `${apiBaseUrl}/api/screenshots-files/desktop-test.png`,
  );
});

test('proxy and inspect tools return structured results', async () => {
  assert.ok(client, 'client should be connected');

  const proxyResult = await client.callTool({
    name: 'preview_with_auth',
    arguments: {
      url: 'https://example.com/private',
    },
  });
  const inspectResult = await client.callTool({
    name: 'inspect_element_source',
    arguments: {
      url: 'http://127.0.0.1:3100/checkout',
      selector: '#save',
      device: 'desktop',
    },
  });

  assert.equal((proxyResult.structuredContent as { sessionId: string }).sessionId, 'proxy_test');
  assert.equal((proxyResult.structuredContent as { authFailed: boolean }).authFailed, false);

  const inspectStructured = inspectResult.structuredContent as {
    selector: string | null;
    componentName: string | null;
  };
  assert.equal(inspectStructured.selector, '#save');
  assert.equal(inspectStructured.componentName, 'SaveButton');
});
