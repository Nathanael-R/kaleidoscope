import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRecentUrls } from "@/hooks/use-recent-urls";
import { devices, getDevicesByCategory, type Device } from "@/lib/devices";
import {
  detectPreviewTargetMode,
  normalizePreviewUrl,
  type PreviewTargetMode,
} from "@/lib/url-input";
import { cn } from "@/lib/utils";
import {
  ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight,
  Columns, Pin, X, Globe, Clock, Activity,
} from "lucide-react";
import { useEffect, useState } from "react";
import TunnelButton from "@/components/tunnel-button";
import LiveReloadToggle from "@/components/live-reload-toggle";
import AuthWizard, { type AuthCookie, type ProxySession } from "@/components/auth-wizard";
import ScreenshotPanel from "@/components/screenshot-panel";
import PerformancePanel from "@/components/performance-panel";
import InspectPanel from "@/components/inspect-panel";
import type { InspectResult } from "@/lib/inspect";

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
  inspectEnabled: boolean;
  inspectPending: boolean;
  inspectResolving: boolean;
  inspectResult: InspectResult | null;
  inspectError: string | null;
  inspectSourceDir: string;
  onInspectSourceDirChange: (value: string) => void;
  onToggleInspect: () => void;
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
    <div className="border-b border-gray-100 dark:border-gray-700">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-150 active:bg-gray-100 dark:active:bg-gray-600"
      >
        <Icon className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-colors duration-150" />
        <span className="text-xs font-medium text-gray-600 dark:text-gray-300 flex-1">{title}</span>
        {badge !== undefined && (
          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full transition-colors duration-150">{badge}</span>
        )}
        <ChevronDown className={cn("w-3 h-3 text-gray-400 dark:text-gray-500 transition-transform duration-200 ease-in-out", open && "rotate-180")} />
      </button>
      <div className="accordion-content" data-open={open ? "true" : "false"}>
        <div className="px-4 pb-3">{children}</div>
      </div>
    </div>
  );
}

