import { readFile } from 'node:fs/promises';
import type { McpServer } from '@modelcontextprotocol/server';

export const MCP_APPS_EXTENSION_ID = 'io.modelcontextprotocol/ui';
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';
export const RESULTS_APP_URI = 'ui://kaleidoscope/results.html';

export const RESULTS_APP_TOOL_META = {
  ui: {
    resourceUri: RESULTS_APP_URI,
    visibility: ['model', 'app'],
  },
} as const;

const resultsAppPath = new URL('../dist/apps/results.html', import.meta.url);

export function registerResultsAppResource(server: McpServer): void {
  server.registerResource(
    'kaleidoscope-results',
    RESULTS_APP_URI,
    {
      title: 'Kaleidoscope responsive capture results',
      description: 'Interactive device-by-device screenshot results.',
      mimeType: MCP_APP_MIME_TYPE,
      _meta: {
        ui: {
          csp: {
            connectDomains: [],
            resourceDomains: [],
            frameDomains: [],
          },
        },
      },
    },
    async () => ({
      contents: [{
        uri: RESULTS_APP_URI,
        mimeType: MCP_APP_MIME_TYPE,
        text: await readFile(resultsAppPath, 'utf8'),
      }],
    }),
  );
}
