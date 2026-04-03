import * as React from "react";

import { Button } from "@/components/ui/button";
import { devices, getDeviceIconGlyph, type Device } from "@/lib/devices";
import { cn } from "@/lib/utils";
import { Menu, Move, X } from "lucide-react";

import DeviceFrame from "./device-frame";

interface PreviewComparisonCanvasProps {
  pinnedDevices: Device[];
  currentUrl: string;
  proxyUrl?: string | null;
  isLandscape: boolean;
  reloadTrigger: number;
  isCompactViewport: boolean;
  getComparisonScale: (device: Device) => number;
  onDevicePin?: (device: Device) => void;
  onCanvasDeviceDrop?: (device: Device) => void;
}

interface DragState {
  deviceId: string | null;
  offset: { x: number; y: number };
}

export default function PreviewComparisonCanvas({
  pinnedDevices,
  currentUrl,
  proxyUrl,
  isLandscape,
  reloadTrigger,
  isCompactViewport,
  getComparisonScale,
  onDevicePin,
  onCanvasDeviceDrop,
}: PreviewComparisonCanvasProps) {
  const [devicePositions, setDevicePositions] = React.useState<Record<string, { x: number; y: number }>>({});
  const [dragState, setDragState] = React.useState<DragState>({
    deviceId: null,
    offset: { x: 0, y: 0 },
  });
  const [isCanvasDropActive, setIsCanvasDropActive] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

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

  const handleCanvasDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
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

  const handleMouseDown = React.useCallback((event: React.MouseEvent, deviceId: string) => {
    event.preventDefault();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const currentPosition = devicePositions[deviceId] || { x: 0, y: 0 };
    setDragState({
      deviceId,
      offset: {
        x: event.clientX - rect.left - currentPosition.x,
        y: event.clientY - rect.top - currentPosition.y,
      },
    });
  }, [devicePositions]);

  const handleMouseMove = React.useCallback((event: React.MouseEvent) => {
    if (!dragState.deviceId || !containerRef.current) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const nextX = event.clientX - rect.left - dragState.offset.x;
    const nextY = event.clientY - rect.top - dragState.offset.y;

    setDevicePositions((previous) => ({
      ...previous,
      [dragState.deviceId as string]: { x: nextX, y: nextY },
    }));
  }, [dragState.deviceId, dragState.offset.x, dragState.offset.y]);

  const handleMouseUp = React.useCallback(() => {
    setDragState({ deviceId: null, offset: { x: 0, y: 0 } });
  }, []);

  const getDefaultPosition = React.useCallback((index: number, total: number) => {
    const columns = Math.ceil(Math.sqrt(total));
    const row = Math.floor(index / columns);
    const column = index % columns;
    const spacing = 100;

    return {
      x: column * (400 + spacing) + 50,
      y: row * (600 + spacing) + 50,
    };
  }, []);

  const resetPositions = React.useCallback(() => {
    const nextPositions: Record<string, { x: number; y: number }> = {};

    pinnedDevices.forEach((device, index) => {
      nextPositions[device.id] = getDefaultPosition(index, pinnedDevices.length);
    });

    setDevicePositions(nextPositions);
  }, [getDefaultPosition, pinnedDevices]);

  return (
    <div className="space-y-8">
      <div className={cn(
        "bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700",
        isCompactViewport ? 'space-y-3' : 'flex items-center justify-between',
      )}>
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Comparing {pinnedDevices.length} devices
          </span>
          {pinnedDevices.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => pinnedDevices.forEach((device) => onDevicePin?.(device))}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              data-testid="button-clear-all-pins"
            >
              Clear All
            </Button>
          )}
        </div>
        {!isCompactViewport && (
          <span className="text-xs text-gray-500">Drag to reposition</span>
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
          onDrop={handleCanvasDrop}
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
      ) : isCompactViewport ? (
        <div className="space-y-6" data-testid="comparison-device-stack">
          {pinnedDevices.map((device) => (
            <div
              key={device.id}
              className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:p-4"
            >
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center space-x-3">
                  <span className="text-lg">{getDeviceIconGlyph(device.icon)}</span>
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">{device.name}</h4>
                    <p className="text-xs text-gray-500">{device.width} × {device.height}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDevicePin?.(device)}
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
                  reloadTrigger={reloadTrigger}
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
          onDrop={handleCanvasDrop}
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
                className={cn("absolute group cursor-move select-none", isDragging && "z-50")}
                style={{
                  left: position.x,
                  top: position.y,
                  transform: isDragging ? 'rotate(2deg) scale(1.02)' : 'none',
                  transition: isDragging ? 'none' : 'transform 0.2s ease',
                  boxShadow: isDragging ? '0 20px 40px rgba(0,0,0,0.15)' : 'none',
                }}
                onMouseDown={(event) => handleMouseDown(event, device.id)}
              >
                <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white px-3 py-1 rounded-full text-xs flex items-center space-x-2">
                  <Move className="w-3 h-3" />
                  <span>Drag to move</span>
                </div>
                <div className="mb-4 flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">{getDeviceIconGlyph(device.icon)}</span>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">{device.name}</h4>
                      <p className="text-xs text-gray-500">{device.width} × {device.height}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDevicePin?.(device);
                    }}
                    className="w-8 h-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    data-testid={`remove-pin-${device.id}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="w-full max-w-md mx-auto">
                  <DeviceFrame
                    device={device}
                    url={currentUrl}
                    proxyUrl={proxyUrl}
                    isLandscape={isLandscape}
                    scale={getComparisonScale(device)}
                    reloadTrigger={reloadTrigger}
                  />
                </div>
              </div>
            );
          })}

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
        </div>
      )}
    </div>
  );
}