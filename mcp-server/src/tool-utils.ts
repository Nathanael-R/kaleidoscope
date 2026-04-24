import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { CallToolResult, ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { processManager } from './process-manager.js';

const MAX_INLINE_IMAGE_BYTES = 1_500_000;
const MAX_INLINE_IMAGES = 4;

export interface ScreenshotArtifact {
  device: string;
  path: string;
  fileUri: string | null;
  downloadUrl: string | null;
  width: number;
  height: number;
  error: string | null;
}

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
  const reason = error instanceof Error ? error.message : String(error);
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

export function toMarkdownImagePath(filePath: string): string | null {
  if (!filePath) {
    return null;
  }

  const normalizedPath = filePath.replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(normalizedPath)) {
    return normalizedPath;
  }

  if (normalizedPath.startsWith('//')) {
    return normalizedPath;
  }

  if (normalizedPath.startsWith('/')) {
    return normalizedPath;
  }

  return null;
}

export function toMarkdownImageTag(filePath: string, altText: string): string | null {
  const markdownPath = toMarkdownImagePath(filePath);
  if (!markdownPath) {
    return null;
  }

  return `![${altText}](<${markdownPath}>)`;
}

export async function buildScreenshotContent(
  screenshots: ScreenshotArtifact[],
): Promise<{ content: ContentBlock[]; inlineImageCount: number }> {
  const content: ContentBlock[] = [];
  let inlineImageCount = 0;

  for (const screenshot of screenshots) {
    if (screenshot.fileUri) {
      let size: number | undefined;
      try {
        size = (await stat(screenshot.path)).size;
      } catch {
        size = undefined;
      }

      content.push({
        type: 'resource_link',
        name: `${screenshot.device} screenshot`,
        uri: screenshot.fileUri,
        mimeType: 'image/png',
        size,
        description: `${screenshot.device} screenshot (${screenshot.width}x${screenshot.height})`,
      });
    }

    if (inlineImageCount >= MAX_INLINE_IMAGES || screenshot.error) {
      continue;
    }

    try {
      const file = await readFile(screenshot.path);
      if (file.byteLength > MAX_INLINE_IMAGE_BYTES) {
        continue;
      }

      content.push({
        type: 'image',
        mimeType: 'image/png',
        data: file.toString('base64'),
      });
      inlineImageCount += 1;
    } catch {
      // Skip inline image generation when the file is unavailable.
    }
  }

  return { content, inlineImageCount };
}
