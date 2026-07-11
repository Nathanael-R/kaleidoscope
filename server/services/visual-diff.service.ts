import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface VisualDiffOptions {
  colorThreshold: number;
  includeAntialiasing: boolean;
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
  constructor(
    readonly baselineSize: { width: number; height: number },
    readonly currentSize: { width: number; height: number },
  ) {
    super(
      `Screenshot dimensions differ: baseline is ${baselineSize.width}x${baselineSize.height}, ` +
      `current is ${currentSize.width}x${currentSize.height}.`,
    );
    this.name = 'VisualDiffDimensionError';
  }
}

export function comparePngBuffers(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
  options: VisualDiffOptions,
): VisualDiffResult {
  const baseline = PNG.sync.read(baselineBuffer);
  const current = PNG.sync.read(currentBuffer);

  if (baseline.width !== current.width || baseline.height !== current.height) {
    throw new VisualDiffDimensionError(
      { width: baseline.width, height: baseline.height },
      { width: current.width, height: current.height },
    );
  }

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
    mismatchPercentage: totalPixels === 0 ? 0 : (mismatchedPixels / totalPixels) * 100,
    diffBuffer: PNG.sync.write(diff),
  };
}

export async function comparePngFiles(
  baselinePath: string,
  currentPath: string,
  diffPath: string,
  options: VisualDiffOptions,
): Promise<Omit<VisualDiffResult, 'diffBuffer'>> {
  const [baselineBuffer, currentBuffer] = await Promise.all([
    readFile(baselinePath),
    readFile(currentPath),
  ]);
  const { diffBuffer, ...result } = comparePngBuffers(baselineBuffer, currentBuffer, options);
  await mkdir(path.dirname(diffPath), { recursive: true });
  await writeFile(diffPath, diffBuffer);
  return result;
}
