import { isRecord } from '../shared/mcp-app-protocol.js';

export interface ScreenshotResult {
  deviceId: string;
  device: string;
  width: number;
  height: number;
  error: string | null;
  imageUrl?: string;
  resourceUri?: string;
}

export interface CaptureResult {
  url: string;
  count: number;
  screenshots: ScreenshotResult[];
}

export class CaptureResultParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptureResultParseError';
  }
}

function failure(message: string): never {
  throw new CaptureResultParseError(message);
}

function toolError(content: unknown): string {
  if (!Array.isArray(content)) return 'Kaleidoscope could not complete the capture.';
  const block = content.find((item) => isRecord(item) && item.type === 'text' && typeof item.text === 'string');
  return isRecord(block) && typeof block.text === 'string'
    ? block.text
    : 'Kaleidoscope could not complete the capture.';
}

export function parseCaptureToolResult(value: unknown): CaptureResult {
  if (!isRecord(value)) failure('The host returned an invalid capture result.');
  if (value.isError === true) failure(toolError(value.content));
  if (!isRecord(value.structuredContent)) failure('This result does not contain screenshot capture data.');

  const structured = value.structuredContent;
  if (typeof structured.url !== 'string' || structured.url.length === 0) failure('Capture URL is missing.');
  if (!Array.isArray(structured.screenshots)) failure('Capture screenshots are missing.');
  if (!Number.isInteger(structured.count) || structured.count !== structured.screenshots.length) {
    failure('Capture count does not match its screenshots.');
  }

  const devices = new Set<string>();
  const screenshots = structured.screenshots.map((item, index): ScreenshotResult => {
    if (!isRecord(item)) failure(`Screenshot ${index} is invalid.`);
    const { deviceId, device, width, height, error } = item;
    if (typeof deviceId !== 'string' || deviceId.length === 0) failure(`Screenshot ${index} has no stable device ID.`);
    if (typeof device !== 'string' || device.length === 0) failure(`Screenshot ${index} has no device ID.`);
    if (devices.has(deviceId)) failure(`Screenshot device ${deviceId} is duplicated.`);
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) failure(`Screenshot ${device} has an invalid width.`);
    if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) failure(`Screenshot ${device} has an invalid height.`);
    if (error !== null && typeof error !== 'string') failure(`Screenshot ${device} has an invalid error.`);
    devices.add(deviceId);
    return { deviceId, device, width, height, error };
  });

  if (!Array.isArray(structured.inlinePreviews)) failure('Capture preview mappings are missing.');
  if (!Array.isArray(value.content)) failure('Capture content blocks are missing.');
  const mappedDevices = new Set<string>();
  for (const [mappingIndex, mapping] of structured.inlinePreviews.entries()) {
    if (!isRecord(mapping)) failure(`Preview mapping ${mappingIndex} is invalid.`);
    const { deviceId, contentIndex, resourceUri } = mapping;
    if (typeof deviceId !== 'string' || !devices.has(deviceId)) failure(`Preview mapping ${mappingIndex} references an unknown device.`);
    if (mappedDevices.has(deviceId)) failure(`Preview mapping for ${deviceId} is duplicated.`);
    if (!Number.isInteger(contentIndex) || (contentIndex as number) < 0) failure(`Preview mapping for ${deviceId} has an invalid content index.`);
    if (resourceUri !== null && typeof resourceUri !== 'string') failure(`Preview mapping for ${deviceId} has an invalid resource URI.`);
    const block = value.content[contentIndex as number];
    if (!isRecord(block) || block.type !== 'image' || typeof block.data !== 'string' || typeof block.mimeType !== 'string') {
      failure(`Preview mapping for ${deviceId} does not point to an image block.`);
    }
    const screenshot = screenshots.find((entry) => entry.deviceId === deviceId);
    if (!screenshot) failure(`Preview mapping ${mappingIndex} references an unknown device.`);
    screenshot.imageUrl = `data:${block.mimeType};base64,${block.data}`;
    if (typeof resourceUri === 'string') screenshot.resourceUri = resourceUri;
    mappedDevices.add(deviceId);
  }

  return { url: structured.url, count: structured.count as number, screenshots };
}
