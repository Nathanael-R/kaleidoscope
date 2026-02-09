import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRecentUrls } from "@/hooks/use-recent-urls";
import { devices, getDevicesByCategory, type Device } from "@/lib/devices";
import { cn } from "@/lib/utils";
import {
  ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight,
  Columns, Pin, X, Globe, Clock,
} from "lucide-react";
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

/** Collapsible section wrapper */
function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-medium text-gray-600 flex-1">{title}</span>
        {badge !== undefined && (
          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{badge}</span>
        )}
        <ChevronDown className={cn("w-3 h-3 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
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

  const getPortFromUrl = (url: string): number => {
    try {
      const urlObj = new URL(url);
      if (urlObj.port) return parseInt(urlObj.port, 10);
      if (urlObj.protocol === 'https:') return 443;
      if (urlObj.protocol === 'http:') return 80;
      return 3000;
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
      new URL(finalUrl); // validate URL format

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
      <aside className="w-14 bg-white border-r border-gray-200 flex flex-col" role="complementary" aria-label="Device controls">
        <div className="p-3 border-b border-gray-100 flex justify-center">
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
        <div className="flex-1 py-2 flex flex-col items-center gap-1 overflow-y-auto">
          {devices.map((device) => (
            <Button
              key={device.id}
              variant="ghost"
              className={cn(
                "w-9 h-9 p-0 rounded-lg border transition-all shrink-0",
                selectedDevice.id === device.id
                  ? "border-primary bg-primary/5"
                  : "border-transparent hover:border-gray-200"
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
    {/* Mobile backdrop */}
    <div className="md:hidden fixed inset-0 top-16 bg-black/30 z-30" onClick={onToggleCollapse} />
    <aside className="w-full md:w-80 fixed md:relative z-40 md:z-auto inset-0 md:inset-auto top-16 md:top-auto bg-white border-r border-gray-200 flex flex-col" role="complementary" aria-label="Device controls">

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Preview</h2>
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === 'comparison' ? 'default' : 'ghost'}
            size="sm"
            onClick={onViewModeToggle}
            className="h-7 px-2 text-xs"
            data-testid="button-toggle-comparison"
          >
            <Columns className="w-3 h-3 mr-1" />
            Compare{pinnedDevices.length > 0 && ` (${pinnedDevices.length})`}
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggleCollapse} className="w-7 h-7 p-0" data-testid="button-collapse-sidebar">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* URL Input — always visible, compact */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="relative">
          <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input
            type="url"
            placeholder="Enter URL to preview..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
            className="h-9 pl-8 pr-9 text-sm"
            data-testid="input-url"
            aria-label="Website URL to preview across devices"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={handleUrlSubmit}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-primary hover:text-primary/80"
            data-testid="button-load-url"
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">

        {/* Recent URLs — only shown when there are entries */}
        {!loadingRecent && recentUrls.length > 0 && (
          <Section title="Recent" icon={Clock} badge={recentUrls.length} defaultOpen>
            <div className="space-y-0.5" data-testid="recent-urls-list">
              {recentUrls.map((recentUrl, index) => (
                <button
                  key={`${recentUrl.url}-${recentUrl.timestamp}`}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 transition-colors group"
                  onClick={() => handleRecentUrlClick(recentUrl.url)}
                  data-testid={`recent-url-${index}`}
                >
                  <div className="text-xs font-medium text-gray-700 truncate">{recentUrl.domain}</div>
                  <div className="text-[10px] text-gray-400 truncate">{recentUrl.url}</div>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Tools sections — collapsible */}
        <Section title="Share Localhost" icon={Globe}>
          <TunnelButton port={currentPort} />
        </Section>

        <Section title="Live Reload" icon={Globe}>
          <LiveReloadToggle onReload={onReload} />
        </Section>

        {urlInput && (
          <Section title="Authentication" icon={Globe} defaultOpen>
            <AuthWizard
              onAuthCapture={onAuthCapture || (() => {})}
              onProxyUrl={onProxyUrl}
              currentUrl={urlInput}
            />
          </Section>
        )}

        {urlInput && (
          <Section title="Screenshots" icon={Globe} defaultOpen>
            <ScreenshotPanel currentUrl={urlInput} proxyUrl={proxyUrl} />
          </Section>
        )}

        {/* Pinned devices — only shown when there are pins */}
        {pinnedDevices.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-100">
            <div className="flex flex-wrap gap-1">
              {pinnedDevices.map((device) => (
                <span
                  key={device.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 text-[10px] rounded-full border border-orange-200"
                >
                  {getDeviceIcon(device.icon)} {device.name}
                  <button
                    onClick={() => onDevicePin(device)}
                    className="text-orange-400 hover:text-orange-600"
                    data-testid={`quick-unpin-${device.id}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Comparison mode toggle — hidden, accessed via header button. Keep for test compatibility. */}
        <div className="hidden" data-testid="toggle-comparison-mode">
          {viewMode === 'comparison' ? 'On' : 'Off'}
        </div>

        {/* Device list — compact cards */}
        <div className="px-3 py-2">
          <div className="space-y-3" role="listbox" aria-label="Device list">
            {Object.entries(devicesByCategory).map(([category, categoryDevices]) => (
              <div key={category}>
                <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1">
                  {category}
                </h4>
                <div className="space-y-0.5">
                  {categoryDevices.map((device) => {
                    const isSelected = selectedDevice.id === device.id;
                    const isPinned = pinnedDevices.some(d => d.id === device.id);

                    return (
                      <div key={device.id} className="relative group">
                        <Button
                          variant="ghost"
                          className={cn(
                            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md border transition-all h-auto justify-start",
                            isSelected
                              ? "border-primary bg-primary/5 shadow-sm"
                              : isPinned
                                ? "border-orange-200 bg-orange-50/50"
                                : "border-transparent hover:border-gray-200 hover:bg-gray-50"
                          )}
                          onClick={() => onDeviceSelect(device)}
                          data-testid={`device-${device.id}`}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <span className="text-base leading-none">{getDeviceIcon(device.icon)}</span>
                          <div className="flex-1 text-left min-w-0">
                            <span className="text-xs font-medium text-gray-800">{device.name}</span>
                            <span className="text-[10px] text-gray-400 ml-1.5">{device.width}x{device.height}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                          {isPinned && !isSelected && <Pin className="w-3 h-3 text-orange-400 shrink-0" />}
                        </Button>

                        {/* Pin on hover */}
                        {!isPinned && (
                          <button
                            className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100"
                            onClick={(e) => { e.stopPropagation(); onDevicePin(device); }}
                            data-testid={`pin-${device.id}`}
                            aria-label={`Pin ${device.name}`}
                          >
                            <Pin className="w-3 h-3 text-gray-300" />
                          </button>
                        )}
                        {isPinned && (
                          <button
                            className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-orange-100"
                            onClick={(e) => { e.stopPropagation(); onDevicePin(device); }}
                            data-testid={`pin-${device.id}`}
                            aria-label={`Unpin ${device.name}`}
                          >
                            <Pin className="w-3 h-3 text-orange-500" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Keyboard hints — minimal footer */}
        <div className="px-4 py-2 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 text-center">
            ← → switch device &middot; Space pin &middot; C compare
          </p>
        </div>
      </div>
    </aside>
    </>
  );
}
