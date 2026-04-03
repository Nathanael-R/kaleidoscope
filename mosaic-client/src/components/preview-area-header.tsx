import { Button } from "@/components/ui/button";
import type { Device } from "@/lib/devices";
import { cn } from "@/lib/utils";
import { Camera, Crosshair, Expand, Loader2, RefreshCw, X } from "lucide-react";

interface PreviewAreaHeaderProps {
  selectedDevice: Device;
  viewMode: 'single' | 'comparison';
  pinnedDeviceCount: number;
  deviceWidth: number;
  deviceHeight: number;
  currentUrl: string;
  screenshotting: boolean;
  canInspect: boolean;
  inspectEnabled: boolean;
  inspectPending: boolean;
  isFullscreen: boolean;
  fullscreenTransition: 'entering' | 'exiting' | null;
  onRefresh: () => void;
  onScreenshot: () => void;
  onToggleInspect?: () => void;
  onToggleFullscreen: () => void;
}

export default function PreviewAreaHeader({
  selectedDevice,
  viewMode,
  pinnedDeviceCount,
  deviceWidth,
  deviceHeight,
  currentUrl,
  screenshotting,
  canInspect,
  inspectEnabled,
  inspectPending,
  isFullscreen,
  fullscreenTransition,
  onRefresh,
  onScreenshot,
  onToggleInspect,
  onToggleFullscreen,
}: PreviewAreaHeaderProps) {
  return (
    <div className="mb-6 flex items-center justify-between animate-fade-in-up">
      <div aria-live="polite">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 transition-all duration-200" data-testid="text-device-name">
          {viewMode === 'comparison' ? `Comparing ${pinnedDeviceCount} Devices` : `${selectedDevice.name} Preview`}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 transition-all duration-200" data-testid="text-device-dimensions">
          {viewMode === 'comparison'
            ? 'Side-by-side device comparison'
            : `${deviceWidth} × ${deviceHeight} pixels`}
        </p>
      </div>
      <div className="flex items-center flex-wrap gap-2 md:gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="flex items-center transition-all duration-150 hover:scale-105 active:scale-95"
          data-testid="button-refresh"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onScreenshot}
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
          onClick={onToggleFullscreen}
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
  );
}