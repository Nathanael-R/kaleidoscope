import * as React from "react";
import { Button } from "@/components/ui/button";
import { devices, type Device } from "@/lib/devices";
import type { InspectSelectionPayload } from "@/lib/inspect";
import { kaleidoscopeFetch, resolveKaleidoscopeApiUrl } from "@/lib/kaleidoscope-api";
import { cn } from "@/lib/utils";
import { ArrowLeftFromLine, Camera, Crosshair, Expand, Loader2, Menu, Move, RefreshCw, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";
import DeviceFrame from "./device-frame";
import { getDeviceFrameMetrics } from "./device-frame-metrics";

interface PreviewAreaProps {
  selectedDevice: Device;
  currentUrl: string;
  proxyUrl?: string | null;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  pinnedDevices: Device[];
  viewMode: 'single' | 'comparison';
  onDevicePin?: (device: Device) => void;
  reloadTrigger?: number;
  canInspect?: boolean;
  inspectEnabled?: boolean;
  inspectPending?: boolean;
  onToggleInspect?: () => void;
  onInspectSelection?: (selection: InspectSelectionPayload) => void;
  onCanvasDeviceDrop?: (device: Device) => void;
}

import { usePreviewStore } from "@/store/preview-store";

type DirectoryPickerWindow = Window & typeof globalThis & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};

