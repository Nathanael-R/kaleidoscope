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
import { lazy, Suspense, useEffect, useState } from "react";
import type { AuthCookie, ProxySession } from "@/components/auth-wizard";
import type { InspectResult } from "@/lib/inspect";

const TunnelButton = lazy(() => import("@/components/tunnel-button"));
const LiveReloadToggle = lazy(() => import("@/components/live-reload-toggle"));
const AuthWizard = lazy(() => import("@/components/auth-wizard"));
const ScreenshotPanel = lazy(() => import("@/components/screenshot-panel"));
const PerformancePanel = lazy(() => import("@/components/performance-panel"));
const InspectPanel = lazy(() => import("@/components/inspect-panel"));

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
  const [hasRenderedContent, setHasRenderedContent] = useState(defaultOpen);

  useEffect(() => {
    if (open) {
      setHasRenderedContent(true);
    }
  }, [open]);

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
        {hasRenderedContent ? <div className="px-4 pb-3">{children}</div> : null}
      </div>
    </div>
  );
}

function SectionLoadingFallback({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
      Loading {label}...
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
  const {
    data: recentUrls = [],
    isLoading: loadingRecent,
    addRecentUrl,
    refreshRecentUrls,
  } = useRecentUrls(urlMode);

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
  const [showCollapsedContent, setShowCollapsedContent] = useState(isCollapsed);
  const [showExpandedContent, setShowExpandedContent] = useState(!isCollapsed);

  useEffect(() => {
    if (!currentUrl) {
      return;
    }

    setUrlMode(detectPreviewTargetMode(currentUrl));
  }, [currentUrl]);

  useEffect(() => {
    refreshRecentUrls();
  }, [refreshRecentUrls, urlMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isCollapsed) {
        setShowExpandedContent(false);
      } else {
        setShowCollapsedContent(false);
      }
    }, 220);

    if (isCollapsed) {
      setShowCollapsedContent(true);
    } else {
      setShowExpandedContent(true);
    }

    return () => window.clearTimeout(timer);
  }, [isCollapsed]);

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

  const handleDeviceDragStart = (event: React.DragEvent<HTMLElement>, device: Device) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-kaleidoscope-device', device.id);
    event.dataTransfer.setData('text/plain', device.id);
  };

  return (
    <>
    {!isCollapsed && (
      <div
        className="md:hidden fixed inset-0 top-16 z-30 bg-black/30 animate-fade-in-up"
        onClick={onToggleCollapse}
      />
    )}
    <aside
      className={cn(
        "overflow-hidden border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800",
        "transition-[width,transform,box-shadow] duration-300 ease-out",
        isCollapsed
          ? "relative z-20 h-full w-14 shrink-0"
          : "fixed inset-x-0 bottom-0 top-16 z-40 shadow-xl md:relative md:inset-auto md:h-full md:w-80 md:shadow-none",
      )}
      role="complementary"
      aria-label="Device controls"
    >
      {showCollapsedContent && (
      <div
        className={cn(
          "absolute inset-0 flex flex-col transition-[opacity,transform] duration-200 ease-out",
          isCollapsed ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-4 opacity-0",
        )}
        aria-hidden={!isCollapsed}
      >
        <div className="flex justify-center border-b border-gray-100 p-3 dark:border-gray-700">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className="h-8 w-8 p-0 transition-transform duration-150 hover:scale-110 active:scale-95"
            data-testid="button-expand-sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-2">
          {devices.map((device) => (
            <Button
              key={device.id}
              variant="ghost"
              className={cn(
                "h-9 w-9 shrink-0 rounded-lg border p-0 transition-all duration-150 hover:scale-105 active:scale-95",
                selectedDevice.id === device.id
                  ? "border-primary bg-primary/5"
                  : "border-transparent hover:border-gray-200"
              )}
              onClick={() => onDeviceSelect(device)}
              onDragStart={(event) => handleDeviceDragStart(event, device)}
              draggable
              data-testid={`device-${device.id}-collapsed`}
              title={device.name}
            >
              <span className="text-sm">{getDeviceIcon(device.icon)}</span>
            </Button>
          ))}
        </div>
      </div>
      )}

      {showExpandedContent && (
      <div
        className={cn(
          "absolute inset-0 flex flex-col transition-[opacity,transform] duration-250 ease-out",
          isCollapsed ? "pointer-events-none translate-x-4 opacity-0" : "translate-x-0 opacity-100",
        )}
        aria-hidden={isCollapsed}
      >

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
          <Suspense fallback={<SectionLoadingFallback label="sharing tools" />}>
            <TunnelButton port={currentPort} />
          </Suspense>
        </Section>

        <Section title="Live Reload" icon={Globe}>
          <Suspense fallback={<SectionLoadingFallback label="live reload" />}>
            <LiveReloadToggle onReload={onReload} />
          </Suspense>
        </Section>

        {urlInput && (
          <Section title="Inspect" icon={Activity} defaultOpen>
            <Suspense fallback={<SectionLoadingFallback label="inspect tools" />}>
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
            </Suspense>
          </Section>
        )}

        {urlInput && (
          <Section title="Authentication" icon={Globe} defaultOpen>
            <Suspense fallback={<SectionLoadingFallback label="authentication tools" />}>
              <AuthWizard
                onAuthCapture={onAuthCapture || (() => {})}
                onProxyUrl={onProxyUrl}
                currentUrl={urlInput}
              />
            </Suspense>
          </Section>
        )}

        {urlInput && (
          <Section title="Screenshots" icon={Globe} defaultOpen>
            <Suspense fallback={<SectionLoadingFallback label="screenshots" />}>
              <ScreenshotPanel currentUrl={urlInput} proxyUrl={proxyUrl} />
            </Suspense>
          </Section>
        )}

        {urlInput && (
          <Section title="Performance" icon={Activity}>
            <Suspense fallback={<SectionLoadingFallback label="performance tools" />}>
              <PerformancePanel currentUrl={urlInput} proxyUrl={proxyUrl} />
            </Suspense>
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
                            "w-full cursor-grab flex items-center gap-2.5 px-2.5 py-2 rounded-md border transition-all duration-150 h-auto justify-start active:scale-[0.97] active:cursor-grabbing",
                            isSelected
                              ? "border-primary bg-primary/5 shadow-sm"
                              : isPinned
                                ? "border-orange-200 bg-orange-50/50"
                                : "border-transparent hover:border-gray-200 hover:bg-gray-50"
                          )}
                          onClick={() => onDeviceSelect(device)}
                          onDragStart={(event) => handleDeviceDragStart(event, device)}
                          draggable
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
      </div>
      )}
    </aside>
    </>
  );
}
