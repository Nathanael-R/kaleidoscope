import { Button } from "@/components/ui/button";
import type { Device } from "@/lib/devices";
import { cn } from "@/lib/utils";
import { ArrowLeftFromLine, Camera, Expand, Loader2, Menu, Move, RefreshCw, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";
import DeviceFrame from "./device-frame";
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
}

import * as React from "react";

export default function PreviewArea({
  selectedDevice,
  currentUrl,
  proxyUrl,
  isSidebarCollapsed = false,
  onToggleSidebar,
  pinnedDevices,
  viewMode,
  onDevicePin,
  reloadTrigger = 0,
}: PreviewAreaProps) {
  const [isLandscape, setIsLandscape] = React.useState(false);
  const [scale, setScale] = React.useState(1);
  const [devicePositions, setDevicePositions] = React.useState<Record<string, { x: number; y: number }>>({});
  const [dragState, setDragState] = React.useState<{ deviceId: string | null; offset: { x: number; y: number } }>({
    deviceId: null,
    offset: { x: 0, y: 0 }
  });
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [localReloadTrigger, setLocalReloadTrigger] = React.useState(0);

  // Detect dark mode from body class
  const [darkMode, setDarkMode] = React.useState(false);
  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setDarkMode(document.body.classList.contains("dark"));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    setDarkMode(document.body.classList.contains("dark"));
    return () => observer.disconnect();
  }, []);

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

  const handleScreenshot = async () => {
    if (!currentUrl) return;
    setScreenshotting(true);
    try {
      const devices = viewMode === 'comparison' && pinnedDevices.length > 0
        ? pinnedDevices.map(d => d.id)
        : [selectedDevice.id];
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const res = await fetch(`${apiUrl}/api/screenshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: proxyUrl || currentUrl, devices }),
      });
      if (res.ok) {
        const data = await res.json() as { screenshots: Array<{ device: string; path: string }> };
        alert(`${data.screenshots.length} screenshot(s) saved to ./screenshots/`);
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

  const handleFullscreen = () => {
    const element = document.documentElement;
    if (element.requestFullscreen) {
      element.requestFullscreen();
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

  const deviceWidth = isLandscape ? selectedDevice.height : selectedDevice.width;
  const deviceHeight = isLandscape ? selectedDevice.width : selectedDevice.height;

  return (
    <main role="main" className={`flex-1 p-4 md:p-8 overflow-auto relative ${darkMode ? "bg-gray-900" : "bg-gray-100"}`}>
      {/* Floating Sidebar Toggle (when collapsed) */}
      {isSidebarCollapsed && onToggleSidebar && (
        <Button
          variant="default"
          size="sm"
          onClick={onToggleSidebar}
          className="fixed top-20 left-4 z-50 shadow-lg"
          data-testid="button-expand-sidebar-floating"
        >
          <Menu className="w-4 h-4 mr-2" />
          Devices
        </Button>
      )}

      {/* Preview Header */}
      <div className="mb-6 flex items-center justify-between">
        <div aria-live="polite">
          <h2 className="text-lg font-semibold text-gray-900" data-testid="text-device-name">
            {viewMode === 'comparison' ? `Comparing ${pinnedDevices.length} Devices` : `${selectedDevice.name} Preview`}
          </h2>
          <p className="text-sm text-gray-600" data-testid="text-device-dimensions">
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
            className="flex items-center"
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
            className="flex items-center"
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
            size="sm"
            onClick={handleFullscreen}
            className="flex items-center"
            data-testid="button-fullscreen"
          >
            <Expand className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Fullscreen</span>
          </Button>
        </div>
      </div>

      {/* Device Preview Frame(s) */}
      {viewMode === 'single' ? (
        <DeviceFrame
          device={selectedDevice}
          url={currentUrl}
          proxyUrl={proxyUrl}
          isLandscape={isLandscape}
          scale={scale}
          reloadTrigger={reloadTrigger + localReloadTrigger}

        />
      ) : (
        <div className="space-y-8">
          {/* Comparison Controls */}
          <div className="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700">
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
            <span className="text-xs text-gray-500">
              Drag to reposition
            </span>
          </div>

          {pinnedDevices.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <div className="text-gray-400 mb-4">
                <Menu className="h-16 w-16 mx-auto mb-4" />
              </div>
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                No devices pinned for comparison
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Pin devices using the pin icons in the sidebar or press Space while selecting a device.
              </p>
              <div className="flex justify-center space-x-2 text-xs text-gray-400">
                <kbd className="px-2 py-1 bg-gray-100 rounded">Space</kbd>
                <span>to pin current device</span>
                <span>•</span>
                <kbd className="px-2 py-1 bg-gray-100 rounded">C</kbd>
                <span>to toggle comparison mode</span>
              </div>
            </div>
          ) : (
            <div 
              ref={containerRef}
              className="relative min-h-screen w-full"
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
                    <div className="mb-4 flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                      <div className="flex items-center space-x-3">
                        <span className="text-lg">
                          {getDeviceIcon(device.icon)}
                        </span>
                        <div>
                          <h4 className="font-medium text-gray-900">{device.name}</h4>
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
                        scale={pinnedDevices.length === 1 ? scale : Math.min(scale, 0.7)}
                        reloadTrigger={reloadTrigger + localReloadTrigger}
              
                      />
                    </div>
                  </div>
                );
              })}
              
              {/* Instructions */}
              {pinnedDevices.length > 0 && (
                <div className="absolute top-4 right-4 bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
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
        <div className="flex items-center flex-wrap gap-2 md:gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRotate}
            className="flex items-center text-gray-700 hover:text-primary"
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
            className="flex items-center text-gray-700 hover:text-primary"
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
            className="flex items-center text-gray-700 hover:text-primary"
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
            className="flex items-center text-gray-700 hover:text-primary"
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
          <div className="bg-black/75 text-white px-3 py-1 rounded-full text-sm">
            {Math.round(scale * 100)}%
          </div>
        </div>
      )}
    </main>
  );
}
