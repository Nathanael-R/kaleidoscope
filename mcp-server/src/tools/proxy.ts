import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { processManager } from '../process-manager.js';

const KALEIDOSCOPE_SERVER = 'http://localhost:5000';

export function registerProxyTools(server: McpServer) {
  /**
   * preview_with_auth
   * Creates a proxy session so the target site can be previewed in an iframe
   * even if it blocks framing. Injects auth cookies server-side.
   */
  server.tool(
    'preview_with_auth',
    'Preview an authenticated page through a server-side proxy. ' +
    'This strips X-Frame-Options and CSP headers so the page can be embedded, ' +
    'and injects auth cookies server-side (bypassing browser cross-origin restrictions). ' +
    'Returns a proxy URL that can be used in the Kaleidoscope preview. ' +
    'If auth fails (401/403 or login redirect), the response will indicate this, ' +
    'and you should use inject_mock_data to provide dummy data instead.',
    {
      url: z.string().url().describe(
        'The target URL to proxy (e.g., http://localhost:3000/dashboard)'
      ),
      cookies: z.array(z.object({
        name: z.string().describe('Cookie name (e.g., session_token)'),
        value: z.string().describe('Cookie value'),
      })).optional().describe(
        'Auth cookies to inject. Get these from the browser DevTools → Application → Cookies.'
      ),
    },
    // @ts-expect-error TS2589: MCP SDK deep type inference with complex Zod schemas
    async ({ url, cookies }: { url: string; cookies?: Array<{ name: string; value: string }> }) => {
      try {
        // Ensure server is running
        const serverReachable = await processManager.isServerReachable();
        if (!serverReachable) {
          await processManager.startServer();
        }

        // Create proxy session
        const createRes = await fetch(`${KALEIDOSCOPE_SERVER}/api/proxy/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, cookies: cookies || [] }),
        });

        if (!createRes.ok) {
          const err = await createRes.json() as { error: string };
          return {
            content: [{ type: 'text' as const, text: `Failed to create proxy session: ${err.error}` }],
            isError: true,
          };
        }

        const data = await createRes.json() as {
          session: { id: string; proxyUrl: string; targetUrl: string };
        };

        // Test the proxy by fetching the root page to detect auth issues
        const testRes = await fetch(`${KALEIDOSCOPE_SERVER}/api/proxy/session/${data.session.id}/status`);
        const status = testRes.ok ? await testRes.json() as { authFailed: boolean } : { authFailed: false };

        // Also do a quick probe of the target through the proxy
        const probeRes = await fetch(`${KALEIDOSCOPE_SERVER}${data.session.proxyUrl}/`, {
          redirect: 'manual',
        });

        // Check auth status after probe
        const statusAfterProbe = await fetch(`${KALEIDOSCOPE_SERVER}/api/proxy/session/${data.session.id}/status`);
        const probeStatus = statusAfterProbe.ok
          ? await statusAfterProbe.json() as { authFailed: boolean }
          : { authFailed: false };

        const lines = [
          `Proxy session created: ${data.session.id}`,
          `Target: ${data.session.targetUrl}`,
          `Proxy URL: ${KALEIDOSCOPE_SERVER}${data.session.proxyUrl}/`,
          '',
          `Use this proxy URL in the Kaleidoscope preview instead of the original URL.`,
          `The proxy strips X-Frame-Options headers and injects cookies server-side.`,
        ];

        if (probeStatus.authFailed) {
          lines.push('');
          lines.push('WARNING: Authentication appears to have FAILED.');
          lines.push('The target returned a 401/403 or redirected to a login page.');
          lines.push('');
          lines.push('Options:');
          lines.push('1. Provide correct auth cookies and try again');
          lines.push('2. Use the inject_mock_data tool to provide dummy API data');
          lines.push('   so the page renders with mock content instead.');
          lines.push('   To do this:');
          lines.push('   a. Read the target app\'s codebase to understand its API endpoints and data shapes');
          lines.push('   b. Generate realistic mock responses matching those shapes');
          lines.push('   c. Call inject_mock_data with the session ID and mock data');
        }

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error creating proxy session: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  /**
   * inject_mock_data
   * The key tool for the fallback flow: Claude reads the codebase, generates mock data
   * matching the app's API shapes, and injects it so pages render without real auth.
   */
  server.tool(
    'inject_mock_data',
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
    {
      session_id: z.string().describe(
        'The proxy session ID from preview_with_auth'
      ),
      mocks: z.array(z.object({
        pattern: z.string().describe(
          'URL path pattern to match. Supports * wildcards and :param placeholders. ' +
          'Examples: "/api/users", "/api/users/*", "/api/posts/:id"'
        ),
        response: z.unknown().describe(
          'The mock response data. Can be any JSON value (object, array, string, etc). ' +
          'Should match the shape the frontend expects from this endpoint.'
        ),
      })).describe(
        'Array of mock routes. Each has a URL pattern and a response to return.'
      ),
    },
    // @ts-expect-error TS2589: MCP SDK deep type inference with complex Zod schemas
    async ({ session_id, mocks }: {
      session_id: string;
      mocks: Array<{ pattern: string; response: unknown }>;
    }) => {
      try {
        const serverReachable = await processManager.isServerReachable();
        if (!serverReachable) {
          return {
            content: [{
              type: 'text' as const,
              text: 'Kaleidoscope server is not running. Start it first with kaleidoscope_start.',
            }],
            isError: true,
          };
        }

        // Inject mock data
        const mockRes = await fetch(`${KALEIDOSCOPE_SERVER}/api/proxy/session/${session_id}/mock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mocks }),
        });

        if (!mockRes.ok) {
          const err = await mockRes.json() as { error: string };
          return {
            content: [{
              type: 'text' as const,
              text: `Failed to inject mock data: ${err.error}`,
            }],
            isError: true,
          };
        }

        const data = await mockRes.json() as { mockCount: number; message: string };

        const lines = [
          `Mock data injected successfully!`,
          `Session: ${session_id}`,
          `Routes mocked: ${data.mockCount}`,
          '',
          'Mocked patterns:',
        ];

        for (const mock of mocks) {
          const responsePreview = JSON.stringify(mock.response);
          const preview = responsePreview.length > 80
            ? responsePreview.slice(0, 80) + '...'
            : responsePreview;
          lines.push(`  ${mock.pattern} → ${preview}`);
        }

        lines.push('');
        lines.push('The proxy will now return this mock data for matching API requests.');
        lines.push('The preview iframe will render with this data - no codebase changes needed.');
        lines.push(`Proxy URL: ${KALEIDOSCOPE_SERVER}/api/proxy/${session_id}/`);

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error injecting mock data: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
