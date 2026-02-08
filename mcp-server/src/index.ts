#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerPreviewTools } from './tools/preview.js';
import { registerScreenshotTools } from './tools/screenshot.js';

const server = new McpServer({
  name: 'kaleidoscope',
  version: '1.0.0',
});

// Register all tools
registerPreviewTools(server);
registerScreenshotTools(server);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('Kaleidoscope MCP server running on stdio\n');
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error}\n`);
  process.exit(1);
});