export default function Sidebar({
  selectedDevice,
  onDeviceSelect,
  currentUrl,
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
  proxyUrl,
  inspectEnabled,
  inspectPending,
  inspectResolving,
  inspectResult,
  inspectError,
  inspectSourceDir,
  onInspectSourceDirChange,
  onToggleInspect,
}: SidebarProps) {
  const [urlInput, setUrlInput] = useState("");
  const [urlMode, setUrlMode] = useState<PreviewTargetMode>('production');
  const [urlError, setUrlError] = useState<string | null>(null);
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

  const { normalizedUrl, error: normalizedUrlError } = normalizePreviewUrl(urlInput, urlMode);
  const previewUrl = normalizedUrlError ? null : normalizedUrl;
  const currentPort = previewUrl ? getPortFromUrl(previewUrl) : 3000;

  useEffect(() => {
    if (!currentUrl) {
      return;
    }

    setUrlMode(detectPreviewTargetMode(currentUrl));
  }, [currentUrl]);

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) return;

    const result = normalizePreviewUrl(urlInput, urlMode);
    if (!result.normalizedUrl) {
      setUrlError(result.error);
      return;
    }

    setUrlError(null);
    addRecentUrl(result.normalizedUrl);
    onLoadUrl(result.normalizedUrl);
    onUrlChange(result.normalizedUrl);
  };

  const handleRecentUrlClick = (url: string) => {
    setUrlMode(detectPreviewTargetMode(url));
    setUrlError(null);
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
      <aside className="w-14 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col animate-fade-in-up" role="complementary" aria-label="Device controls">
        <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className="w-8 h-8 p-0 transition-transform duration-150 hover:scale-110 active:scale-95"
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
                "w-9 h-9 p-0 rounded-lg border transition-all duration-150 shrink-0 hover:scale-105 active:scale-95",
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
    <div className="md:hidden fixed inset-0 top-16 bg-black/30 z-30 animate-fade-in-up" onClick={onToggleCollapse} />
    <aside className="w-full md:w-80 fixed md:relative z-40 md:z-auto inset-0 md:inset-auto top-16 md:top-auto bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col animate-slide-in-right" role="complementary" aria-label="Device controls">

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Preview</h2>
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === 'comparison' ? 'default' : 'ghost'}
            size="sm"
            onClick={onViewModeToggle}
            className="h-7 px-2 text-xs transition-all duration-150 active:scale-95"
            data-testid="button-toggle-comparison"
          >
            <Columns className="w-3 h-3 mr-1" />
            Compare{pinnedDevices.length > 0 && ` (${pinnedDevices.length})`}
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggleCollapse} className="w-7 h-7 p-0 transition-transform duration-150 hover:scale-110 active:scale-90" data-testid="button-collapse-sidebar">
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* URL Input — always visible, compact */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="mb-2 inline-flex rounded-lg bg-gray-100 p-1 dark:bg-gray-900" data-testid="url-mode-tabs">
          <button
            type="button"
            onClick={() => setUrlMode('production')}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150",
              urlMode === 'production'
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            )}
            data-testid="url-mode-production"
          >
            Website
          </button>
          <button
            type="button"
            onClick={() => setUrlMode('local')}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150",
              urlMode === 'local'
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            )}
            data-testid="url-mode-local"
          >
            Local Dev
          </button>
        </div>
        <div className="relative">
          <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-colors duration-150" />
          <Input
            type="url"
            placeholder={urlMode === 'local' ? "localhost:3000 or just 3000" : "example.com or https://example.com"}
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              setUrlError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
            className="h-9 pl-8 pr-9 text-sm transition-shadow duration-150 focus:shadow-sm"
            data-testid="input-url"
            aria-label="Website URL to preview across devices"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={handleUrlSubmit}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 text-primary hover:text-primary/80 transition-transform duration-150 hover:scale-110 active:scale-90"
            data-testid="button-load-url"
          >
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="mt-2 space-y-1">
          <p className="text-[11px] text-gray-500 dark:text-gray-400" data-testid="url-mode-hint">
            {urlMode === 'local'
              ? 'Local Dev defaults bare entries to http:// and accepts port-only shortcuts like 3000.'
              : 'Website mode defaults bare domains to https://. Kaleidoscope does not auto-add www.'}
          </p>
          {previewUrl && previewUrl !== urlInput.trim() && (
            <p className="text-[11px] text-cyan-700 dark:text-cyan-300" data-testid="normalized-url-preview">
              Will open {previewUrl}
            </p>
          )}
          {urlError && (
            <p className="text-[11px] text-red-600 dark:text-red-300" data-testid="url-error-message">
              {urlError}
            </p>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">

        {/* Recent URLs — only shown when there are entries */}
        {!loadingRecent && recentUrls.length > 0 && (
          <Section title="Recent" icon={Clock} badge={recentUrls.length} defaultOpen>
            <div className="space-y-0.5 stagger-children" data-testid="recent-urls-list">
              {recentUrls.map((recentUrl, index) => (
                <button
                  key={`${recentUrl.url}-${recentUrl.timestamp}`}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-150 group animate-fade-in-up active:scale-[0.98]"
                  onClick={() => handleRecentUrlClick(recentUrl.url)}
                  data-testid={`recent-url-${index}`}
                >
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{recentUrl.domain}</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{recentUrl.url}</div>
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
          <Section title="Inspect" icon={Activity} defaultOpen>
            <InspectPanel
              currentUrl={currentUrl}
              viewMode={viewMode}
              enabled={inspectEnabled}
              pending={inspectPending}
              resolving={inspectResolving}
              sourceDir={inspectSourceDir}
              onSourceDirChange={onInspectSourceDirChange}
              onToggle={onToggleInspect}
              result={inspectResult}
              error={inspectError}
            />
          </Section>
        )}

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

        {urlInput && (
          <Section title="Performance" icon={Activity}>
            <PerformancePanel currentUrl={urlInput} proxyUrl={proxyUrl} />
          </Section>
        )}

        {/* Pinned devices — only shown when there are pins */}
        {pinnedDevices.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
            <div className="flex flex-wrap gap-1">
              {pinnedDevices.map((device) => (
                <span
                  key={device.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 text-[10px] rounded-full border border-orange-200 animate-badge-pop"
                >
                  {getDeviceIcon(device.icon)} {device.name}
                  <button
                    onClick={() => onDevicePin(device)}
                    className="text-orange-400 hover:text-orange-600 transition-colors duration-150 hover:scale-125"
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
                <h4 className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5 px-1">
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
                            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md border transition-all duration-150 h-auto justify-start active:scale-[0.97]",
                            isSelected
                              ? "border-primary bg-primary/5 shadow-sm"
                              : isPinned
                                ? "border-orange-200 bg-orange-50/50"
                                : "border-transparent hover:border-gray-200 hover:bg-gray-50"
                          )}
                          onClick={() => onDeviceSelect(device)}
                          data-testid={`device-${device.id}`}
                          data-device-id={device.id}
                          data-selected={isSelected}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <span className="text-base leading-none transition-transform duration-150 group-hover:scale-110">{getDeviceIcon(device.icon)}</span>
                          <div className="flex-1 text-left min-w-0">
                            <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{device.name}</span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1.5">{device.width}x{device.height}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0 animate-scale-in" />}
                          {isPinned && !isSelected && <Pin className="w-3 h-3 text-orange-400 shrink-0" />}
                        </Button>

                        {/* Pin on hover */}
                        {!isPinned && (
                          <button
                            className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-150 p-1 rounded hover:bg-gray-100 hover:scale-110 active:scale-90"
                            onClick={(e) => { e.stopPropagation(); onDevicePin(device); }}
                            data-testid={`pin-${device.id}`}
                            aria-label={`Pin ${device.name}`}
                          >
                            <Pin className="w-3 h-3 text-gray-300" />
                          </button>
                        )}
                        {isPinned && (
                          <button
                            className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 group-hover:opacity-100 transition-all duration-150 p-1 rounded hover:bg-orange-100 hover:scale-110 active:scale-90"
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
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
            ← → switch device &middot; Space pin &middot; C compare
          </p>
        </div>
      </div>
    </aside>
    </>
  );
}
