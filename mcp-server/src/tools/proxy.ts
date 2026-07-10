import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { processManager } from '../process-manager.js';
import { KALEIDOSCOPE_SERVER, kaleidoscopeFetch } from '../kaleidoscope-api.js';
import {
  createErrorResult,
  createStructuredResult,
  formatToolError,
} from '../tool-utils.js';

const mockPatternSchema = z.object({
  pattern: z.string(),
  method: z.string().optional(),
  status: z.number().optional(),
  responsePreview: z.string(),
});

const MAX_MOCK_ROUTES = 50;
const MAX_MOCK_PATTERN_LENGTH = 200;
const MAX_COOKIE_COUNT = 50;
const MAX_COOKIE_VALUE_LENGTH = 4096;

const previewWithAuthOutputSchema = {
  sessionId: z.string(),
  targetUrl: z.string().url(),
  proxyUrl: z.string().url(),
  authFailed: z.boolean(),
  guidance: z.array(z.string()),
};

const injectMockDataOutputSchema = {
  sessionId: z.string(),
  mockCount: z.number(),
  proxyUrl: z.string().url(),
  message: z.string(),
  mocks: z.array(mockPatternSchema),
};

const previewWithAuthInputSchema = {
  url: z.string().url().max(2048).describe(
    'The target URL to proxy (e.g., http://localhost:3000/dashboard)',
  ),
  cookies: z.array(z.object({
    name: z.string().min(1).max(128).describe('Cookie name (e.g., session_token)'),
    value: z.string().max(MAX_COOKIE_VALUE_LENGTH).describe('Cookie value'),
  })).max(MAX_COOKIE_COUNT).optional().describe(
    'Auth cookies to inject. Get these from the browser DevTools -> Application -> Cookies.',
  ),
} satisfies z.ZodRawShape;

const injectMockDataInputSchema = {
  session_id: z.string().regex(/^proxy_[0-9a-f-]{36}$/i).describe(
    'The proxy session ID from preview_with_auth',
  ),
  mocks: z.array(z.object({
    pattern: z.string().min(1).max(MAX_MOCK_PATTERN_LENGTH).describe(
      'URL path pattern to match. Supports * wildcards and :param placeholders. ' +
      'Examples: "/api/users", "/api/users/*", "/api/posts/:id"',
    ),
    method: z.string().optional().describe(
      'Optional HTTP method to match (e.g. "GET", "POST"). When omitted, this mock matches any method. ' +
      'Use method-specific mocks when the same endpoint returns different data depending on the verb, ' +
      'or when you want to mock a 409 on POST without affecting GET.',
    ),
    status: z.number().int().min(100).max(599).optional().describe(
      'Optional HTTP status code to return for this mock. Defaults to 200. ' +
      'Use non-200 statuses to simulate error states: 401 for unauthorized, 404 for missing resource, ' +
      '409 for conflict, 500 for server failure, 503 for service unavailable.',
    ),
    response: z.unknown().describe(
      'The mock response data. Can be any JSON value (object, array, string, etc). ' +
      'Should match the shape the frontend expects from this endpoint. ' +
      'When status is non-2xx, the response still ships as the body; some apps expect an error payload.',
    ),
  })).max(MAX_MOCK_ROUTES).describe(
    'Array of mock routes. Each has a URL pattern and a response to return. ' +
    'Method and status are optional and apply per pattern, so GET and POST can share a pattern with different outcomes.',
  ),
} satisfies z.ZodRawShape;

interface PreviewWithAuthResult {
  sessionId: string;
  targetUrl: string;
  proxyUrl: string;
  authFailed: boolean;
  guidance: string[];
}

interface MockPatternResult {
  pattern: string;
  method?: string;
  status?: number;
  responsePreview: string;
}

interface MockPatternInput {
  pattern: string;
  method?: string;
  status?: number;
  response: unknown;
}

interface InjectMockDataResult {
  sessionId: string;
  mockCount: number;
  proxyUrl: string;
  message: string;
  mocks: MockPatternResult[];
}

