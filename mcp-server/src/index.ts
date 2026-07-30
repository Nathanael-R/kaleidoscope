#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { registerPreviewTools } from './tools/preview.js';
import { registerScreenshotTools } from './tools/screenshot.js';
import { registerInspectTools } from './tools/inspect.js';
import { registerLayoutTools } from './tools/layout.js';
import { registerBreakpointTools } from './tools/breakpoint.js';
import { processManager } from './process-manager.js';

function buildServer(): McpServer {
  const server = new McpServer({
    name: 'kaleidoscope',
    version: '1.2.3',
  });

  registerPreviewTools(server);
  registerScreenshotTools(server);
  registerInspectTools(server);
  registerLayoutTools(server);
  registerBreakpointTools(server);

  return server;
}

// Start the server
async function main() {
  process.stderr.write('Kaleidoscope MCP server running on stdio\n');
  await serveStdio(buildServer);
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
