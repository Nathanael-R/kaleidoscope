import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Device } from "@/lib/devices";
import type { InspectSelectionPayload } from "@/lib/inspect";

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
}: DeviceFrameProps) {
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const hasUrl = !!url;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const prevUrlRef = useRef(url);
  const prevProxyUrlRef = useRef(proxyUrl);
  const prevReloadTriggerRef = useRef(reloadTrigger);

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
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const data = event.data as {
        source?: string;
        type?: string;
        payload?: InspectSelectionPayload;
      };

      if (!data || data.source !== 'kaleidoscope-inspect') {
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
  }, [inspectEnabled, onInspectSelection]);

  useEffect(() => {
    if (!hasUrl || loading) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      postInspectState(inspectEnabled);
    }, 50);

    return () => window.clearTimeout(timeoutId);
  }, [hasUrl, inspectEnabled, loading, iframeKey]);

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

  const { deviceWidth, deviceHeight, frameWidth, frameHeight } = getDeviceFrameMetrics(device, isLandscape);
  const scaledFrameWidth = frameWidth * scale;
  const scaledFrameHeight = frameHeight * scale;

  const getDeviceFrame = () => {
    if (device.type === 'mobile') {
      return (
        <div 
          className="relative bg-black rounded-[3rem] shadow-2xl"
          style={{
            width: frameWidth,
            height: frameHeight,
            padding: 24
          }}
        >
          {/* Screen */}
          <div className="relative bg-white rounded-[2.5rem] overflow-hidden h-full">
            {/* Status Bar for mobile */}
            <div className="bg-white h-11 flex items-center justify-between px-6 text-black text-sm font-medium relative z-10">
              <span>9:41</span>
              <div className="flex items-center space-x-1">
                <div className="w-4 h-2 border border-black rounded-sm">
                  <div className="w-3 h-1 bg-green-500 rounded-sm mt-0.5 ml-0.5"></div>
                </div>
              </div>
            </div>
            {renderContent()}
          </div>
          {/* Home indicator */}
          <div 
            className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-white rounded-full"
            style={{ width: 128, height: 4 }}
          ></div>
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
    const contentHeight = device.type === 'mobile' ? 'calc(100% - 44px)' : '100%';
    
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
