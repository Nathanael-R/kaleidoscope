import { homedir, tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import type { CallToolResult, ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { processManager } from './process-manager.js';

function textContent(text: string): ContentBlock {
  return {
    type: 'text',
    text,
  };
}

export function createTextResult(text: string): CallToolResult {
  return {
    content: [textContent(text)],
  };
}

export function createStructuredResult<T extends object>(
  structuredContent: T,
  text: string,
  additionalContent: ContentBlock[] = [],
): CallToolResult {
  return {
    content: [textContent(text), ...additionalContent],
    structuredContent: structuredContent as { [key: string]: unknown },
  };
}

export function createErrorResult(text: string): CallToolResult {
  return {
    content: [textContent(text)],
    isError: true,
  };
}

export async function formatToolError(action: string, error: unknown): Promise<string> {
  const reason = sanitizeToolMessage(error instanceof Error ? error.message : String(error));
  try {
    const status = await processManager.getStatus();
    return [
      `Error ${action}: ${reason}`,
      '',
      'Current service status:',
      `  Client: ${status.client.running ? 'running' : 'stopped'} (${status.client.url})`,
      `  Server: ${status.server.running ? 'running' : 'stopped'} (${status.server.url})`,
    ].join('\n');
  } catch {
    return `Error ${action}: ${reason}`;
  }
}

function sanitizeToolMessage(message: string): string {
  const replacements = [
    [process.cwd(), '<cwd>'],
    [homedir(), '<home>'],
    [tmpdir(), '<temp>'],
  ] as const;

  let sanitized = message.replace(/\r?\n/g, ' ');
  for (const [needle, replacement] of replacements) {
    if (needle) {
      sanitized = sanitized.split(needle).join(replacement);
    }
  }

  return sanitized.slice(0, 1000);
}

export function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function toFileUri(filePath: string): string | null {
  try {
    return pathToFileURL(filePath).toString();
  } catch {
    return null;
  }
}
