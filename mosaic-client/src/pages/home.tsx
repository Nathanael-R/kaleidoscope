import { useState, useEffect, useCallback } from "react";
import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import PreviewArea from "@/components/preview-area";
import { devices, type Device } from "@/lib/devices";
import {
  isInspectableLocalUrl,
  type InspectResult,
  type InspectSelectionPayload,
} from "@/lib/inspect";
import { usePreviewStore } from "@/store/preview-store";

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function Home() {
  const [selectedDevice, setSelectedDevice] = useState<Device>(devices[0]); // Default to iPhone 14
  const { currentUrl, setCurrentUrl, proxyUrl, setProxyUrl } = usePreviewStore();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [pinnedDevices, setPinnedDevices] = useState<Device[]>([]);
  const [viewMode, setViewMode] = useState<'single' | 'comparison'>('single');
  const [reloadTrigger, setReloadTrigger] = useState(0); // Increment to trigger reload
  const [inspectEnabled, setInspectEnabled] = useState(false);
  const [inspectProxyUrl, setInspectProxyUrl] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectSourceDir, setInspectSourceDir] = useState('');
  const [inspectSessionLoading, setInspectSessionLoading] = useState(false);
  const [inspectResolving, setInspectResolving] = useState(false);

  const inspectAvailable = viewMode === 'single' && isInspectableLocalUrl(currentUrl);
  const inspectPending = inspectSessionLoading || inspectResolving;
  const effectiveProxyUrl = inspectEnabled && inspectProxyUrl ? inspectProxyUrl : proxyUrl;

  const handleDeviceSelect = (device: Device) => {
    setSelectedDevice(device);
  };

  const handleUrlChange = (url: string) => {
    setCurrentUrl(url);
  };

  const handleLoadUrl = (url: string) => {
    setCurrentUrl(url);
  };

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const handleDevicePin = (device: Device) => {
    setPinnedDevices(prev => {
      if (prev.find(d => d.id === device.id)) {
        return prev.filter(d => d.id !== device.id);
      } else {
        return [...prev, device];
      }
    });
  };

  const handleViewModeToggle = () => {
    setViewMode(prev => prev === 'single' ? 'comparison' : 'single');
  };

  const handleReload = () => {
    console.log('Triggering preview reload...');
    setReloadTrigger(prev => prev + 1);
  };

  const handleAuthCapture = () => {
    // Auth cookies are injected server-side by the proxy, not by the iframe.
    // Trigger reload so the proxy picks up the new cookies.
    setReloadTrigger(prev => prev + 1);
  };

  const handleProxyUrl = (url: string | null) => {
    setProxyUrl(url);
    // Trigger reload so iframe picks up the proxy URL
    if (url) {
      setReloadTrigger(prev => prev + 1);
    }
  };

  const clearInspect = useCallback(() => {
    setInspectEnabled(false);
    setInspectProxyUrl(null);
    setInspectResult(null);
    setInspectError(null);
    setInspectSessionLoading(false);
    setInspectResolving(false);
  }, []);

  const handleToggleInspect = useCallback(async () => {
    if (inspectEnabled) {
      clearInspect();
      return;
    }

    if (!currentUrl) {
      setInspectError('Load a local/dev URL first.');
      return;
    }

    if (viewMode !== 'single') {
      setInspectError('Inspect mode is only available in single device view.');
      return;
    }

    if (!isInspectableLocalUrl(currentUrl)) {
      setInspectError('Inspect mode only supports local/dev loopback URLs such as localhost.');
      return;
    }

    setInspectSessionLoading(true);
    setInspectError(null);
    setInspectResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/inspect/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: currentUrl }),
      });

      const data = await response.json() as {
        error?: string;
        session?: { proxyUrl: string };
      };

      if (!response.ok || !data.session) {
        throw new Error(data.error || 'Failed to start inspect mode');
      }

      setInspectProxyUrl(`${API_BASE}${data.session.proxyUrl}/`);
      setInspectEnabled(true);
    } catch (error) {
      setInspectError(error instanceof Error ? error.message : 'Failed to start inspect mode');
      setInspectProxyUrl(null);
      setInspectEnabled(false);
    } finally {
      setInspectSessionLoading(false);
    }
  }, [clearInspect, currentUrl, inspectEnabled, viewMode]);

  const handleInspectSelection = useCallback(async (selection: InspectSelectionPayload) => {
    if (!inspectEnabled) {
      return;
    }

    setInspectResolving(true);
    setInspectError(null);

    try {
      const response = await fetch(`${API_BASE}/api/inspect/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: currentUrl,
          sourceDir: inspectSourceDir.trim() || undefined,
          selection,
        }),
      });

      const data = await response.json() as {
        error?: string;
        result?: InspectResult;
      };

      if (!response.ok || !data.result) {
        throw new Error(data.error || 'Failed to resolve selected element');
      }

      setInspectResult(data.result);
    } catch (error) {
      setInspectError(error instanceof Error ? error.message : 'Failed to resolve selected element');
    } finally {
      setInspectResolving(false);
    }
  }, [currentUrl, inspectEnabled, inspectSourceDir]);

  // Keyboard navigation — only ←/→ for devices (↑/↓ reserved for page scrolling)
  const handleKeyNavigation = useCallback((e: KeyboardEvent) => {
    // Only handle keyboard navigation when not typing in inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const currentIndex = devices.findIndex(d => d.id === selectedDevice.id);

    switch (e.key) {
      case 'ArrowLeft': {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : devices.length - 1;
        setSelectedDevice(devices[prevIndex]);
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        const nextIndex = currentIndex < devices.length - 1 ? currentIndex + 1 : 0;
        setSelectedDevice(devices[nextIndex]);
        break;
      }
      case ' ': { // Spacebar to pin/unpin device
        e.preventDefault();
        handleDevicePin(selectedDevice);
        break;
      }
      case 'c': { // 'c' to toggle comparison mode
        if (e.ctrlKey || e.metaKey) return; // Don't interfere with copy
        e.preventDefault();
        handleViewModeToggle();
        break;
      }
    }
  }, [selectedDevice]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyNavigation);
    return () => document.removeEventListener('keydown', handleKeyNavigation);
  }, [handleKeyNavigation]);

  useEffect(() => {
    clearInspect();
  }, [clearInspect, currentUrl]);

  useEffect(() => {
    if (viewMode === 'comparison' && inspectEnabled) {
      clearInspect();
    }
  }, [clearInspect, inspectEnabled, viewMode]);

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarCollapsed(true);
      }
    };
    handleResize(); // Check on mount
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="bg-gray-50 dark:bg-gray-900">
      <a href="#preview-content" className="sr-only focus:not-sr-only focus:absolute focus:top-20 focus:left-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow-lg">Skip to preview</a>
      <Header />
      <div className="flex flex-col md:flex-row h-screen pt-16">
        <Sidebar
          selectedDevice={selectedDevice}
          onDeviceSelect={handleDeviceSelect}
          currentUrl={currentUrl}
          onUrlChange={handleUrlChange}
          onLoadUrl={handleLoadUrl}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          pinnedDevices={pinnedDevices}
          onDevicePin={handleDevicePin}
          viewMode={viewMode}
          onViewModeToggle={handleViewModeToggle}
          onReload={handleReload}
          onAuthCapture={handleAuthCapture}
          onProxyUrl={handleProxyUrl}
          proxyUrl={proxyUrl}
          inspectEnabled={inspectEnabled}
          inspectPending={inspectPending}
          inspectResolving={inspectResolving}
          inspectResult={inspectResult}
          inspectError={inspectError}
          inspectSourceDir={inspectSourceDir}
          onInspectSourceDirChange={setInspectSourceDir}
          onToggleInspect={handleToggleInspect}
        />
        <div id="preview-content" className="flex-1 flex">
          <PreviewArea
            selectedDevice={selectedDevice}
            currentUrl={currentUrl}
            proxyUrl={effectiveProxyUrl}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={handleToggleSidebar}
            pinnedDevices={pinnedDevices}
            viewMode={viewMode}
            reloadTrigger={reloadTrigger}
            canInspect={inspectAvailable}
            inspectEnabled={inspectEnabled}
            inspectPending={inspectPending}
            onToggleInspect={handleToggleInspect}
            onInspectSelection={handleInspectSelection}
          />
        </div>
      </div>
    </div>
  );
}