export default function PreviewArea({
  selectedDevice,
  currentUrl,
  proxyUrl,
  pinnedDevices,
  viewMode,
  onDevicePin,
  reloadTrigger = 0,
  canInspect = false,
  inspectEnabled = false,
  inspectPending = false,
  onToggleInspect,
  onInspectSelection,
  onCanvasDeviceDrop,
}: PreviewAreaProps) {
  const [isLandscape, setIsLandscape] = React.useState(false);
  const [scale, setScale] = React.useState(1);
  const [devicePositions, setDevicePositions] = React.useState<Record<string, { x: number; y: number }>>({});
  const [dragState, setDragState] = React.useState<{ deviceId: string | null; offset: { x: number; y: number } }>({
    deviceId: null,
    offset: { x: 0, y: 0 }
  });
  const containerRef = React.useRef<HTMLDivElement>(null);
  const singlePreviewRef = React.useRef<HTMLDivElement>(null);
  const [localReloadTrigger, setLocalReloadTrigger] = React.useState(0);
  const [singlePreviewBounds, setSinglePreviewBounds] = React.useState({ width: 0, height: 0 });
  const [isCanvasDropActive, setIsCanvasDropActive] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [viewportWidth, setViewportWidth] = React.useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );
  const [fullscreenTransition, setFullscreenTransition] = React.useState<'entering' | 'exiting' | null>(null);
  const fullscreenAnimationTimeoutRef = React.useRef<number | null>(null);

  const { darkMode } = usePreviewStore();

  const getDeviceIcon = (iconName: string) => {
    const iconMap: Record<string, string> = {
      'mobile-alt': '📱',
      'tablet-alt': '📟', 
      'laptop': '💻',
      'desktop': '🖥️'
    };
    return iconMap[iconName] || '📱';
  };

  const handleDevicePin = (device: Device) => {
    if (onDevicePin) {
      onDevicePin(device);
    }
  };

  const handleCanvasDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!onCanvasDeviceDrop) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsCanvasDropActive(true);
  }, [onCanvasDeviceDrop]);

  const handleCanvasDragLeave = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsCanvasDropActive(false);
  }, []);

  const handleCanvasDropEvent = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!onCanvasDeviceDrop) {
      return;
    }

    event.preventDefault();
    setIsCanvasDropActive(false);

    const deviceId =
      event.dataTransfer.getData('application/x-kaleidoscope-device') ||
      event.dataTransfer.getData('text/plain');
    const droppedDevice = devices.find((candidate) => candidate.id === deviceId);

    if (droppedDevice) {
      onCanvasDeviceDrop(droppedDevice);
    }
  }, [onCanvasDeviceDrop]);

  const handleMouseDown = (e: React.MouseEvent, deviceId: string) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const currentPos = devicePositions[deviceId] || { x: 0, y: 0 };
    setDragState({
      deviceId,
      offset: {
        x: e.clientX - rect.left - currentPos.x,
        y: e.clientY - rect.top - currentPos.y
      }
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState.deviceId || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const newX = e.clientX - rect.left - dragState.offset.x;
    const newY = e.clientY - rect.top - dragState.offset.y;
    
    setDevicePositions(prev => ({
      ...prev,
      [dragState.deviceId!]: { x: newX, y: newY }
    }));
  };

  const handleMouseUp = () => {
    setDragState({ deviceId: null, offset: { x: 0, y: 0 } });
  };

  const getDefaultPosition = (index: number, total: number) => {
    // Arrange devices in a nice grid pattern with some spacing
    const cols = Math.ceil(Math.sqrt(total));
    const row = Math.floor(index / cols);
    const col = index % cols;
    
    const spacing = 100;
    const offsetX = col * (400 + spacing) + 50; // 400px approximate device width + spacing
    const offsetY = row * (600 + spacing) + 50; // 600px approximate device height + spacing
    
    return { x: offsetX, y: offsetY };
  };

  const resetPositions = () => {
    const newPositions: Record<string, { x: number; y: number }> = {};
    pinnedDevices.forEach((device, index) => {
      newPositions[device.id] = getDefaultPosition(index, pinnedDevices.length);
    });
    setDevicePositions(newPositions);
  };

  const handleRefresh = () => {
    setLocalReloadTrigger(prev => prev + 1);
  };

  const [screenshotting, setScreenshotting] = React.useState(false);

  const downloadScreenshots = async (screenshots: Array<{ url?: string; path: string }>) => {
    if (typeof window === 'undefined') {
      alert(`Screenshots saved to ./screenshots/`);
      return;
    }

    const showDirectoryPicker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (typeof showDirectoryPicker !== 'function') {
      alert(`Screenshots saved to ./screenshots/`);
      return;
    }

    try {
      const directoryHandle = await showDirectoryPicker();
      const targets = screenshots.filter((shot) => shot.url && !shot.path.startsWith('ERROR:'));
      await Promise.all(
        targets.map(async (shot) => {
          const response = await fetch(resolveKaleidoscopeApiUrl(shot.url as string));
          if (!response.ok) {
            throw new Error(`Failed to download ${shot.url}`);
          }
          const blob = await response.blob();
          const fileName = shot.path.split(/[\\/]/).pop() || 'screenshot.png';
          const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        })
      );
      alert(`Downloaded ${targets.length} screenshot(s).`);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      alert(`Screenshot save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleScreenshot = async () => {
    if (!currentUrl) return;
    setScreenshotting(true);
    try {
      const devices = viewMode === 'comparison' && pinnedDevices.length > 0
        ? pinnedDevices.map(d => d.id)
        : [selectedDevice.id];
      const res = await kaleidoscopeFetch(resolveKaleidoscopeApiUrl('/api/screenshots'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: proxyUrl || currentUrl, devices }),
      });
      if (res.ok) {
        const data = await res.json() as { screenshots: Array<{ device: string; path: string; url?: string }> };
        await downloadScreenshots(data.screenshots);
      } else {
        const err = await res.json() as { error: string };
        alert(`Screenshot failed: ${err.error}`);
      }
    } catch (error) {
      alert(`Screenshot error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setScreenshotting(false);
    }
  };

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const updateFullscreenState = () => {
      const nextFullscreen = Boolean(document.fullscreenElement);

      setIsFullscreen((previous) => {
        if (previous !== nextFullscreen) {
          setFullscreenTransition(nextFullscreen ? 'entering' : 'exiting');

          if (typeof window !== 'undefined') {
            if (fullscreenAnimationTimeoutRef.current !== null) {
              window.clearTimeout(fullscreenAnimationTimeoutRef.current);
            }

            fullscreenAnimationTimeoutRef.current = window.setTimeout(() => {
              setFullscreenTransition(null);
              fullscreenAnimationTimeoutRef.current = null;
            }, 520);
          }
        }

        return nextFullscreen;
      });
    };

    updateFullscreenState();
    document.addEventListener('fullscreenchange', updateFullscreenState);

    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState);

      if (typeof window !== 'undefined' && fullscreenAnimationTimeoutRef.current !== null) {
        window.clearTimeout(fullscreenAnimationTimeoutRef.current);
      }
    };
  }, []);

  const handleFullscreen = async () => {
    if (typeof document === 'undefined') {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
        return;
      }

      const element = document.documentElement;
      await element.requestFullscreen?.();
    } catch (error) {
      console.error('Fullscreen toggle failed:', error);
    }
  };

  const handleRotate = () => {
    setIsLandscape(!isLandscape);
  };

  const handleZoomIn = () => {
    setScale(Math.min(scale + 0.1, 2));
  };

  const handleZoomOut = () => {
    setScale(Math.max(scale - 0.1, 0.3));
  };

  const handleResetZoom = () => {
    setScale(1);
  };

  const { deviceWidth, deviceHeight, frameWidth, frameHeight } = React.useMemo(
    () => getDeviceFrameMetrics(selectedDevice, isLandscape),
    [isLandscape, selectedDevice]
  );

  React.useEffect(() => {
    if (viewMode !== 'single') {
      return;
    }

    const node = singlePreviewRef.current;
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
      window.addEventListener('resize', updateBounds);
      return () => window.removeEventListener('resize', updateBounds);
    }

    const observer = new ResizeObserver(() => updateBounds());
    observer.observe(node);

    return () => observer.disconnect();
  }, [frameHeight, frameWidth, viewMode]);

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

  const effectiveSingleScale = React.useMemo(() => fitScale * scale, [fitScale, scale]);
  const isCompactComparisonViewport = viewportWidth < 720;

  const getComparisonScale = React.useCallback((device: Device) => {
    if (!isCompactComparisonViewport) {
      return pinnedDevices.length === 1 ? scale : Math.min(scale, 0.7);
    }

    const { frameWidth } = getDeviceFrameMetrics(device, isLandscape);
    const availableWidth = Math.max(viewportWidth - 96, 220);
    const fittedScale = availableWidth / frameWidth;

    return Math.max(0.18, Math.min(scale, fittedScale, 0.55));
  }, [isCompactComparisonViewport, isLandscape, pinnedDevices.length, scale, viewportWidth]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth);
    };

    updateViewportWidth();
    window.addEventListener('resize', updateViewportWidth);

    return () => {
      window.removeEventListener('resize', updateViewportWidth);
    };
  }, []);

  return (
    <main
      role="main"
      data-testid="preview-area"
      data-view-mode={viewMode}
      data-fullscreen-state={isFullscreen ? 'fullscreen' : 'windowed'}
      data-fullscreen-transition={fullscreenTransition ?? undefined}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-4 md:p-8",
        darkMode ? "bg-gray-900" : "bg-gray-100",
        fullscreenTransition === 'entering' && 'animate-fullscreen-enter',
        fullscreenTransition === 'exiting' && 'animate-fullscreen-exit'
      )}
    >
      {/* Preview Header */}
      <div className="mb-6 flex items-center justify-between animate-fade-in-up">
        <div aria-live="polite">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 transition-all duration-200" data-testid="text-device-name">
            {viewMode === 'comparison' ? `Comparing ${pinnedDevices.length} Devices` : `${selectedDevice.name} Preview`}
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 transition-all duration-200" data-testid="text-device-dimensions">
            {viewMode === 'comparison'
              ? `Side-by-side device comparison`
              : `${deviceWidth} × ${deviceHeight} pixels`}
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-2 md:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="flex items-center transition-all duration-150 hover:scale-105 active:scale-95"
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleScreenshot}
            disabled={screenshotting || !currentUrl}
            className="flex items-center transition-all duration-150 hover:scale-105 active:scale-95"
            data-testid="button-screenshot"
          >
            {screenshotting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Camera className="w-4 h-4 mr-2" />
            )}
            <span className="hidden sm:inline">Screenshot</span>
          </Button>
          <Button
            variant={inspectEnabled ? "default" : "outline"}
            size="sm"
            onClick={onToggleInspect}
            disabled={!inspectEnabled && (!canInspect || inspectPending)}
            className="flex items-center transition-all duration-150 hover:scale-105 active:scale-95"
            data-testid="button-inspect"
          >
            {inspectPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Crosshair className="w-4 h-4 mr-2" />
            )}
            <span className="hidden sm:inline">{inspectEnabled ? 'Stop Inspect' : 'Inspect'}</span>
          </Button>
          <Button
            size="sm"
            onClick={handleFullscreen}
            className={cn(
              "flex items-center overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95",
              isFullscreen
                ? "bg-slate-900 text-white shadow-[0_10px_30px_rgba(15,23,42,0.3)] hover:bg-slate-800"
                : "",
              fullscreenTransition && 'animate-fullscreen-button-pulse'
            )}
            data-testid="button-fullscreen"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <X className={cn('w-4 h-4 mr-2', fullscreenTransition && 'animate-icon-swap')} />
            ) : (
              <Expand className={cn('w-4 h-4 mr-2', fullscreenTransition && 'animate-icon-swap')} />
            )}
            <span className={cn('hidden sm:inline', fullscreenTransition && 'animate-slide-in-right')}>
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </span>
          </Button>
        </div>
      </div>

      {/* Device Preview Frame(s) */}
      {viewMode === 'single' ? (
        <div
          ref={singlePreviewRef}
          className="relative w-full min-w-0 pb-6 pt-2"
          data-testid="single-preview-stage"
          onDragOver={handleCanvasDragOver}
          onDragLeave={handleCanvasDragLeave}
          onDrop={handleCanvasDropEvent}
        >
          {isCanvasDropActive && (
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
              fullscreenTransition === 'exiting' && 'animate-fullscreen-stage-exit'
            )}
          >
            <DeviceFrame
              device={selectedDevice}
              url={currentUrl}
              proxyUrl={proxyUrl}
              isLandscape={isLandscape}
              scale={effectiveSingleScale}
              reloadTrigger={reloadTrigger + localReloadTrigger}
              inspectEnabled={inspectEnabled}
              onInspectSelection={onInspectSelection}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Comparison Controls */}
          <div className={cn(
            "bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700",
            isCompactComparisonViewport ? 'space-y-3' : 'flex items-center justify-between',
          )}>
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Comparing {pinnedDevices.length} devices
              </span>
              {pinnedDevices.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pinnedDevices.forEach(device => handleDevicePin(device))}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  data-testid="button-clear-all-pins"
                >
                  Clear All
                </Button>
              )}
            </div>
            {!isCompactComparisonViewport && (
              <span className="text-xs text-gray-500">
                Drag to reposition
              </span>
            )}
          </div>

          {pinnedDevices.length === 0 ? (
            <div
              className={cn(
                'text-center py-16 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed dark:border-gray-600',
                isCanvasDropActive ? 'border-cyan-400 bg-cyan-50/60 dark:bg-cyan-950/30' : 'border-gray-300'
              )}
              data-testid="comparison-canvas-dropzone"
              onDragOver={handleCanvasDragOver}
              onDragLeave={handleCanvasDragLeave}
              onDrop={handleCanvasDropEvent}
            >
              <div className="text-gray-400 mb-4">
                <Menu className="h-16 w-16 mx-auto mb-4" />
              </div>
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                No devices pinned for comparison
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Drag devices here from the sidebar, use the pin icons in the sidebar, or press Space while selecting a device.
              </p>
              <div className="flex justify-center space-x-2 text-xs text-gray-400">
                <kbd className="px-2 py-1 bg-gray-100 rounded">Space</kbd>
                <span>to pin current device</span>
                <span>•</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded">C</kbd>
                <span>to toggle comparison mode</span>
              </div>
            </div>
          ) : isCompactComparisonViewport ? (
            <div className="space-y-6" data-testid="comparison-device-stack">
              {pinnedDevices.map((device) => (
                <div
                  key={device.id}
                  className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:p-4"
                >
                  <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex items-center space-x-3">
                      <span className="text-lg">
                        {getDeviceIcon(device.icon)}
                      </span>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">{device.name}</h4>
                        <p className="text-xs text-gray-500">{device.width} × {device.height}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDevicePin(device)}
                      className="w-8 h-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      data-testid={`remove-pin-${device.id}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex justify-center overflow-x-auto py-2">
                    <DeviceFrame
                      device={device}
                      url={currentUrl}
                      proxyUrl={proxyUrl}
                      isLandscape={isLandscape}
                      scale={getComparisonScale(device)}
                      reloadTrigger={reloadTrigger + localReloadTrigger}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div 
              ref={containerRef}
              className={cn(
                'relative min-h-screen w-full rounded-2xl border-2 border-dashed p-4 transition-colors',
                isCanvasDropActive ? 'border-cyan-400 bg-cyan-50/40 dark:bg-cyan-950/20' : 'border-transparent'
              )}
              data-testid="comparison-canvas-dropzone"
              onDragOver={handleCanvasDragOver}
              onDragLeave={handleCanvasDragLeave}
              onDrop={handleCanvasDropEvent}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {pinnedDevices.map((device, index) => {
                const position = devicePositions[device.id] || getDefaultPosition(index, pinnedDevices.length);
                const isDragging = dragState.deviceId === device.id;
                
                return (
                  <div
                    key={device.id}
                    className={cn(
                      "absolute group cursor-move select-none",
                      isDragging && "z-50"
                    )}
                    style={{
                      left: position.x,
                      top: position.y,
                      transform: isDragging ? 'rotate(2deg) scale(1.02)' : 'none',
                      transition: isDragging ? 'none' : 'transform 0.2s ease',
                      boxShadow: isDragging ? '0 20px 40px rgba(0,0,0,0.15)' : 'none'
                    }}
                    onMouseDown={(e) => handleMouseDown(e, device.id)}
                  >
                    {/* Drag Handle */}
                    <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white px-3 py-1 rounded-full text-xs flex items-center space-x-2">
                      <Move className="w-3 h-3" />
                      <span>Drag to move</span>
                    </div>
                    
                    {/* Device Header */}
                    <div className="mb-4 flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                      <div className="flex items-center space-x-3">
                        <span className="text-lg">
                          {getDeviceIcon(device.icon)}
                        </span>
                        <div>
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">{device.name}</h4>
                          <p className="text-xs text-gray-500">{device.width} × {device.height}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDevicePin(device);
                        }}
                        className="w-8 h-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        data-testid={`remove-pin-${device.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    {/* Device Frame */}
                    <div className="w-full max-w-md mx-auto">
                      <DeviceFrame
                        device={device}
                        url={currentUrl}
                        proxyUrl={proxyUrl}
                        isLandscape={isLandscape}
                        scale={getComparisonScale(device)}
                        reloadTrigger={reloadTrigger + localReloadTrigger}
                      />
                    </div>
                  </div>
                );
              })}
              
              {/* Instructions */}
              {pinnedDevices.length > 0 && (
                <div className="absolute top-4 right-4 bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Move className="w-4 h-4" />
                      <span>Drag devices to reposition</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetPositions}
                      className="text-xs"
                      data-testid="button-reset-positions"
                    >
                      Reset Layout
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="mt-12 flex justify-center">
        <div className="flex items-center flex-wrap gap-2 md:gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-shadow duration-200 hover:shadow-md">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRotate}
            className="flex items-center text-gray-700 dark:text-gray-300 hover:text-primary transition-all duration-150 hover:scale-105 active:scale-95"
            data-testid="button-rotate"
            aria-label="Rotate device orientation"
          >
            <RotateCw className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Rotate</span>
          </Button>
          <div className="w-px h-6 bg-gray-300 hidden sm:block"></div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            className="flex items-center text-gray-700 dark:text-gray-300 hover:text-primary transition-all duration-150 hover:scale-105 active:scale-95"
            data-testid="button-zoom-in"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Zoom In</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            className="flex items-center text-gray-700 dark:text-gray-300 hover:text-primary transition-all duration-150 hover:scale-105 active:scale-95"
            data-testid="button-zoom-out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Zoom Out</span>
          </Button>
          <div className="w-px h-6 bg-gray-300 hidden sm:block"></div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetZoom}
            className="flex items-center text-gray-700 dark:text-gray-300 hover:text-primary transition-all duration-150 hover:scale-105 active:scale-95"
            data-testid="button-reset-zoom"
            aria-label="Fit to screen"
          >
            <ArrowLeftFromLine className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Fit</span>
          </Button>
        </div>
      </div>

      {/* Scale indicator */}
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
