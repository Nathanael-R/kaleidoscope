import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { ContentBlock } from '@modelcontextprotocol/server';
import { toFileUri } from './tool-utils.js';
import {
  chatImageExpiresAt,
  chatSafeImageDirs,
  imageExpiresAt,
  registerImageExpiry,
  startImageExpiryCleanup,
} from '../../shared/artifact-retention.js';
import { createInlinePreview } from './image-preview.js';

const MAX_INLINE_IMAGE_BYTES = 1_500_000;
const MAX_TOTAL_INLINE_BYTES = 4_500_000;
const MAX_SOURCE_IMAGE_BYTES = 50 * 1024 * 1024;

export interface ScreenshotArtifact {
  deviceId: string;
  device: string;
  path: string;
  fileUri: string | null;
  downloadUrl: string | null;
  width: number;
  height: number;
  error: string | null;
}

export interface ScreenshotCaptureResult {
  deviceId: string;
  device: string;
  path: string;
  width: number;
  height: number;
  url?: string;
  expiresAt?: string | null;
}

export interface ScreenshotEntryResult extends ScreenshotArtifact {
  expiresAt: string | null;
  preferredDisplayPath: string | null;
  preferredDisplayUri: string | null;
  chatDisplayPath: string | null;
  markdownImageTag: string | null;
  markdownImageTagFallbacks: string[];
  chatSafePath: string | null;
  chatSafeMarkdownImageTag: string | null;
  chatSafeHttpImageTag: string | null;
}

