import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { toFileUri } from './tool-utils.js';

const MAX_INLINE_IMAGE_BYTES = 1_500_000;
const MAX_INLINE_IMAGES = 4;
const CHAT_SAFE_IMAGE_DIR_NAME = 'kaleidoscope-chat-images';

export interface ScreenshotArtifact {
  device: string;
  path: string;
  fileUri: string | null;
  downloadUrl: string | null;
  width: number;
  height: number;
  error: string | null;
}

export interface ScreenshotCaptureResult {
  device: string;
  path: string;
  width: number;
  height: number;
  url?: string;
}

export interface ScreenshotEntryResult extends ScreenshotArtifact {
  preferredDisplayPath: string | null;
  preferredDisplayUri: string | null;
  chatDisplayPath: string | null;
  markdownImageTag: string | null;
  markdownImageTagFallbacks: string[];
  chatSafePath: string | null;
  chatSafeMarkdownImageTag: string | null;
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

function chatSafeImageDirs(): string[] {
  const candidateDirs = process.platform === 'win32'
    ? [
      process.env.PUBLIC ? path.join(process.env.PUBLIC, CHAT_SAFE_IMAGE_DIR_NAME) : null,
      process.env.SystemDrive ? path.join(`${process.env.SystemDrive}\\`, CHAT_SAFE_IMAGE_DIR_NAME) : null,
      path.join(tmpdir(), CHAT_SAFE_IMAGE_DIR_NAME),
    ]
    : [
      path.join(tmpdir(), CHAT_SAFE_IMAGE_DIR_NAME),
    ];

  return Array.from(new Set(candidateDirs.filter((dir): dir is string => Boolean(dir))));
}

export async function createChatSafeImageCopy(filePath: string): Promise<string | null> {
  if (!path.isAbsolute(filePath)) {
    return null;
  }

  const ext = path.extname(filePath) || '.png';
  const stem = sanitizeChatSafeFileStem(path.basename(filePath, ext));
  const hash = createHash('sha256').update(path.resolve(filePath)).digest('hex').slice(0, 10);
  const targetFileName = `${stem}-${hash}${ext.toLowerCase()}`;

  for (const candidateDir of chatSafeImageDirs()) {
    try {
      const targetPath = path.join(candidateDir, targetFileName);
      await mkdir(candidateDir, { recursive: true });
      await copyFile(filePath, targetPath);

      return targetPath;
    } catch {
      // Try the next writable location.
    }
  }

  return null;
}

export async function createScreenshotEntry(
  screenshot: ScreenshotCaptureResult,
  serverBaseUrl: string,
): Promise<ScreenshotEntryResult> {
  const error = screenshot.path.startsWith('ERROR:') ? screenshot.path : null;
  const altText = `${screenshot.device} preview`;
  const chatSafePath = error ? null : await createChatSafeImageCopy(screenshot.path);
  const chatSafeMarkdownImageTag = chatSafePath ? toMarkdownImageTag(chatSafePath, altText) : null;
  const originalMarkdownImageTag = error ? null : toMarkdownImageTag(screenshot.path, altText);
  const markdownImageTagVariants = [
    ...(chatSafePath ? toMarkdownImageTagVariants(chatSafePath, altText) : []),
    ...(error ? [] : toMarkdownImageTagVariants(screenshot.path, altText)),
  ];
  const markdownImageTags = Array.from(new Set(markdownImageTagVariants));
  const markdownImageTag = chatSafeMarkdownImageTag
    ?? originalMarkdownImageTag
    ?? markdownImageTags[0]
    ?? null;
  const chatDisplayPath = chatSafePath
    ? toMarkdownImagePath(chatSafePath)
    : error ? null : toMarkdownImagePath(screenshot.path);

  return {
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
    downloadUrl: screenshot.url ? new URL(screenshot.url, serverBaseUrl).toString() : null,
    width: screenshot.width,
    height: screenshot.height,
    error,
  };
}

export async function buildScreenshotContent(
  screenshots: ScreenshotArtifact[],
): Promise<{ content: ContentBlock[]; inlineImageCount: number }> {
  const content: ContentBlock[] = [];
  let inlineImageCount = 0;

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

    if (inlineImageCount >= MAX_INLINE_IMAGES || screenshot.error) {
      continue;
    }

    try {
      if (!path.isAbsolute(screenshot.path)) {
        continue;
      }

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
