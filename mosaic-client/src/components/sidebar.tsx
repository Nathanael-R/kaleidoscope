import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRecentUrls } from "@/hooks/use-recent-urls";
import { devices, getDevicesByCategory, type Device } from "@/lib/devices";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Columns, Pin, X } from "lucide-react";
import { useState } from "react";
import TunnelButton from "@/components/tunnel-button";
import LiveReloadToggle from "@/components/live-reload-toggle";
import AuthWizard, { type AuthCookie, type ProxySession } from "@/components/auth-wizard";
import ScreenshotPanel from "@/components/screenshot-panel";

interface SidebarProps {
  selectedDevice: Device;
  onDeviceSelect: (device: Device) => void;
  currentUrl: string;
  onUrlChange: (url: string) => void;
  onLoadUrl: (url: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  pinnedDevices: Device[];
  onDevicePin: (device: Device) => void;
  viewMode: 'single' | 'comparison';
  onViewModeToggle: () => void;
  onReload?: () => void;
  onAuthCapture?: (cookies: AuthCookie[]) => void;
  onProxyUrl?: (proxyUrl: string | null, session: ProxySession | null) => void;
  proxyUrl?: string | null;
}

export default function Sidebar({
  selectedDevice,
  onDeviceSelect,
  onUrlChange,
  onLoadUrl,
  isCollapsed,
  onToggleCollapse,
  pinnedDevices,
  onDevicePin,
  viewMode,
  onViewModeToggle,
  onReload,
  onAuthCapture,
  onProxyUrl,
  proxyUrl
}: SidebarProps) {
  const [urlInput, setUrlInput] = useState("");
  const { data: recentUrls = [], isLoading: loadingRecent, addRecentUrl } = useRecentUrls();

  const devicesByCategory = getDevicesByCategory();

  // Extract port from URL for tunnel
  const getPortFromUrl = (url: string): number => {
    try {
      const urlObj = new URL(url);
      const port = urlObj.port;
      if (port) return parseInt(port, 10);

      // Default ports
      if (urlObj.protocol === 'https:') return 443;
      if (urlObj.protocol === 'http:') return 80;

      return 3000; // Default dev server port
    } catch {
      return 3000;
    }
  };

  const currentPort = urlInput ? getPortFromUrl(urlInput) : 3000;

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) return;
    
