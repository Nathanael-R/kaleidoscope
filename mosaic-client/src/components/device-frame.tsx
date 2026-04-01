import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Device } from "@/lib/devices";
import type { InspectSelectionPayload } from "@/lib/inspect";

type BatteryStateManager = {
  level: number;
  charging: boolean;
  addEventListener: (event: string, listener: () => void) => void;
  removeEventListener: (event: string, listener: () => void) => void;
};

type NavigatorWithBattery = Navigator & {
  getBattery?: () => Promise<BatteryStateManager>;
};

function formatStatusTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function getDeviceFrameMetrics(device: Device, isLandscape = false) {
  const deviceWidth = isLandscape ? device.height : device.width;
  const deviceHeight = isLandscape ? device.width : device.height;
  const frameWidth = deviceWidth + (device.type === 'mobile' ? 48 : device.type === 'tablet' ? 60 : 80);
  const frameHeight = deviceHeight + (device.type === 'mobile' ? 96 : device.type === 'tablet' ? 80 : 60);

  return {
    deviceWidth,
    deviceHeight,
    frameWidth,
    frameHeight,
  };
}

export type LinkedActionCommand =
  | {
      kind: 'scroll';
      left: number;
      top: number;
      progressX: number;
      progressY: number;
    }
  | {
      kind: 'click';
      selector: string | null;
      xRatio: number;
      yRatio: number;
    };

export interface DeviceFrameLinkedController {
  setLinkedActionsEnabled: (enabled: boolean) => void;
  applyLinkedAction: (action: LinkedActionCommand) => void;
}

interface DeviceFrameProps {
  device: Device;
  url: string;
  proxyUrl?: string | null;
  isLandscape?: boolean;
  scale?: number;
  onLoad?: () => void;
  onError?: () => void;
  reloadTrigger?: number;
  inspectEnabled?: boolean;
  onInspectSelection?: (selection: InspectSelectionPayload) => void;
  linkedActionsEnabled?: boolean;
  onLinkedAction?: (action: LinkedActionCommand) => void;
  registerLinkedController?: (
    deviceId: string,
    controller: DeviceFrameLinkedController
  ) => void | (() => void);
}