export interface InlinePreviewMapping {
  deviceId: string;
  contentIndex: number;
  resourceUri: string | null;
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

function escapeMarkdownAltText(altText: string): string {
  return altText.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

function encodeMarkdownPathSegment(segment: string): string {
  if (/^[A-Za-z]:$/.test(segment)) {
    return segment;
  }

  return encodeURIComponent(segment);
}

export function toEncodedMarkdownImagePath(filePath: string): string | null {
  const markdownPath = toMarkdownImagePath(filePath);
  if (!markdownPath) {
    return null;
  }

  return markdownPath.split('/').map(encodeMarkdownPathSegment).join('/');
}

export function toMarkdownImageTag(filePath: string, altText: string): string | null {
  const markdownPath = toMarkdownImagePath(filePath);
  if (!markdownPath) {
    return null;
  }

  return `![${escapeMarkdownAltText(altText)}](<${markdownPath}>)`;
}

export function toMarkdownImageTagVariants(filePath: string, altText: string): string[] {
  const markdownPath = toMarkdownImagePath(filePath);
  if (!markdownPath) {
    return [];
  }

  const escapedAltText = escapeMarkdownAltText(altText);
  const encodedPath = toEncodedMarkdownImagePath(filePath);
  const fileUri = toFileUri(filePath);
  const candidates = [
    `![${escapedAltText}](<${markdownPath}>)`,
    encodedPath ? `![${escapedAltText}](${encodedPath})` : null,
    fileUri ? `![${escapedAltText}](<${fileUri}>)` : null,
    fileUri ? `![${escapedAltText}](${fileUri})` : null,
  ].filter((candidate): candidate is string => Boolean(candidate));

  return Array.from(new Set(candidates));
}

function sanitizeChatSafeFileStem(input: string): string {
  const stem = input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return stem || 'screenshot';
}

export function startChatImageCleanup(): () => void {
  return startImageExpiryCleanup(chatSafeImageDirs());
}

export async function createChatSafeImageCopy(filePath: string, expiresAt: string | null = chatImageExpiresAt()): Promise<string | null> {
  if (!path.isAbsolute(filePath)) {
    return null;
  }

  const ext = path.extname(filePath) || '.png';
  const stem = sanitizeChatSafeFileStem(path.basename(filePath, ext));
  const targetFileName = `${stem}-${randomUUID()}${ext.toLowerCase()}`;

  for (const candidateDir of chatSafeImageDirs()) {
    const targetPath = path.join(candidateDir, targetFileName);
    try {
      await mkdir(candidateDir, { recursive: true });
      await copyFile(filePath, targetPath);
      await registerImageExpiry(targetPath, expiresAt);

      return targetPath;
    } catch {
      await unlink(targetPath).catch(() => {});
      // Try the next writable location.
    }
  }

  return null;
}

export function toChatSafeHttpImageTag(
  chatSafePath: string | null,
  serverBaseUrl: string,
  altText: string,
): string | null {
  if (!chatSafePath) return null;
  const fileName = path.basename(chatSafePath);
  if (!/^[a-z0-9._-]+\.png$/i.test(fileName)) return null;
  try {
    const url = new URL(`/api/chat-images/${encodeURIComponent(fileName)}`, serverBaseUrl);
    return `![${escapeMarkdownAltText(altText)}](<${url.toString()}>)`;
  } catch {
    return null;
  }
}

export async function createScreenshotEntry(
  screenshot: ScreenshotCaptureResult,
  serverBaseUrl: string,
): Promise<ScreenshotEntryResult> {
  const error = screenshot.path.startsWith('ERROR:') ? screenshot.path : null;
  const expiresAt = error ? null : screenshot.expiresAt === undefined ? imageExpiresAt() : screenshot.expiresAt;
  const altText = `${screenshot.device} preview`;
  // Chat copies outlive the capture expiry so chat-clients can still render them later.
  const chatSafePath = error ? null : await createChatSafeImageCopy(screenshot.path);
  const chatSafeMarkdownImageTag = chatSafePath ? toMarkdownImageTag(chatSafePath, altText) : null;
  const chatSafeHttpImageTag = toChatSafeHttpImageTag(chatSafePath, serverBaseUrl, altText);
  const originalMarkdownImageTag = error ? null : toMarkdownImageTag(screenshot.path, altText);
  const markdownImageTagVariants = [
    ...(chatSafeHttpImageTag ? [chatSafeHttpImageTag] : []),
    ...(chatSafePath ? toMarkdownImageTagVariants(chatSafePath, altText) : []),
    ...(error ? [] : toMarkdownImageTagVariants(screenshot.path, altText)),
  ];
  const markdownImageTags = Array.from(new Set(markdownImageTagVariants));
  const markdownImageTag = chatSafeHttpImageTag
    ?? chatSafeMarkdownImageTag
    ?? originalMarkdownImageTag
    ?? markdownImageTags[0]
    ?? null;
  const chatDisplayPath = chatSafePath
    ? toMarkdownImagePath(chatSafePath)
    : error ? null : toMarkdownImagePath(screenshot.path);

  return {
    deviceId: screenshot.deviceId,
    expiresAt,
    device: screenshot.device,
    path: screenshot.path,
    fileUri: error ? null : toFileUri(screenshot.path),
    preferredDisplayPath: error ? null : screenshot.path,
    preferredDisplayUri: error ? null : toFileUri(screenshot.path),
    chatDisplayPath,
    markdownImageTag,
    markdownImageTagFallbacks: markdownImageTags.filter((tag) => tag !== markdownImageTag),
    chatSafePath,
    chatSafeMarkdownImageTag,
    chatSafeHttpImageTag,
    downloadUrl: screenshot.url ? new URL(screenshot.url, serverBaseUrl).toString() : null,
    width: screenshot.width,
    height: screenshot.height,
    error,
  };
}

export async function buildScreenshotContent(
  screenshots: ScreenshotArtifact[],
  contentIndexOffset = 0,
): Promise<{ content: ContentBlock[]; inlineImageCount: number; inlinePreviews: InlinePreviewMapping[]; previewWarnings: string[] }> {
  const content: ContentBlock[] = [];
  let inlineImageCount = 0;
  const inlinePreviews: InlinePreviewMapping[] = [];
  const previewWarnings: string[] = [];
  const successfulCount = Math.max(1, screenshots.filter((screenshot) => !screenshot.error).length);
  const maxPreviewBytes = Math.min(MAX_INLINE_IMAGE_BYTES, Math.floor(MAX_TOTAL_INLINE_BYTES / successfulCount));

  for (const screenshot of screenshots) {
    if (screenshot.fileUri && path.isAbsolute(screenshot.path)) {
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

    if (screenshot.error) {
      continue;
    }

    try {
      if (!path.isAbsolute(screenshot.path)) {
        throw new Error('The screenshot path is not local to the MCP server.');
      }
      if ((await stat(screenshot.path)).size > MAX_SOURCE_IMAGE_BYTES) {
        throw new Error('Image exceeds the preview file-size limit; use the original file.');
      }
      const file = await readFile(screenshot.path);
      const preview = createInlinePreview(file, maxPreviewBytes);

      const contentIndex = contentIndexOffset + content.length;
      content.push({
        type: 'image',
        mimeType: 'image/png',
        data: preview.toString('base64'),
      });
      inlinePreviews.push({
        deviceId: screenshot.deviceId,
        contentIndex,
        resourceUri: screenshot.fileUri,
      });
      inlineImageCount += 1;
    } catch (error) {
      const reason = error instanceof Error && !('code' in error) ? error.message : 'The local image could not be read.';
      previewWarnings.push(`${screenshot.device}: ${reason}`);
    }
  }

  return { content, inlineImageCount, inlinePreviews, previewWarnings };
}
