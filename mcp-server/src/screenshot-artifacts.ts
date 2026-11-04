import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { constants as zlibConstants, inflateSync } from 'node:zlib';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { PNG } from 'pngjs';
import { toFileUri } from './tool-utils.js';

const MAX_INLINE_IMAGE_BYTES = 1_500_000;
const MAX_TOTAL_INLINE_IMAGE_BYTES = 6_000_000;
const MIN_INLINE_IMAGE_BYTES = 200_000;
// Vision APIs reject images with a side longer than 8000px.
const MAX_INLINE_IMAGE_DIMENSION = 7680;
// Vision models downscale past ~1568-2048px anyway, so oversized captures get a
// preview at this size, which also keeps encoding to a single fast pass.
const INLINE_PREVIEW_DIMENSION = 2000;
const MIN_INLINE_IMAGE_DIMENSION = 64;
// Taller full-page captures are cropped to their top so previews stay legible.
const MAX_INLINE_IMAGE_ASPECT_RATIO = 2;
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

interface RgbaImage {
  width: number;
  height: number;
  data: Buffer;
}

function downscalePng(source: RgbaImage, scale: number): PNG {
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const target = new PNG({ width, height });
  const xRatio = source.width / width;
  const yRatio = source.height / height;

  for (let y = 0; y < height; y += 1) {
    const startY = Math.floor(y * yRatio);
    const endY = Math.max(startY + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < width; x += 1) {
      const startX = Math.floor(x * xRatio);
      const endX = Math.max(startX + 1, Math.floor((x + 1) * xRatio));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = startY; sy < endY; sy += 1) {
        for (let sx = startX; sx < endX; sx += 1) {
          const index = (sy * source.width + sx) * 4;
          r += source.data[index];
          g += source.data[index + 1];
          b += source.data[index + 2];
          a += source.data[index + 3];
        }
      }
      const count = (endY - startY) * (endX - startX);
      const targetIndex = (y * width + x) * 4;
      target.data[targetIndex] = Math.round(r / count);
      target.data[targetIndex + 1] = Math.round(g / count);
      target.data[targetIndex + 2] = Math.round(b / count);
      target.data[targetIndex + 3] = Math.round(a / count);
    }
  }

  return target;
}

export interface InlinePngPreview {
  data: Buffer;
  width: number;
  height: number;
  downscaled: boolean;
  cropped: boolean;
}

/**
 * Returns a PNG that fits inline image limits, downscaling oversized captures
 * (full-page shots, diffs) instead of dropping them. Clients that cannot show
 * local files rely on this inline copy to display anything at all.
 */
export function fitPngForInline(file: Buffer, maxBytes: number): InlinePngPreview | null {
  const dimensions = readPngDimensions(file);
  if (!dimensions) {
    return null;
  }

  const longestSide = Math.max(dimensions.width, dimensions.height);
  if (file.byteLength <= maxBytes && longestSide <= MAX_INLINE_IMAGE_DIMENSION) {
    return { data: file, ...dimensions, downscaled: false, cropped: false };
  }

  const croppedHeight = Math.min(dimensions.height, dimensions.width * MAX_INLINE_IMAGE_ASPECT_RATIO);
  const cropped = croppedHeight < dimensions.height;
  let source = decodePngTopRows(file, croppedHeight);
  if (!source) {
    try {
      const decoded = PNG.sync.read(file);
      source = {
        width: decoded.width,
        height: croppedHeight,
        data: decoded.data.subarray(0, decoded.width * croppedHeight * 4),
      };
    } catch {
      return null;
    }
  }
  const sourceLongestSide = Math.max(source.width, source.height);

  let scale = Math.min(1, INLINE_PREVIEW_DIMENSION / sourceLongestSide);

  while (sourceLongestSide * scale >= MIN_INLINE_IMAGE_DIMENSION) {
    const preview = downscalePng(source, scale);
    // Paeth-only RGB encoding is ~3x faster than pngjs's adaptive RGBA default
    // and smaller; captures are opaque, so dropping alpha loses nothing.
    const data = PNG.sync.write(preview, { filterType: 4, colorType: 2 });
    if (data.byteLength <= maxBytes) {
      return { data, width: preview.width, height: preview.height, downscaled: true, cropped };
    }
    scale *= Math.min(0.9, Math.sqrt(maxBytes / data.byteLength) * 0.95);
  }

  return null;
}

/**
 * Decodes only the first `rows` rows of an 8-bit, non-interlaced RGB/RGBA PNG
 * (what Chromium writes), so cropping a 40k-pixel-tall full-page capture does
 * not inflate the whole image. Returns null for other formats.
 */
