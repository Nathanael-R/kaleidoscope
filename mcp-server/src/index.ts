#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerPreviewTools } from './tools/preview.js';
import { registerScreenshotTools } from './tools/screenshot.js';
import { registerInspectTools } from './tools/inspect.js';
import { registerLayoutTools } from './tools/layout.js';
import { registerBreakpointTools } from './tools/breakpoint.js';
import { processManager } from './process-manager.js';

const server = new McpServer({
  name: 'kaleidoscope',
  version: '1.2.3',
});

// Register all tools
registerPreviewTools(server);
registerScreenshotTools(server);
registerInspectTools(server);
registerLayoutTools(server);
registerBreakpointTools(server);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('Kaleidoscope MCP server running on stdio\n');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message.replace(/\r?\n/g, ' ').slice(0, 500)}\n`);
  process.exit(1);
});

let shuttingDown = false;
async function shutdownAfterTransportClose() {
  if (shuttingDown) return;
  shuttingDown = true;
  await processManager.stopAll();
}

process.stdin.once('end', shutdownAfterTransportClose);
process.stdin.once('close', shutdownAfterTransportClose);