    let finalUrl = urlInput.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    
    try {
    //   const url = new URL(finalUrl);
    //   const domain = url.hostname;
      
      // Add to recent URLs
      addRecentUrl(finalUrl);
      
      onLoadUrl(finalUrl);
      onUrlChange(finalUrl);
    } catch (error) {
      console.error('Invalid URL:', error);
    }
  };

  const handleRecentUrlClick = (url: string) => {
    setUrlInput(url);
    onLoadUrl(url);
    onUrlChange(url);
  };

  const getDeviceIcon = (iconName: string) => {
    const iconMap: Record<string, string> = {
      'mobile-alt': '📱',
      'tablet-alt': '📟',
      'laptop': '💻',
      'desktop': '🖥️'
    };
    return iconMap[iconName] || '📱';
  };

  if (isCollapsed) {
    return (
      <aside className="w-16 bg-white border-r border-gray-200 flex flex-col" role="complementary" aria-label="Device controls">
        {/* Collapsed Header */}
        <div className="p-4 border-b border-gray-200 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className="w-8 h-8 p-0"
            data-testid="button-expand-sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Collapsed Device List */}
        <div className="flex-1 p-4 space-y-3 overflow-y-auto">
          <div className="text-xs font-medium text-gray-500 text-center mb-4">Devices</div>
          {devices.map((device) => (
            <Button
              key={device.id}
              variant="ghost"
              className={cn(
                "w-8 h-8 p-0 rounded-lg border-2 transition-all",
                selectedDevice.id === device.id
                  ? "border-primary bg-primary/5"
                  : "border-gray-200 hover:border-gray-300"
              )}
              onClick={() => onDeviceSelect(device)}
              data-testid={`device-${device.id}-collapsed`}
              title={device.name}
            >
              <span className="text-sm">{getDeviceIcon(device.icon)}</span>
            </Button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <>
    {/* Mobile backdrop overlay */}
    <div className="md:hidden fixed inset-0 top-16 bg-black/30 z-30" onClick={onToggleCollapse} />
    <aside className="w-full md:w-80 fixed md:relative z-40 md:z-auto inset-0 md:inset-auto top-16 md:top-auto bg-white border-r border-gray-200 flex flex-col" role="complementary" aria-label="Device controls">
      {/* Header with collapse button */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Device Preview</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className="w-8 h-8 p-0"
            data-testid="button-collapse-sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
        
        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'comparison' ? 'default' : 'outline'}
            size="sm"
            onClick={onViewModeToggle}
            className="flex items-center text-xs"
            data-testid="button-toggle-comparison"
          >
            <Columns className="w-3 h-3 mr-1" />
            Compare ({pinnedDevices.length})
          </Button>
          <div className="text-xs text-gray-500">
            Use ←→ arrows, Space to pin, C for compare
          </div>
        </div>
      </div>

      {/* URL Input Section */}
      <div className="p-6 border-b border-gray-200">
        <Label className="block text-sm font-medium text-gray-700 mb-3">
          Website URL
        </Label>
        <div className="relative">
          <Input
            type="url"
            placeholder="https://example.com"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
            className="pr-12"
            data-testid="input-url"
            aria-label="Website URL to preview across devices"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={handleUrlSubmit}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 text-primary hover:text-primary/80"
            data-testid="button-load-url"
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Enter any website URL to preview across devices
        </p>
      </div>

      {/* Tunnel Section */}
      <div className="p-6 border-b border-gray-200">
        <Label className="block text-sm font-medium text-gray-700 mb-3">
          Share Localhost
        </Label>
        <TunnelButton port={currentPort} />
      </div>

      {/* Live Reload Section */}
      <div className="p-6 border-b border-gray-200">
        <Label className="block text-sm font-medium text-gray-700 mb-3">
          Auto Refresh
        </Label>
        <LiveReloadToggle onReload={onReload} />
      </div>

      {/* Auth Section */}
      {urlInput && (
        <div className="p-6 border-b border-gray-200">
          <Label className="block text-sm font-medium text-gray-700 mb-3">
            Authentication
          </Label>
          <AuthWizard
            onAuthCapture={onAuthCapture || (() => {})}
            onProxyUrl={onProxyUrl}
            currentUrl={urlInput}
          />
        </div>
      )}

      {/* Screenshot Section */}
      {urlInput && (
        <div className="p-6 border-b border-gray-200">
          <Label className="block text-sm font-medium text-gray-700 mb-3">
            Screenshots
          </Label>
          <ScreenshotPanel currentUrl={urlInput} proxyUrl={proxyUrl} />
        </div>
      )}

      {/* Recent URLs */}
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Recent URLs</h3>
        {loadingRecent ? (
          <div className="text-sm text-gray-500">Loading recent URLs...</div>
        ) : recentUrls.length > 0 ? (
          <div className="space-y-2" data-testid="recent-urls-list">
            {recentUrls.map((recentUrl, index) => (
              <Button
                key={`${recentUrl.url}-${recentUrl.timestamp}`}
                variant="ghost"
                className="w-full text-left p-3 h-auto hover:bg-gray-50 justify-start"
                onClick={() => handleRecentUrlClick(recentUrl.url)}
                data-testid={`recent-url-${index}`}
              >
                <div className="truncate">
                  <div className="text-sm text-gray-900 truncate">
                    {recentUrl.domain}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {recentUrl.url}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">No recent URLs</div>
        )}
      </div>

      {/* Comparison Mode Controls */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700">Comparison Mode</h3>
          <Button
            variant={viewMode === 'comparison' ? "default" : "outline"}
            size="sm"
            onClick={onViewModeToggle}
            className="h-8 px-3"
            data-testid="toggle-comparison-mode"
          >
            <Columns className="w-3 h-3 mr-1" />
            {viewMode === 'comparison' ? 'On' : 'Off'}
          </Button>
        </div>
        
        {pinnedDevices.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-gray-500 mb-2">
              {pinnedDevices.length} pinned device{pinnedDevices.length !== 1 ? 's' : ''}:
            </div>
            <div className="flex flex-wrap gap-1">
              {pinnedDevices.map((device) => (
                <span
                  key={device.id}
                  className="inline-flex items-center px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-md"
                >
                  <span className="mr-1">{getDeviceIcon(device.icon)}</span>
                  {device.name}
                  <button
                    onClick={() => onDevicePin(device)}
                    className="ml-1 text-orange-600 hover:text-orange-800"
                    data-testid={`quick-unpin-${device.id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        
        <div className="mt-3 text-xs text-gray-500">
          <div className="flex items-center gap-2 mb-1">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Space</kbd>
            <span>Pin current device</span>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">C</kbd>
            <span>Toggle comparison mode</span>
          </div>
        </div>
      </div>

      {/* Device Selection */}
      <div className="flex-1 p-6 overflow-y-auto">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Select Device</h3>
        <div className="space-y-6" role="listbox" aria-label="Device list">
          {Object.entries(devicesByCategory).map(([category, categoryDevices]) => (
            <div key={category}>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                {category}
              </h4>
              <div className="space-y-2">
                {categoryDevices.map((device) => (
                  <div key={device.id} className="relative group">
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full flex items-center p-3 rounded-lg border-2 transition-all h-auto justify-start pr-12",
                        selectedDevice.id === device.id
                          ? "border-primary bg-primary/5"
                          : pinnedDevices.find(d => d.id === device.id)
                            ? "border-orange-300 bg-orange-50"
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      )}
                      onClick={() => onDeviceSelect(device)}
                      data-testid={`device-${device.id}`}
                      role="option"
                      aria-selected={selectedDevice.id === device.id}
                    >
                      <span className="mr-3 text-lg">
                        {getDeviceIcon(device.icon)}
                      </span>
                      <div className="flex-1 text-left">
                        <div className="font-medium text-gray-900">
                          {device.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {device.width} × {device.height}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {selectedDevice.id === device.id && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                      </div>
                    </Button>
                    
                    {/* Pin Button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-1 right-1 w-6 h-6 p-0 opacity-60 group-hover:opacity-100 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDevicePin(device);
                      }}
                      data-testid={`pin-${device.id}`}
                      aria-label={`${pinnedDevices.find(d => d.id === device.id) ? 'Unpin' : 'Pin'} ${device.name}`}
                    >
                      {pinnedDevices.find(d => d.id === device.id) ? (
                        <Pin className="w-3 h-3 text-orange-500" />
                      ) : (
                        <Pin className="w-3 h-3 text-gray-400" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
    </>
  );
}
