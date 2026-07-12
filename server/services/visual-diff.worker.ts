import { parentPort, workerData } from 'node:worker_threads';
import {
  comparePngBuffersCore,
  VisualDiffDimensionError,
  VisualDiffLimitError,
  type VisualDiffLimits,
  type VisualDiffOptions,
} from './visual-diff-core.ts';

type WorkerInput = {
  baselineBuffer: Uint8Array;
  currentBuffer: Uint8Array;
  options: VisualDiffOptions;
  limits: VisualDiffLimits;
};

const input = workerData as WorkerInput;

try {
  const result = comparePngBuffersCore(
    Buffer.from(input.baselineBuffer),
    Buffer.from(input.currentBuffer),
    input.options,
    input.limits,
  );
  parentPort?.postMessage({ ok: true, result });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    error: {
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof VisualDiffDimensionError
        ? { baselineSize: error.baselineSize, currentSize: error.currentSize }
        : {}),
      isLimitError: error instanceof VisualDiffLimitError,
    },
  });
}
