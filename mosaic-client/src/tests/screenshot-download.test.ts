import { describe, expect, it, vi } from 'vitest';
import {
  requestScreenshotDownloadDirectory,
  saveScreenshotsToDirectory,
  type DirectoryPickerWindow,
  type FileSystemDirectoryHandleLike,
} from '@/lib/screenshot-download';

function createDirectoryHandle() {
  const createWritable = vi.fn().mockResolvedValue({
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  });
  const getFileHandle = vi.fn().mockResolvedValue({ createWritable });

  const directoryHandle: FileSystemDirectoryHandleLike = {
    queryPermission: vi.fn(function () {
      if (this !== directoryHandle) {
        throw new TypeError('Illegal invocation');
      }

      return Promise.resolve('prompt');
    }),
    requestPermission: vi.fn(function () {
      if (this !== directoryHandle) {
        throw new TypeError('Illegal invocation');
      }

      return Promise.resolve('granted');
    }),
    getFileHandle,
  };

  return { directoryHandle, getFileHandle, createWritable };
}

describe('screenshot download helper', () => {
  it('reuses an existing directory handle and preserves native method binding', async () => {
    const { directoryHandle } = createDirectoryHandle();

    const result = await requestScreenshotDownloadDirectory(directoryHandle, undefined);

    expect(result).toBe(directoryHandle);
    expect(directoryHandle.queryPermission).toHaveBeenCalledTimes(1);
    expect(directoryHandle.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('opens the picker when there is no existing handle', async () => {
    const { directoryHandle } = createDirectoryHandle();
    const showDirectoryPicker = vi.fn().mockResolvedValue(directoryHandle);
    const pickerWindow = { showDirectoryPicker } as DirectoryPickerWindow;

    const result = await requestScreenshotDownloadDirectory(null, pickerWindow);

    expect(result).toBe(directoryHandle);
    expect(showDirectoryPicker).toHaveBeenCalledTimes(1);
  });

  it('returns a partial-failure summary instead of failing the whole batch', async () => {
    const { directoryHandle, getFileHandle } = createDirectoryHandle();
    getFileHandle
      .mockResolvedValueOnce({
        createWritable: vi.fn().mockResolvedValue({
          write: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined),
        }),
      })
      .mockRejectedValueOnce(new Error('Permission lost while creating file'));

    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(new Blob(['a'])) })
      .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(new Blob(['b'])) });

    const summary = await saveScreenshotsToDirectory([
      { path: '/tmp/iphone.png', url: '/api/screenshots-files/iphone.png' },
      { path: '/tmp/ipad.png', url: '/api/screenshots-files/ipad.png' },
    ], directoryHandle, fetchImpl as typeof fetch);

    expect(summary.downloadableCount).toBe(2);
    expect(summary.savedCount).toBe(1);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]?.message).toContain('Permission lost while creating file');
  });

  it('treats server-side capture errors as skipped downloads', async () => {
    const { directoryHandle } = createDirectoryHandle();
    const fetchImpl = vi.fn();

    const summary = await saveScreenshotsToDirectory([
      { path: 'ERROR: Browser crashed' },
    ], directoryHandle, fetchImpl as typeof fetch);

    expect(summary.downloadableCount).toBe(0);
    expect(summary.savedCount).toBe(0);
    expect(summary.skippedCount).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});