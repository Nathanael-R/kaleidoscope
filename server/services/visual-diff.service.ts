import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  comparePngBuffersCore,
  VisualDiffDimensionError,
  VisualDiffLimitError,
  type VisualDiffLimits,
  type VisualDiffOptions,
  type VisualDiffResult,
} from './visual-diff-core.js';

export type { VisualDiffOptions, VisualDiffResult } from './visual-diff-core.js';
export { VisualDiffDimensionError, VisualDiffLimitError } from './visual-diff-core.js';

const DEFAULT_MAX_INPUT_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_PIXELS = 25_000_000;
const DEFAULT_MAX_ARTIFACT_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ARTIFACT_COUNT = 100;

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const VISUAL_DIFF_LIMITS: VisualDiffLimits = {
  maxInputBytes: readPositiveIntEnv('KALEIDOSCOPE_VISUAL_DIFF_MAX_INPUT_BYTES', DEFAULT_MAX_INPUT_BYTES),
  maxPixels: readPositiveIntEnv('KALEIDOSCOPE_VISUAL_DIFF_MAX_PIXELS', DEFAULT_MAX_PIXELS),
};
const MAX_ARTIFACT_AGE_MS = readPositiveIntEnv(
  'KALEIDOSCOPE_VISUAL_DIFF_MAX_ARTIFACT_AGE_MS',
  DEFAULT_MAX_ARTIFACT_AGE_MS,
);
const MAX_ARTIFACT_COUNT = readPositiveIntEnv(
  'KALEIDOSCOPE_VISUAL_DIFF_MAX_ARTIFACT_COUNT',
  DEFAULT_MAX_ARTIFACT_COUNT,
);

type WorkerMessage =
  | { ok: true; result: Omit<VisualDiffResult, 'diffBuffer'> & { diffBuffer: Uint8Array } }
  | {
      ok: false;
      error: {
        name: string;
        message: string;
        baselineSize?: { width: number; height: number };
        currentSize?: { width: number; height: number };
        isLimitError?: boolean;
      };
    };

function getWorkerUrl(): URL {
  const currentFile = fileURLToPath(import.meta.url);
  return basename(currentFile) === 'index.js'
    ? new URL('./services/visual-diff.worker.js', import.meta.url)
    : new URL('./visual-diff.worker.ts', import.meta.url);
}

function isBundledRuntime(): boolean {
  return basename(fileURLToPath(import.meta.url)) === 'index.js';
}

function compareInWorker(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
  options: VisualDiffOptions,
): Promise<VisualDiffResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(getWorkerUrl(), {
      workerData: { baselineBuffer, currentBuffer, options, limits: VISUAL_DIFF_LIMITS },
      ...(isBundledRuntime() ? {} : { execArgv: ['--import', 'tsx'] }),
    });
    worker.once('message', (message: WorkerMessage) => {
      if (message.ok) {
        resolve({ ...message.result, diffBuffer: Buffer.from(message.result.diffBuffer) });
      } else if (message.error.name === 'VisualDiffDimensionError' && message.error.baselineSize && message.error.currentSize) {
        reject(new VisualDiffDimensionError(message.error.baselineSize, message.error.currentSize));
      } else if (message.error.isLimitError) {
        reject(new VisualDiffLimitError(message.error.message));
      } else {
        reject(new Error(message.error.message));
      }
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Visual diff worker exited with code ${code}.`));
    });
  });
}

export function comparePngBuffers(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
  options: VisualDiffOptions,
): VisualDiffResult {
  return comparePngBuffersCore(baselineBuffer, currentBuffer, options, VISUAL_DIFF_LIMITS);
}

export async function pruneVisualDiffArtifacts(
  directory: string,
  maxAgeMs = MAX_ARTIFACT_AGE_MS,
  maxCount = MAX_ARTIFACT_COUNT,
  protectedPath?: string,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  const files = await Promise.all(
    entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.png'))
      .map(async (entry) => {
        const filePath = join(directory, entry.name);
        const fileStats = await stat(filePath);
        return { path: filePath, modifiedAt: fileStats.mtimeMs };
      }),
  );
  files.sort((left, right) => {
    if (left.path === protectedPath) return -1;
    if (right.path === protectedPath) return 1;
    return right.modifiedAt - left.modifiedAt;
  });
  const cutoff = Date.now() - maxAgeMs;
  await Promise.all(files
    .filter((file, index) => index >= maxCount || file.modifiedAt < cutoff)
    .map(file => rm(file.path, { force: true })));
}

export async function comparePngFiles(
  baselinePath: string,
  currentPath: string,
  diffPath: string,
  options: VisualDiffOptions,
): Promise<Omit<VisualDiffResult, 'diffBuffer'>> {
  const [baselineStats, currentStats] = await Promise.all([stat(baselinePath), stat(currentPath)]);
  for (const [label, size] of [['Baseline screenshot', baselineStats.size], ['Current screenshot', currentStats.size]] as const) {
    if (size > VISUAL_DIFF_LIMITS.maxInputBytes) {
      throw new VisualDiffLimitError(`${label} exceeds the ${VISUAL_DIFF_LIMITS.maxInputBytes}-byte visual diff input limit.`);
    }
  }

  const [baselineBuffer, currentBuffer] = await Promise.all([readFile(baselinePath), readFile(currentPath)]);
  const { diffBuffer, ...result } = await compareInWorker(baselineBuffer, currentBuffer, options);
  await mkdir(dirname(diffPath), { recursive: true });
  await writeFile(diffPath, diffBuffer);
  await pruneVisualDiffArtifacts(dirname(diffPath), MAX_ARTIFACT_AGE_MS, MAX_ARTIFACT_COUNT, diffPath);
  return result;
}
