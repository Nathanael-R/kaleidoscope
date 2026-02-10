import { useState, useRef } from "react";
import { Loader2, AlertTriangle, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Device } from "@/lib/devices";
interface DeviceFrameProps {
  device: Device;
  url: string;
  proxyUrl?: string | null;
  isLandscape?: boolean;
  scale?: number;
  onLoad?: () => void;
  onError?: () => void;
  reloadTrigger?: number;
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
}: DeviceFrameProps) {
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  const hasUrl = !!url;

  // Adjust state during render when props change (avoids extra re-render vs useEffect)
  const prevUrlRef = useRef(url);
  const prevProxyUrlRef = useRef(proxyUrl);
  const prevReloadTriggerRef = useRef(reloadTrigger);

  if (url !== prevUrlRef.current) {
    prevUrlRef.current = url;
    if (url) {
      setLoading(true);
      setError(false);
    } else {
      setLoading(false);
      setError(false);
    }
  }

  if (proxyUrl !== prevProxyUrlRef.current) {
    prevProxyUrlRef.current = proxyUrl;
    if (proxyUrl && hasUrl) {
      setIframeKey(k => k + 1);
      setLoading(true);
    }
  }

  if (reloadTrigger !== prevReloadTriggerRef.current) {
    prevReloadTriggerRef.current = reloadTrigger;
    if (reloadTrigger > 0 && hasUrl) {
      setIframeKey(k => k + 1);
      setLoading(true);
    }
  }

  const handleIframeLoad = () => {
    setLoading(false);
    setError(false);
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

  const deviceWidth = isLandscape ? device.height : device.width;
  const deviceHeight = isLandscape ? device.width : device.height;
  
  // Calculate frame dimensions (add padding for device chrome)
  const frameWidth = deviceWidth + (device.type === 'mobile' ? 48 : device.type === 'tablet' ? 60 : 80);
  const frameHeight = deviceHeight + (device.type === 'mobile' ? 96 : device.type === 'tablet' ? 80 : 60);

  const getDeviceFrame = () => {
    if (device.type === 'mobile') {
      return (
        <div 
          className="relative bg-black rounded-[3rem] shadow-2xl"
          style={{
            width: frameWidth * scale,
            height: frameHeight * scale,
            padding: 24 * scale
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
            style={{ width: 128 * scale, height: 4 * scale }}
          ></div>
        </div>
      );
    } else if (device.type === 'tablet') {
      return (
        <div 
          className="relative bg-gray-800 rounded-3xl shadow-2xl"
          style={{
            width: frameWidth * scale,
            height: frameHeight * scale,
            padding: 30 * scale
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
            width: frameWidth * scale,
            height: frameHeight * scale,
            padding: 20 * scale
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
          <div className="absolute inset-0 bg-white flex items-center justify-center z-20">
            <div className="text-center">
              <Loader2 className="animate-spin h-8 w-8 text-primary mx-auto mb-4" />
              <p className="text-sm text-gray-600">Loading website...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="absolute inset-0 bg-white flex items-center justify-center z-20">
            <div className="text-center px-8">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Unable to load website
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                The website may be down, doesn't allow embedding in frames (X-Frame-Options),
                or you may need to enable tunneling for localhost URLs.
              </p>
              <Button onClick={handleRetry} data-testid="button-retry">
                Try Again
              </Button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!hasUrl && !loading && (
          <div className="h-full bg-gray-50 flex items-center justify-center">
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
            data-device-frame
            src={proxyUrl || url}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            style={{ display: loading ? 'none' : 'block' }}
            data-testid="preview-iframe"
            title={`${device.name} - ${url}`}
            aria-label={`Preview of ${url} on ${device.name}${proxyUrl ? ' (via proxy)' : ''}`}
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex justify-center">
      <div className="relative">
        {getDeviceFrame()}
        
        {/* Device Label */}
        <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2">
          <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
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
