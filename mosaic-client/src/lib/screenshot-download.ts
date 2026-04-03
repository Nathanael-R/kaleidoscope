import { resolveKaleidoscopeApiUrl } from '@/lib/kaleidoscope-api';

export interface DownloadableScreenshot {
  path: string;
  url?: string;
}

export interface FileSystemWritableFileStreamLike {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}

export interface FileSystemFileHandleLike {
  createWritable: () => Promise<FileSystemWritableFileStreamLike>;
}

export interface FileSystemDirectoryHandleLike {
  getFileHandle: (name: string, options: { create: boolean }) => Promise<FileSystemFileHandleLike>;
  queryPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

export type DirectoryPickerWindow = Window & typeof globalThis & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandleLike>;
};

export interface ScreenshotDownloadSummary {
  downloadableCount: number;
  savedCount: number;
  skippedCount: number;
  failures: Array<{ path: string; message: string }>;
}

const DIRECTORY_PERMISSION_OPTIONS = { mode: 'readwrite' as const };

export function isAbortLikeError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'AbortError';
}

export async function ensureDirectoryWritePermission(directoryHandle: FileSystemDirectoryHandleLike) {
  if (typeof directoryHandle.queryPermission === 'function') {
    const state = await directoryHandle.queryPermission.call(directoryHandle, DIRECTORY_PERMISSION_OPTIONS);
    if (state === 'granted') {
      return;
    }
  }

  if (typeof directoryHandle.requestPermission === 'function') {
    const state = await directoryHandle.requestPermission.call(directoryHandle, DIRECTORY_PERMISSION_OPTIONS);
    if (state === 'granted') {
      return;
    }

    throw new Error('Permission to save screenshots was denied.');
  }
}

export async function requestScreenshotDownloadDirectory(
  existingHandle: FileSystemDirectoryHandleLike | null,
  pickerWindow: DirectoryPickerWindow | undefined,
): Promise<FileSystemDirectoryHandleLike | null> {
  if (existingHandle) {
    await ensureDirectoryWritePermission(existingHandle);
    return existingHandle;
  }

  if (!pickerWindow) {
    return null;
  }

  if (typeof pickerWindow.showDirectoryPicker !== 'function') {
    return null;
  }

  const directoryHandle = await pickerWindow.showDirectoryPicker();
  await ensureDirectoryWritePermission(directoryHandle);
  return directoryHandle;
}

export async function saveScreenshotsToDirectory(
  screenshots: DownloadableScreenshot[],
  directoryHandle: FileSystemDirectoryHandleLike | null,
  fetchImpl: typeof fetch = fetch,
): Promise<ScreenshotDownloadSummary> {
  const targets = screenshots.filter((shot) => shot.url && !shot.path.startsWith('ERROR:'));
  const summary: ScreenshotDownloadSummary = {
    downloadableCount: targets.length,
    savedCount: 0,
    skippedCount: screenshots.length - targets.length,
    failures: [],
  };

  if (!directoryHandle || targets.length === 0) {
    return summary;
  }

  for (const shot of targets) {
    try {
      const response = await fetchImpl(resolveKaleidoscopeApiUrl(shot.url as string));
      if (!response.ok) {
        throw new Error(`Failed to download ${shot.url}`);
      }

      const blob = await response.blob();
      const fileName = shot.path.split(/[\\/]/).pop() || 'screenshot.png';
      const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      summary.savedCount += 1;
    } catch (error) {
      if (isAbortLikeError(error)) {
        throw error;
      }

      summary.failures.push({
        path: shot.path,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}