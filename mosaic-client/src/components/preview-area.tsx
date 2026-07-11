import * as React from "react";

import { devices, type Device } from "@/lib/devices";
import { useScreenshotCapture } from "@/hooks/use-screenshot-capture";
import type { InspectSelectionPayload } from "@/lib/inspect";
import { cn } from "@/lib/utils";
import { usePreviewStore } from "@/store/preview-store";

import DeviceFrame from "./device-frame";
import { getDeviceFrameMetrics } from "./device-frame-metrics";
import PreviewAreaHeader from "./preview-area-header";
import PreviewComparisonCanvas from "./preview-comparison-canvas";
import PreviewQuickActions from "./preview-quick-actions";

interface PreviewAreaProps {
  selectedDevice: Device;
  currentUrl: string;
  proxyUrl?: string | null;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  pinnedDevices: Device[];
  viewMode: 'single' | 'comparison';
  onDevicePin?: (device: Device) => void;
  canInspect?: boolean;
  inspectEnabled?: boolean;
  inspectPending?: boolean;
  onToggleInspect?: () => void;
  onInspectSelection?: (selection: InspectSelectionPayload) => void;
  onCanvasDeviceDrop?: (device: Device) => void;
}

export default function PreviewArea({
  selectedDevice,
  currentUrl,
  proxyUrl,
  pinnedDevices,
  viewMode,
  onDevicePin,
  canInspect = false,
  inspectEnabled = false,
  inspectPending = false,
  onToggleInspect,
  onInspectSelection,
  onCanvasDeviceDrop,
}: PreviewAreaProps) {
  const [isLandscape, setIsLandscape] = React.useState(false);
  const [scale, setScale] = React.useState(1);
  const [localReloadTrigger, setLocalReloadTrigger] = React.useState(0);
  const [singlePreviewBounds, setSinglePreviewBounds] = React.useState({ width: 0, height: 0 });
  const [isSingleDropActive, setIsSingleDropActive] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(() =>
    typeof document === 'undefined' ? false : Boolean(document.fullscreenElement),
  );
  const [viewportWidth, setViewportWidth] = React.useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );
  const [fullscreenTransition, setFullscreenTransition] = React.useState<'entering' | 'exiting' | null>(null);

  const singlePreviewObserverRef = React.useRef<ResizeObserver | null>(null);
  const singlePreviewWindowCleanupRef = React.useRef<(() => void) | null>(null);

  const { darkMode } = usePreviewStore();
  const { isCapturing: screenshotting, captureScreenshots } = useScreenshotCapture({
    currentUrl,
    proxyUrl,
  });

  const handleDevicePin = React.useCallback((device: Device) => {
    onDevicePin?.(device);
  }, [onDevicePin]);

  const handleSingleStageDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!onCanvasDeviceDrop) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsSingleDropActive(true);
  }, [onCanvasDeviceDrop]);

  const handleSingleStageDragLeave = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsSingleDropActive(false);
  }, []);

  const handleSingleStageDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!onCanvasDeviceDrop) {
      return;
    }

    event.preventDefault();
    setIsSingleDropActive(false);

    const deviceId =
      event.dataTransfer.getData('application/x-kaleidoscope-device') ||
      event.dataTransfer.getData('text/plain');
    const droppedDevice = devices.find((candidate) => candidate.id === deviceId);

    if (droppedDevice) {
      onCanvasDeviceDrop(droppedDevice);
    }
  }, [onCanvasDeviceDrop]);

  const handleRefresh = React.useCallback(() => {
    setLocalReloadTrigger((previous) => previous + 1);
  }, []);

  const handleScreenshot = React.useCallback(async () => {
    if (!currentUrl) {
      return;
    }

    const targetDevices = viewMode === 'comparison' && pinnedDevices.length > 0
      ? pinnedDevices.map((device) => device.id)
      : [selectedDevice.id];

    const outcome = await captureScreenshots({ devices: targetDevices });

    if (outcome.status === 'aborted') {
      return;
    }

    if (outcome.status === 'failed') {
      alert(`Screenshot failed: ${outcome.message}`);
      return;
    }

    if (outcome.summary.downloadableCount === 0) {
      alert('No downloadable screenshots were produced. Check the capture results for device-specific errors.');
      return;
    }

    if (!outcome.usedDirectoryHandle) {
      alert('Screenshots saved to ./screenshots/');
      return;
    }

    if (outcome.summary.failures.length > 0) {
      if (outcome.summary.savedCount > 0) {
        alert(`Downloaded ${outcome.summary.savedCount} screenshot(s); ${outcome.summary.failures.length} failed. First error: ${outcome.summary.failures[0]?.message ?? 'Unknown error.'}`);
        return;
      }

      alert(`Screenshot save failed: ${outcome.summary.failures[0]?.message ?? 'Unknown error.'}`);
      return;
    }

    alert(`Downloaded ${outcome.summary.savedCount} screenshot(s).`);
  }, [captureScreenshots, currentUrl, pinnedDevices, selectedDevice.id, viewMode]);

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    let fullscreenAnimationTimeout: number | null = null;
    const clearFullscreenAnimationTimeout = () => {
      if (typeof window === 'undefined' || fullscreenAnimationTimeout === null) {
        return;
      }

      window.clearTimeout(fullscreenAnimationTimeout);
      fullscreenAnimationTimeout = null;
    };

    const updateFullscreenState = () => {
      const nextFullscreen = Boolean(document.fullscreenElement);

      setIsFullscreen((previous) => {
        if (previous !== nextFullscreen) {
          setFullscreenTransition(nextFullscreen ? 'entering' : 'exiting');

          if (typeof window !== 'undefined') {
            clearFullscreenAnimationTimeout();
            fullscreenAnimationTimeout = window.setTimeout(() => {
              setFullscreenTransition(null);
              fullscreenAnimationTimeout = null;
            }, 520);
          }
        }

        return nextFullscreen;
      });
    };

    document.addEventListener('fullscreenchange', updateFullscreenState);

    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState);
      clearFullscreenAnimationTimeout();
    };
  }, []);

  const handleFullscreen = React.useCallback(async () => {
    if (typeof document === 'undefined') {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
        return;
      }

      await document.documentElement.requestFullscreen?.();
    } catch (error) {
      console.error('Fullscreen toggle failed:', error);
    }
  }, []);

  const handleRotate = React.useCallback(() => {
    setIsLandscape((previous) => !previous);
  }, []);

  const handleZoomIn = React.useCallback(() => {
    setScale((previous) => Math.min(previous + 0.1, 2));
  }, []);

  const handleZoomOut = React.useCallback(() => {
    setScale((previous) => Math.max(previous - 0.1, 0.3));
  }, []);

  const handleResetZoom = React.useCallback(() => {
    setScale(1);
  }, []);

  const { deviceWidth, deviceHeight, frameWidth } = React.useMemo(
    () => getDeviceFrameMetrics(selectedDevice, isLandscape),
    [isLandscape, selectedDevice],
  );

  const setSinglePreviewNode = React.useCallback((node: HTMLDivElement | null) => {
    singlePreviewObserverRef.current?.disconnect();
    singlePreviewObserverRef.current = null;
    singlePreviewWindowCleanupRef.current?.();
    singlePreviewWindowCleanupRef.current = null;

    if (!node) {
      return;
    }

    const updateBounds = () => {
      const rect = node.getBoundingClientRect();
      setSinglePreviewBounds((previous) => {
        if (previous.width === rect.width && previous.height === rect.height) {
          return previous;
        }

        return {
          width: rect.width,
          height: rect.height,
        };
      });
    };

    updateBounds();

    if (typeof ResizeObserver === 'undefined') {
      if (typeof window === 'undefined') {
        return;
      }

      window.addEventListener('resize', updateBounds);
      singlePreviewWindowCleanupRef.current = () => window.removeEventListener('resize', updateBounds);
      return;
    }

    const observer = new ResizeObserver(() => updateBounds());
    observer.observe(node);
    singlePreviewObserverRef.current = observer;
  }, []);

  const fitScale = React.useMemo(() => {
    if (viewMode !== 'single' || singlePreviewBounds.width === 0) {
      return 1;
    }

    const availableWidth = Math.max(singlePreviewBounds.width - 32, 0);
    const widthScale = availableWidth / frameWidth;
    const nextScale = Math.min(widthScale, 1);

    if (!Number.isFinite(nextScale) || nextScale <= 0) {
      return 1;
    }

    return Math.max(0.35, nextScale);
  }, [frameWidth, singlePreviewBounds.width, viewMode]);

  const effectiveSingleScale = fitScale * scale;
  const isCompactComparisonViewport = viewportWidth < 720;

  const getComparisonScale = React.useCallback((device: Device) => {
    if (!isCompactComparisonViewport) {
      return pinnedDevices.length === 1 ? scale : Math.min(scale, 0.7);
    }

    const { frameWidth: comparisonFrameWidth } = getDeviceFrameMetrics(device, isLandscape);
    const availableWidth = Math.max(viewportWidth - 96, 220);
    const fittedScale = availableWidth / comparisonFrameWidth;

    return Math.max(0.18, Math.min(scale, fittedScale, 0.55));
  }, [isCompactComparisonViewport, isLandscape, pinnedDevices.length, scale, viewportWidth]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener('resize', updateViewportWidth);

    return () => {
      window.removeEventListener('resize', updateViewportWidth);
    };
  }, []);

  return (
    <main
      data-testid="preview-area"
      data-view-mode={viewMode}
      data-fullscreen-state={isFullscreen ? 'fullscreen' : 'windowed'}
      data-fullscreen-transition={fullscreenTransition ?? undefined}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-4 md:p-8",
        darkMode ? "bg-gray-900" : "bg-gray-100",
        fullscreenTransition === 'entering' && 'animate-fullscreen-enter',
        fullscreenTransition === 'exiting' && 'animate-fullscreen-exit',
      )}
    >
      <PreviewAreaHeader
        selectedDevice={selectedDevice}
        viewMode={viewMode}
        pinnedDeviceCount={pinnedDevices.length}
        deviceWidth={deviceWidth}
        deviceHeight={deviceHeight}
        currentUrl={currentUrl}
        screenshotting={screenshotting}
        canInspect={canInspect}
        inspectEnabled={inspectEnabled}
        inspectPending={inspectPending}
        isFullscreen={isFullscreen}
        fullscreenTransition={fullscreenTransition}
        onRefresh={handleRefresh}
        onScreenshot={handleScreenshot}
        onToggleInspect={onToggleInspect}
        onToggleFullscreen={handleFullscreen}
      />

      {viewMode === 'single' ? (
        <div
          ref={setSinglePreviewNode}
          className="relative w-full min-w-0 pb-6 pt-2"
          data-testid="single-preview-stage"
          onDragOver={handleSingleStageDragOver}
          onDragLeave={handleSingleStageDragLeave}
          onDrop={handleSingleStageDrop}
        >
          {isSingleDropActive && (
            <div className="pointer-events-none absolute inset-x-4 inset-y-2 z-20 flex items-center justify-center rounded-4xl border-2 border-dashed border-cyan-400 bg-cyan-500/10 text-sm font-medium text-cyan-700 backdrop-blur-sm">
              Drop here to add this device to the comparison canvas
            </div>
          )}
          <div
            className={cn(
              "flex min-h-112 w-full min-w-0 justify-center rounded-4xl border p-4 md:p-6 lg:p-8 transition-[transform,box-shadow,background-color,border-color] duration-500",
              darkMode
                ? "border-gray-800 bg-gray-950/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                : "border-gray-200 bg-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]",
              isFullscreen && "border-cyan-300/60 bg-white/75 shadow-[0_24px_60px_rgba(15,23,42,0.18)] dark:border-cyan-400/30 dark:bg-gray-950/70",
              fullscreenTransition === 'entering' && 'animate-fullscreen-stage-enter',
              fullscreenTransition === 'exiting' && 'animate-fullscreen-stage-exit',
            )}
          >
            <DeviceFrame
              device={selectedDevice}
              url={currentUrl}
              proxyUrl={proxyUrl}
              isLandscape={isLandscape}
              scale={effectiveSingleScale}
              reloadTrigger={localReloadTrigger}
              inspectEnabled={inspectEnabled}
              onInspectSelection={onInspectSelection}
            />
          </div>
        </div>
      ) : (
        <PreviewComparisonCanvas
          pinnedDevices={pinnedDevices}
          currentUrl={currentUrl}
          proxyUrl={proxyUrl}
          isLandscape={isLandscape}
          reloadTrigger={localReloadTrigger}
          isCompactViewport={isCompactComparisonViewport}
          getComparisonScale={getComparisonScale}
          onDevicePin={handleDevicePin}
          onCanvasDeviceDrop={onCanvasDeviceDrop}
        />
      )}

      <PreviewQuickActions
        onRotate={handleRotate}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
      />

      {scale !== 1 && (
        <div className="mt-4 flex justify-center">
          <div className="bg-black/75 text-white px-3 py-1 rounded-full text-sm animate-scale-in">
            {Math.round(scale * 100)}%
          </div>
        </div>
      )}
    </main>
  );
}