export default function DeviceFrame({
  device,
  url,
  proxyUrl,
  isLandscape = false,
  scale = 1,
  onLoad,
  onError,
  reloadTrigger = 0,
  inspectEnabled = false,
  onInspectSelection,
  linkedActionsEnabled = false,
  onLinkedAction,
  registerLinkedController,
}: DeviceFrameProps) {
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [dynamicIslandPinned, setDynamicIslandPinned] = useState(false);
  const [dynamicIslandHovered, setDynamicIslandHovered] = useState(false);
  const [statusTime, setStatusTime] = useState(() => formatStatusTime(new Date()));
  const [batteryLevel, setBatteryLevel] = useState(1);
  const [batteryCharging, setBatteryCharging] = useState(false);

  const hasUrl = !!url;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const prevUrlRef = useRef(url);
  const prevProxyUrlRef = useRef(proxyUrl);
  const prevReloadTriggerRef = useRef(reloadTrigger);
  const topFeature = device.frame?.topFeature ?? 'none';
  const dynamicIslandEnabled = device.type === 'mobile' && topFeature === 'dynamic-island';
  const dynamicIslandExpanded = dynamicIslandEnabled && (dynamicIslandPinned || dynamicIslandHovered);

  const postLinkedActionsState = useCallback((enabled: boolean) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: 'kaleidoscope-linked-actions',
        type: 'KALEIDOSCOPE_LINKED_SET_STATE',
        enabled,
      },
      '*'
    );
  }, []);

  const applyLinkedAction = useCallback((action: LinkedActionCommand) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: 'kaleidoscope-linked-actions',
        type: 'KALEIDOSCOPE_LINKED_APPLY',
        payload: action,
      },
      '*'
    );
  }, []);

  const activeHostLabel = useMemo(() => {
    const candidateUrl = proxyUrl || url;
    if (!candidateUrl) {
      return 'Live Preview';
    }

    try {
      return new URL(candidateUrl).hostname.replace(/^www\./, '');
    } catch {
      return 'Live Preview';
    }
  }, [proxyUrl, url]);

  const postInspectState = (enabled: boolean) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: 'kaleidoscope-inspect',
        type: 'KALEIDOSCOPE_INSPECT_SET_STATE',
        enabled,
      },
      '*'
    );
  };

  const focusIframe = useCallback(() => {
    iframeRef.current?.focus();

    try {
      iframeRef.current?.contentWindow?.focus();
    } catch {
      // Cross-origin frames can reject direct focus access in some browsers.
    }
  }, []);

  useEffect(() => {
    if (url === prevUrlRef.current) return;

    prevUrlRef.current = url;
    if (url) {
      setLoading(true);
      setError(false);
      return;
    }

    setLoading(false);
    setError(false);
  }, [url]);

  useEffect(() => {
    setDynamicIslandPinned(false);
    setDynamicIslandHovered(false);
  }, [device.id, topFeature]);

  useEffect(() => {
    const updateTime = () => {
      setStatusTime(formatStatusTime(new Date()));
    };

    updateTime();
    const intervalId = window.setInterval(updateTime, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const navigatorWithBattery = navigator as NavigatorWithBattery;
    if (typeof navigatorWithBattery.getBattery !== 'function') {
      return;
    }

    let cancelled = false;
    let manager: BatteryStateManager | null = null;

    const syncBatteryState = () => {
      if (!manager || cancelled) {
        return;
      }

      setBatteryLevel(manager.level);
      setBatteryCharging(manager.charging);
    };

    const onBatteryChange = () => {
      syncBatteryState();
    };

    navigatorWithBattery
      .getBattery()
      .then((batteryManager) => {
        if (cancelled) {
          return;
        }

        manager = batteryManager;
        syncBatteryState();
        manager.addEventListener('levelchange', onBatteryChange);
        manager.addEventListener('chargingchange', onBatteryChange);
      })
      .catch(() => {
        // Some browsers disable this API; fallback state remains at default.
      });

    return () => {
      cancelled = true;
      if (!manager) {
        return;
      }

      manager.removeEventListener('levelchange', onBatteryChange);
      manager.removeEventListener('chargingchange', onBatteryChange);
    };
  }, []);

  useEffect(() => {
    if (proxyUrl === prevProxyUrlRef.current) return;

    prevProxyUrlRef.current = proxyUrl;
    if (proxyUrl && hasUrl) {
      setIframeKey(k => k + 1);
      setLoading(true);
    }
  }, [proxyUrl, hasUrl]);

  useEffect(() => {
    if (reloadTrigger === prevReloadTriggerRef.current) return;

    prevReloadTriggerRef.current = reloadTrigger;
    if (reloadTrigger > 0 && hasUrl) {
      setIframeKey(k => k + 1);
      setLoading(true);
    }
  }, [reloadTrigger, hasUrl]);

  useEffect(() => {
    if (!registerLinkedController) {
      return;
    }

    return registerLinkedController(device.id, {
      setLinkedActionsEnabled: postLinkedActionsState,
      applyLinkedAction,
    });
  }, [applyLinkedAction, device.id, postLinkedActionsState, registerLinkedController]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const data = event.data as {
        source?: string;
        type?: string;
        payload?: InspectSelectionPayload;
        enabled?: boolean;
      };

      if (!data) {
        return;
      }

      if (data.source === 'kaleidoscope-linked-actions') {
        if (data.type === 'KALEIDOSCOPE_LINKED_READY') {
          postLinkedActionsState(linkedActionsEnabled);
        }

        if (data.type === 'KALEIDOSCOPE_LINKED_EVENT' && data.payload) {
          onLinkedAction?.(data.payload as LinkedActionCommand);
        }
        return;
      }

      if (data.source !== 'kaleidoscope-inspect') {
        return;
      }

      if (data.type === 'KALEIDOSCOPE_INSPECT_READY' || data.type === 'KALEIDOSCOPE_INSPECT_STATUS') {
        if (inspectEnabled) {
          postInspectState(true);
        }
        return;
      }

      if (data.type === 'KALEIDOSCOPE_INSPECT_RESULT' && data.payload) {
        onInspectSelection?.(data.payload);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [inspectEnabled, linkedActionsEnabled, onInspectSelection, onLinkedAction, postLinkedActionsState]);

  useEffect(() => {
    if (!hasUrl || loading) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      postInspectState(inspectEnabled);
    }, 50);

    return () => window.clearTimeout(timeoutId);
  }, [hasUrl, inspectEnabled, loading, iframeKey]);

  useEffect(() => {
    if (!hasUrl || loading) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      postLinkedActionsState(linkedActionsEnabled);
    }, 50);

    return () => window.clearTimeout(timeoutId);
  }, [hasUrl, iframeKey, linkedActionsEnabled, loading, postLinkedActionsState]);

  const handleIframeLoad = () => {
    setLoading(false);
    setError(false);
    focusIframe();
    onLoad?.();
  };

  const handleIframeError = () => {
    setLoading(false);
    setError(true);
    onError?.();
  };

  const handleRetry = () => {
    setError(false);
    setLoading(true);
    setIframeKey(k => k + 1);
  };

  const handleDynamicIslandToggle = () => {
    if (!dynamicIslandEnabled) {
      return;
    }

    setDynamicIslandPinned((previous) => !previous);
  };

  const renderStatusBar = () => {
    if (device.type !== 'mobile') {
      return null;
    }

    const safeLevel = Math.max(0.05, Math.min(1, batteryLevel));
    const batteryFillWidth = `${Math.round(safeLevel * 100)}%`;

    return (
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-12 bg-transparent px-4 pt-2 text-white"
        data-testid="device-status-bar"
      >
        <div className="relative flex h-full items-start justify-between text-xs font-medium [text-shadow:0_1px_2px_rgba(0,0,0,0.65)]">
          <span data-testid="device-status-time" className="tracking-[0.02em]">
            {statusTime}
          </span>

          {topFeature === 'dynamic-island' && (
            <button
              type="button"
              className={`pointer-events-auto absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-black shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-all duration-300 ease-out ${dynamicIslandExpanded ? 'h-9 w-52' : 'h-7 w-28'}`}
              onMouseEnter={() => setDynamicIslandHovered(true)}
              onMouseLeave={() => setDynamicIslandHovered(false)}
              onClick={handleDynamicIslandToggle}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleDynamicIslandToggle();
                }
              }}
              data-testid="device-top-feature"
              data-feature-type="dynamic-island"
              data-expanded={dynamicIslandExpanded ? 'true' : 'false'}
              aria-label={dynamicIslandExpanded ? 'Collapse Dynamic Island' : 'Expand Dynamic Island'}
            >
              {dynamicIslandExpanded && (
                <span className="flex h-full items-center gap-2 px-3 text-[10px] font-medium text-white">
                  <span className="h-2 w-2 rounded-full bg-lime-400" />
                  <span className="truncate">{activeHostLabel}</span>
                  <span className="ml-auto text-[9px] uppercase tracking-[0.12em] text-white/70">Live</span>
                </span>
              )}
            </button>
          )}

          {topFeature === 'camera-hole' && (
            <div
              className="absolute left-1/2 top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-black shadow-[0_0_0_1.5px_rgba(255,255,255,0.65)]"
              data-testid="device-top-feature"
              data-feature-type="camera-hole"
              aria-hidden="true"
            />
          )}

          <div className="flex items-center gap-1.5" aria-hidden="true">
            <div className="flex items-end gap-0.5">
              <span className="w-0.5 rounded-sm bg-white/75" style={{ height: 3 }} />
              <span className="w-0.5 rounded-sm bg-white/75" style={{ height: 5 }} />
              <span className="w-0.5 rounded-sm bg-white/85" style={{ height: 7 }} />
              <span className="w-0.5 rounded-sm bg-white" style={{ height: 9 }} />
            </div>
            <div className="flex items-center">
              <div className="h-3 w-5.5 rounded-[3px] border border-white/90 p-px">
                <div className="h-full rounded-[2px] bg-white/95 transition-[width] duration-300" style={{ width: batteryFillWidth }} />
              </div>
              <div className="ml-px h-1.5 w-0.5 rounded-r-sm bg-white/90" />
              {batteryCharging && <span className="ml-1 text-[10px] leading-none">+</span>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const { deviceWidth, deviceHeight, frameWidth, frameHeight } = getDeviceFrameMetrics(device, isLandscape);
  const scaledFrameWidth = frameWidth * scale;
  const scaledFrameHeight = frameHeight * scale;
  const mobileShell = device.frame?.shell ?? 'generic';

  const getDeviceFrame = () => {
    if (device.type === 'mobile') {
      const isIphoneShell = mobileShell === 'iphone';

      return (
        <div 
          className={isIphoneShell ? "relative rounded-[3rem] bg-black shadow-2xl" : "relative rounded-[2.5rem] bg-zinc-900 shadow-2xl"}
          style={{
            width: frameWidth,
            height: frameHeight,
            padding: isIphoneShell ? 24 : 18
          }}
        >
          {/* Screen */}
          <div className={isIphoneShell ? "relative h-full overflow-hidden rounded-[2.5rem] bg-white" : "relative h-full overflow-hidden rounded-4xl bg-white"}>
            {renderContent()}
            {renderStatusBar()}
          </div>
          {/* Home indicator */}
          {isIphoneShell ? (
            <div 
              className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-white rounded-full"
              style={{ width: 128, height: 4 }}
            ></div>
          ) : (
            <div
              className="absolute bottom-3 left-1/2 h-1.5 w-24 -translate-x-1/2 rounded-full bg-zinc-700"
              aria-hidden="true"
            />
          )}
        </div>
      );
    } else if (device.type === 'tablet') {
      return (
        <div 
          className="relative bg-gray-800 rounded-3xl shadow-2xl"
          style={{
            width: frameWidth,
            height: frameHeight,
            padding: 30
          }}
        >
          <div className="relative bg-white rounded-2xl overflow-hidden h-full">
            {renderContent()}
          </div>
        </div>
      );
    } else {
      return (
        <div 
          className="relative bg-gray-900 rounded-lg shadow-2xl"
          style={{
            width: frameWidth,
            height: frameHeight,
            padding: 20
          }}
        >
          <div className="relative bg-white rounded-lg overflow-hidden h-full">
            {renderContent()}
          </div>
        </div>
      );
    }
  };

  const renderContent = () => {
    const contentHeight = '100%';
    
    return (
      <div className="relative h-full" style={{ height: contentHeight }}>
        {/* Loading State */}
        {loading && (
          <div className="absolute inset-0 bg-white flex items-center justify-center z-20 animate-fade-in-up">
            <div className="text-center">
              <Loader2 className="animate-spin h-8 w-8 text-primary mx-auto mb-4" />
              <p className="text-sm text-gray-600">Loading website...</p>
            </div>
          </div>
        )}

        {inspectEnabled && !loading && !error && (
          <div className="absolute left-2 top-2 z-20 rounded-full bg-cyan-500 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white shadow-sm animate-scale-in">
            Inspecting
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="absolute inset-0 bg-white flex items-center justify-center z-20 animate-fade-in-up">
            <div className="text-center px-8">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Unable to load website
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                The website may be down, doesn't allow embedding in frames (X-Frame-Options),
                or you may need to enable tunneling for localhost URLs.
              </p>
              <Button onClick={handleRetry} data-testid="button-retry" className="transition-transform duration-150 hover:scale-105 active:scale-95">
                Try Again
              </Button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!hasUrl && !loading && (
          <div className="h-full bg-gray-50 flex items-center justify-center animate-fade-in-up">
            <div className="text-center px-8">
              <Globe className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                Enter a URL to preview
              </h3>
              <p className="text-sm text-gray-500">
                Type any website URL in the sidebar to see how it looks on this device.
              </p>
            </div>
          </div>
        )}

        {/* Iframe - use proxy URL when available for auth-protected sites */}
        {hasUrl && (
          <iframe
            key={iframeKey}
            ref={iframeRef}
            data-device-frame
            src={proxyUrl || url}
            className="w-full h-full border-0 bg-white transition-opacity duration-300"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            scrolling="yes"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            onMouseEnter={focusIframe}
            onPointerDown={focusIframe}
            style={{ display: loading ? 'none' : 'block', opacity: loading ? 0 : 1 }}
            data-testid="preview-iframe"
            tabIndex={0}
            title={`${device.name} - ${url}`}
            aria-label={`Preview of ${url} on ${device.name}${proxyUrl ? ' (via proxy)' : ''}`}
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex w-full justify-center animate-fade-in-up">
      <div className="flex flex-col items-center" style={{ width: scaledFrameWidth }}>
        <div className="flex items-start justify-center" style={{ width: scaledFrameWidth, height: scaledFrameHeight }}>
          <div
            style={{
              width: frameWidth,
              height: frameHeight,
              transform: `scale(${scale})`,
              transformOrigin: 'top center',
            }}
          >
            {getDeviceFrame()}
          </div>
        </div>

        <div className="mt-4">
          <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 transition-all duration-200">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{device.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {deviceWidth} × {deviceHeight}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
