import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface VisualDiffOptions {
  colorThreshold: number;
  includeAntialiasing: boolean;
}

export interface VisualDiffLimits {
  maxInputBytes: number;
  maxPixels: number;
}

export interface VisualDiffResult {
  width: number;
  height: number;
  totalPixels: number;
  mismatchedPixels: number;
  mismatchPercentage: number;
  diffBuffer: Buffer;
}

export class VisualDiffDimensionError extends Error {
  readonly baselineSize: { width: number; height: number };
  readonly currentSize: { width: number; height: number };

  constructor(
    baselineSize: { width: number; height: number },
    currentSize: { width: number; height: number },
  ) {
    super(
      `Screenshot dimensions differ: baseline is ${baselineSize.width}x${baselineSize.height}, ` +
      `current is ${currentSize.width}x${currentSize.height}.`,
    );
    this.name = 'VisualDiffDimensionError';
    this.baselineSize = baselineSize;
    this.currentSize = currentSize;
  }
}

export class VisualDiffLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VisualDiffLimitError';
  }
}

function readPngDimensions(buffer: Buffer, label: string): { width: number; height: number } {
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.byteLength < 24 || buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    throw new Error(`${label} is not a valid PNG file.`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new Error(`${label} has invalid zero dimensions.`);
  }
  return { width, height };
}

function enforceLimits(buffer: Buffer, label: string, limits: VisualDiffLimits) {
  if (buffer.byteLength > limits.maxInputBytes) {
    throw new VisualDiffLimitError(
      `${label} exceeds the ${limits.maxInputBytes}-byte visual diff input limit.`,
    );
  }

  const dimensions = readPngDimensions(buffer, label);
  if (dimensions.width * dimensions.height > limits.maxPixels) {
    throw new VisualDiffLimitError(
      `${label} exceeds the ${limits.maxPixels}-pixel visual diff limit ` +
      `(${dimensions.width}x${dimensions.height}).`,
    );
  }
  return dimensions;
}

export function comparePngBuffersCore(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
  options: VisualDiffOptions,
  limits: VisualDiffLimits,
): VisualDiffResult {
  const baselineSize = enforceLimits(baselineBuffer, 'Baseline screenshot', limits);
  const currentSize = enforceLimits(currentBuffer, 'Current screenshot', limits);

  if (baselineSize.width !== currentSize.width || baselineSize.height !== currentSize.height) {
    throw new VisualDiffDimensionError(baselineSize, currentSize);
  }

  const baseline = PNG.sync.read(baselineBuffer);
  const current = PNG.sync.read(currentBuffer);
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const mismatchedPixels = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    baseline.width,
    baseline.height,
    {
      threshold: options.colorThreshold,
      includeAA: options.includeAntialiasing,
      diffColor: [239, 68, 68],
      diffColorAlt: [34, 197, 94],
    },
  );
  const totalPixels = baseline.width * baseline.height;

  return {
    width: baseline.width,
    height: baseline.height,
    totalPixels,
    mismatchedPixels,
    mismatchPercentage: (mismatchedPixels / totalPixels) * 100,
    diffBuffer: PNG.sync.write(diff),
  };
}
