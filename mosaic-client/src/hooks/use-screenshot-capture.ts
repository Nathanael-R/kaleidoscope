import { useCallback, useRef, useState } from "react";

import { kaleidoscopeFetch, resolveKaleidoscopeApiUrl } from "@/lib/kaleidoscope-api";
import {
  isAbortLikeError,
  requestScreenshotDownloadDirectory,
  saveScreenshotsToDirectory,
  type DirectoryPickerWindow,
  type DownloadableScreenshot,
  type FileSystemDirectoryHandleLike,
  type ScreenshotDownloadSummary,
} from "@/lib/screenshot-download";

interface UseScreenshotCaptureOptions {
  currentUrl: string;
  onCaptureStart?: () => void;
}

interface CaptureScreenshotsOptions {
  devices: string[];
  fullPage?: boolean;
}

type ScreenshotCaptureCompleted<TScreenshot extends DownloadableScreenshot> = {
  status: "completed";
  screenshots: TScreenshot[];
  summary: ScreenshotDownloadSummary;
  usedDirectoryHandle: boolean;
};

type ScreenshotCaptureFailed = {
  status: "failed";
  message: string;
};

type ScreenshotCaptureAborted = {
  status: "aborted";
};

export type ScreenshotCaptureOutcome<TScreenshot extends DownloadableScreenshot> =
  | ScreenshotCaptureCompleted<TScreenshot>
  | ScreenshotCaptureFailed
  | ScreenshotCaptureAborted;

export function useScreenshotCapture<TScreenshot extends DownloadableScreenshot>({
  currentUrl,
  onCaptureStart,
}: UseScreenshotCaptureOptions) {
  const [isCapturing, setIsCapturing] = useState(false);
  const directoryHandleRef = useRef<FileSystemDirectoryHandleLike | null>(null);

  const captureScreenshots = useCallback(
    async ({ devices, fullPage = false }: CaptureScreenshotsOptions): Promise<ScreenshotCaptureOutcome<TScreenshot>> => {
      if (!currentUrl || devices.length === 0) {
        return { status: "aborted" };
      }

      let directoryHandle: FileSystemDirectoryHandleLike | null = null;

      try {
        directoryHandle = await requestScreenshotDownloadDirectory(
          directoryHandleRef.current,
          typeof window === "undefined" ? undefined : (window as DirectoryPickerWindow),
        );

        if (directoryHandle) {
          directoryHandleRef.current = directoryHandle;
        }
      } catch (error) {
        if (isAbortLikeError(error)) {
          return { status: "aborted" };
        }

        return {
          status: "failed",
          message: error instanceof Error ? error.message : "Failed to choose a download folder",
        };
      }

      onCaptureStart?.();
      setIsCapturing(true);

      try {
        const response = await kaleidoscopeFetch(resolveKaleidoscopeApiUrl("/api/screenshots"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: currentUrl,
            devices,
            fullPage,
          }),
        });

        if (!response.ok) {
          let message = "Failed to capture screenshots";

          try {
            const data = (await response.json()) as { error?: string };
            if (data.error) {
              message = data.error;
            }
          } catch {
            // Ignore malformed error bodies and keep the default message.
          }

          return { status: "failed", message };
        }

        const data = (await response.json()) as { screenshots: TScreenshot[] };
        const summary = await saveScreenshotsToDirectory(data.screenshots, directoryHandle);

        if (summary.failures.length > 0) {
          directoryHandleRef.current = null;
        }

        return {
          status: "completed",
          screenshots: data.screenshots,
          summary,
          usedDirectoryHandle: Boolean(typeof window !== "undefined" && directoryHandle),
        };
      } catch (error) {
        if (isAbortLikeError(error)) {
          return { status: "aborted" };
        }

        return {
          status: "failed",
          message: error instanceof Error ? error.message : "Screenshot capture failed",
        };
      } finally {
        setIsCapturing(false);
      }
    },
    [currentUrl, onCaptureStart],
  );

  return {
    isCapturing,
    captureScreenshots,
  };
}