export function registerProxyTools(server: McpServer) {
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
    'preview_with_auth',
    {
      description:
        'Preview an authenticated page through a server-side proxy. ' +
        'This strips X-Frame-Options and CSP headers so the page can be embedded, ' +
        'and injects auth cookies server-side (bypassing browser cross-origin restrictions). ' +
        'Returns a proxy URL that can be used in the Kaleidoscope preview. ' +
        'If auth fails (401/403 or login redirect), the response will indicate this, ' +
        'and you should use inject_mock_data to provide dummy data instead.',
      inputSchema: previewWithAuthInputSchema as z.ZodRawShape,
      outputSchema: previewWithAuthOutputSchema as z.ZodRawShape,
    },
    async ({ url, cookies }) => {
      try {
        const serverReachable = await processManager.isServerReachable();
        if (!serverReachable) {
          await processManager.startServer();
        }

        const createRes = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/proxy/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, cookies: cookies || [] }),
        });

        if (!createRes.ok) {
          const err = await createRes.json() as { error: string };
          return createErrorResult(`Failed to create proxy session: ${err.error}`);
        }

        const data = await createRes.json() as {
          session: { id: string; proxyUrl: string; targetUrl: string };
        };

        await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/proxy/session/${data.session.id}/status`);

        await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}${data.session.proxyUrl}/`, {
          redirect: 'manual',
        });

        const statusAfterProbe = await kaleidoscopeFetch(
          `${KALEIDOSCOPE_SERVER}/api/proxy/session/${data.session.id}/status`,
        );
        const probeStatus = statusAfterProbe.ok
          ? await statusAfterProbe.json() as { authFailed: boolean }
          : { authFailed: false };

        const result: PreviewWithAuthResult = {
          sessionId: data.session.id,
          targetUrl: data.session.targetUrl,
          proxyUrl: `${KALEIDOSCOPE_SERVER}${data.session.proxyUrl}/`,
          authFailed: probeStatus.authFailed,
          guidance: probeStatus.authFailed
            ? [
                'Authentication appears to have failed.',
                'Provide correct auth cookies and try again.',
                'Or call inject_mock_data to return realistic mock API responses through the proxy.',
              ]
            : [
                'Use this proxy URL in the Kaleidoscope preview instead of the original URL.',
                'The proxy strips X-Frame-Options headers and injects cookies server-side.',
              ],
        };

        const lines = [
          `Proxy session created: ${result.sessionId}`,
          `Target: ${result.targetUrl}`,
          `Proxy URL: ${result.proxyUrl}`,
          '',
          ...result.guidance,
        ];

        return createStructuredResult(result, lines.join('\n'));
      } catch (error) {
        return createErrorResult(await formatToolError('creating proxy session', error));
      }
    },
  );

  registerTool(
    'inject_mock_data',
    {
      description:
        'Inject mock API data into a proxy session so pages render with dummy content ' +
        'when authentication fails. This is the fallback when auth cookies do not work. ' +
        'The mock data is served at runtime by the proxy - NOTHING is changed in the user\'s codebase. ' +
        '\n\n' +
        'How to use:\n' +
        '1. First call preview_with_auth - if it reports auth failure, use this tool\n' +
        '2. Read the target app\'s codebase to understand its API endpoints and response shapes\n' +
        '3. Generate realistic mock responses that match the expected data shapes\n' +
        '4. Call this tool with the session ID and mock data\n' +
        '5. The proxy will intercept matching API requests and return the mock data instead\n' +
        '\n' +
        'Example: if the app fetches /api/users and expects [{id, name, email}], ' +
        'provide pattern="/api/users" with response=[{id:1, name:"Jane Doe", email:"jane@example.com"}]',
      inputSchema: injectMockDataInputSchema as z.ZodRawShape,
      outputSchema: injectMockDataOutputSchema as z.ZodRawShape,
    },
    async ({ session_id, mocks }) => {
      try {
        const serverReachable = await processManager.isServerReachable();
        if (!serverReachable) {
          return createErrorResult('Kaleidoscope server is not running. Start it first with kaleidoscope_start.');
        }

        const mockRes = await kaleidoscopeFetch(`${KALEIDOSCOPE_SERVER}/api/proxy/session/${session_id}/mock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mocks }),
        });

        if (!mockRes.ok) {
          const err = await mockRes.json() as { error: string };
          return createErrorResult(`Failed to inject mock data: ${err.error}`);
        }

        const data = await mockRes.json() as { mockCount: number; message: string };
        const requestedMocks = mocks as MockPatternInput[];
        const normalizedMocks: MockPatternResult[] = requestedMocks.map((mock) => {
          const responsePreview = JSON.stringify(mock.response) ?? 'undefined';
          return {
            pattern: mock.pattern,
            method: mock.method?.trim().toUpperCase(),
            status: mock.status,
            responsePreview: responsePreview.length > 80
              ? `${responsePreview.slice(0, 80)}...`
              : responsePreview,
          };
        });

        const result: InjectMockDataResult = {
          sessionId: session_id,
          mockCount: data.mockCount,
          proxyUrl: `${KALEIDOSCOPE_SERVER}/api/proxy/${session_id}/`,
          message: data.message,
          mocks: normalizedMocks,
        };

        const lines = [
          'Mock data injected successfully!',
          `Session: ${result.sessionId}`,
          `Routes mocked: ${result.mockCount}`,
          '',
          'Mocked patterns:',
          ...normalizedMocks.map((mock) => {
            const method = mock.method ? `${mock.method} ` : '';
            const status = mock.status ? ` [${mock.status}]` : '';
            return `  ${method}${mock.pattern}${status} -> ${mock.responsePreview}`;
          }),
          '',
          'The proxy will now return this mock data for matching API requests.',
          'The preview iframe will render with this data - no codebase changes needed.',
          `Proxy URL: ${result.proxyUrl}`,
        ];

        return createStructuredResult(result, lines.join('\n'));
      } catch (error) {
        return createErrorResult(await formatToolError('injecting mock data', error));
      }
    },
  );
}