export function decodePngTopRows(file: Buffer, rows: number): RgbaImage | null {
  if (file.readUInt8(24) !== 8 || file.readUInt8(28) !== 0) {
    return null;
  }
  const colorType = file.readUInt8(25);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) {
    return null;
  }

  const width = file.readUInt32BE(16);
  const idatChunks: Buffer[] = [];
  for (let offset = 8; offset + 8 <= file.byteLength;) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') {
      idatChunks.push(file.subarray(offset + 8, offset + 8 + length));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }

  const compressed = Buffer.concat(idatChunks);
  const stride = 1 + width * channels;
  const needed = stride * rows;
  const totalRaw = stride * file.readUInt32BE(20);
  // Inflate a growing prefix of the stream until it yields the needed rows.
  let prefixLength = Math.min(compressed.byteLength, Math.ceil(compressed.byteLength * (needed / totalRaw) * 1.5) + 1024);
  let raw: Buffer;
  for (;;) {
    try {
      raw = inflateSync(compressed.subarray(0, prefixLength), { finishFlush: zlibConstants.Z_SYNC_FLUSH });
    } catch {
      return null;
    }
    if (raw.byteLength >= needed || prefixLength === compressed.byteLength) {
      break;
    }
    prefixLength = Math.min(compressed.byteLength, prefixLength * 2);
  }
  if (raw.byteLength < needed) {
    return null;
  }

  const data = Buffer.alloc(width * rows * 4);
  const rowBytes = width * channels;
  let previous = Buffer.alloc(rowBytes);
  for (let y = 0; y < rows; y += 1) {
    const filter = raw[y * stride];
    const line = Buffer.from(raw.subarray(y * stride + 1, (y + 1) * stride));
    for (let i = 0; i < rowBytes; i += 1) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;
      let predictor = 0;
      if (filter === 1) {
        predictor = left;
      } else if (filter === 2) {
        predictor = up;
      } else if (filter === 3) {
        predictor = (left + up) >> 1;
      } else if (filter === 4) {
        const estimate = left + up - upLeft;
        const distanceLeft = Math.abs(estimate - left);
        const distanceUp = Math.abs(estimate - up);
        const distanceUpLeft = Math.abs(estimate - upLeft);
        predictor = distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft
          ? left
          : distanceUp <= distanceUpLeft ? up : upLeft;
      } else if (filter !== 0) {
        return null;
      }
      line[i] = (line[i] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      const sourceIndex = x * channels;
      data[target] = line[sourceIndex];
      data[target + 1] = line[sourceIndex + 1];
      data[target + 2] = line[sourceIndex + 2];
      data[target + 3] = channels === 4 ? line[sourceIndex + 3] : 255;
    }
    previous = line;
  }

  return { width, height: rows, data };
}

function readPngDimensions(file: Buffer): { width: number; height: number } | null {
  const signature = '89504e470d0a1a0a';
  if (file.byteLength < 24 || file.subarray(0, 8).toString('hex') !== signature || file.toString('ascii', 12, 16) !== 'IHDR') {
    return null;
  }

  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

export async function buildScreenshotContent(
  screenshots: ScreenshotArtifact[],
): Promise<{ content: ContentBlock[]; inlineImageCount: number; downscaledImageCount: number }> {
  const content: ContentBlock[] = [];
  let inlineImageCount = 0;
  let downscaledImageCount = 0;
  const inlineCandidateCount = screenshots.filter((screenshot) => !screenshot.error).length;
  const maxBytesPerImage = Math.max(
    MIN_INLINE_IMAGE_BYTES,
    Math.min(MAX_INLINE_IMAGE_BYTES, Math.floor(MAX_TOTAL_INLINE_IMAGE_BYTES / Math.max(1, inlineCandidateCount))),
  );

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
        continue;
      }

      const preview = fitPngForInline(await readFile(screenshot.path), maxBytesPerImage);
      if (!preview) {
        continue;
      }

      if (preview.downscaled) {
        content.push({
          type: 'text',
          text: `${screenshot.device} inline preview ${preview.cropped ? 'shows the top of the page, ' : ''}downscaled to ${preview.width}x${preview.height}; full resolution is saved at ${screenshot.path}.`,
        });
        downscaledImageCount += 1;
      }
      content.push({
        type: 'image',
        mimeType: 'image/png',
        data: preview.data.toString('base64'),
      });
      inlineImageCount += 1;
    } catch {
      // Skip inline image generation when the file is unavailable.
    }
  }

  return { content, inlineImageCount, downscaledImageCount };
}
