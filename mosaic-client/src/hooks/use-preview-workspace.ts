import { useState, useEffect, useCallback } from "react";

import { devices, type Device } from "@/lib/devices";
import {
  isInspectableLocalUrl,
  type InspectResult,
  type InspectSelectionPayload,
} from "@/lib/inspect";
import { usePreviewStore } from "@/store/preview-store";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

interface UsePreviewWorkspaceOptions {
  keyboardNavigationEnabled?: boolean;
}

export interface PreviewWorkspaceController {
  selectedDevice: Device;
  handleDeviceSelect: (device: Device) => void;
  currentUrl: string;
  handleUrlChange: (url: string) => void;
  handleLoadUrl: (url: string) => void;
  isSidebarCollapsed: boolean;
  handleToggleSidebar: () => void;
  pinnedDevices: Device[];
  handleDevicePin: (device: Device) => void;
  viewMode: "single" | "comparison";
  handleViewModeToggle: () => void;
  handleReload: () => void;
  handleAuthCapture: () => void;
  handleProxyUrl: (url: string | null) => void;
  proxyUrl: string | null;
  effectiveProxyUrl: string | null;
  inspectEnabled: boolean;
  inspectPending: boolean;
  inspectResolving: boolean;
  inspectResult: InspectResult | null;
  inspectError: string | null;
  inspectSourceDir: string;
  setInspectSourceDir: (value: string) => void;
  handleToggleInspect: () => Promise<void>;
  handleInspectSelection: (selection: InspectSelectionPayload) => Promise<void>;
  inspectAvailable: boolean;
  reloadTrigger: number;
}

export function usePreviewWorkspace(
  options: UsePreviewWorkspaceOptions = {}
): PreviewWorkspaceController {
  const { keyboardNavigationEnabled = true } = options;
  const [selectedDevice, setSelectedDevice] = useState<Device>(devices[0]);
  const { currentUrl, setCurrentUrl, proxyUrl, setProxyUrl } = usePreviewStore();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [pinnedDevices, setPinnedDevices] = useState<Device[]>([]);
  const [viewMode, setViewMode] = useState<"single" | "comparison">("single");
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [inspectEnabled, setInspectEnabled] = useState(false);
  const [inspectProxyUrl, setInspectProxyUrl] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectSourceDir, setInspectSourceDir] = useState("");
  const [inspectSessionLoading, setInspectSessionLoading] = useState(false);
  const [inspectResolving, setInspectResolving] = useState(false);

  const inspectAvailable = viewMode === "single" && isInspectableLocalUrl(currentUrl);
  const inspectPending = inspectSessionLoading || inspectResolving;
  const effectiveProxyUrl = inspectEnabled && inspectProxyUrl ? inspectProxyUrl : proxyUrl;

  const handleDeviceSelect = useCallback((device: Device) => {
    setSelectedDevice(device);
  }, []);

  const handleUrlChange = useCallback(
    (url: string) => {
      setCurrentUrl(url);
    },
    [setCurrentUrl]
  );

  const handleLoadUrl = useCallback(
    (url: string) => {
      setCurrentUrl(url);
    },
    [setCurrentUrl]
  );

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((previous) => !previous);
  }, []);

  const handleDevicePin = useCallback((device: Device) => {
    setPinnedDevices((previous) => {
      if (previous.find((candidate) => candidate.id === device.id)) {
        return previous.filter((candidate) => candidate.id !== device.id);
      }

      return [...previous, device];
    });
  }, []);

  const handleViewModeToggle = useCallback(() => {
    setViewMode((previous) => (previous === "single" ? "comparison" : "single"));
  }, []);

  const handleReload = useCallback(() => {
    setReloadTrigger((previous) => previous + 1);
  }, []);

  const handleAuthCapture = useCallback(() => {
    setReloadTrigger((previous) => previous + 1);
  }, []);

  const handleProxyUrl = useCallback(
    (url: string | null) => {
      setProxyUrl(url);

      if (url) {
        setReloadTrigger((previous) => previous + 1);
      }
    },
    [setProxyUrl]
  );

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
      setInspectError("Load a local/dev URL first.");
      return;
    }

    if (viewMode !== "single") {
      setInspectError("Inspect mode is only available in single device view.");
      return;
    }

    if (!isInspectableLocalUrl(currentUrl)) {
      setInspectError("Inspect mode only supports local/dev loopback URLs such as localhost.");
      return;
    }

    setInspectSessionLoading(true);
    setInspectError(null);
    setInspectResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/inspect/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: currentUrl }),
      });

      const data = (await response.json()) as {
        error?: string;
        session?: { proxyUrl: string };
      };

      if (!response.ok || !data.session) {
        throw new Error(data.error || "Failed to start inspect mode");
      }

      setInspectProxyUrl(`${API_BASE}${data.session.proxyUrl}/`);
      setInspectEnabled(true);
    } catch (error) {
      setInspectError(error instanceof Error ? error.message : "Failed to start inspect mode");
      setInspectProxyUrl(null);
      setInspectEnabled(false);
    } finally {
      setInspectSessionLoading(false);
    }
  }, [clearInspect, currentUrl, inspectEnabled, viewMode]);

  const handleInspectSelection = useCallback(
    async (selection: InspectSelectionPayload) => {
      if (!inspectEnabled) {
        return;
      }

      setInspectResolving(true);
      setInspectError(null);

      try {
        const response = await fetch(`${API_BASE}/api/inspect/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: currentUrl,
            sourceDir: inspectSourceDir.trim() || undefined,
            selection,
          }),
        });

        const data = (await response.json()) as {
          error?: string;
          result?: InspectResult;
        };

        if (!response.ok || !data.result) {
          throw new Error(data.error || "Failed to resolve selected element");
        }

        setInspectResult(data.result);
      } catch (error) {
        setInspectError(error instanceof Error ? error.message : "Failed to resolve selected element");
      } finally {
        setInspectResolving(false);
      }
    },
    [currentUrl, inspectEnabled, inspectSourceDir]
  );

  const handleKeyNavigation = useCallback(
    (event: KeyboardEvent) => {
      if (!keyboardNavigationEnabled) {
        return;
      }

      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const currentIndex = devices.findIndex((device) => device.id === selectedDevice.id);

      switch (event.key) {
        case "ArrowLeft": {
          event.preventDefault();
          const previousIndex = currentIndex > 0 ? currentIndex - 1 : devices.length - 1;
          setSelectedDevice(devices[previousIndex]);
          break;
        }
        case "ArrowRight": {
          event.preventDefault();
          const nextIndex = currentIndex < devices.length - 1 ? currentIndex + 1 : 0;
          setSelectedDevice(devices[nextIndex]);
          break;
        }
        case " ": {
          event.preventDefault();
          handleDevicePin(selectedDevice);
          break;
        }
        case "c": {
          if (event.ctrlKey || event.metaKey) {
            return;
          }

          event.preventDefault();
          handleViewModeToggle();
          break;
        }
      }
    },
    [handleDevicePin, handleViewModeToggle, keyboardNavigationEnabled, selectedDevice]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyNavigation);
    return () => document.removeEventListener("keydown", handleKeyNavigation);
  }, [handleKeyNavigation]);

  useEffect(() => {
    clearInspect();
  }, [clearInspect, currentUrl]);

  useEffect(() => {
    if (viewMode === "comparison" && inspectEnabled) {
      clearInspect();
    }
  }, [clearInspect, inspectEnabled, viewMode]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarCollapsed(true);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return {
    selectedDevice,
    handleDeviceSelect,
    currentUrl,
    handleUrlChange,
    handleLoadUrl,
    isSidebarCollapsed,
    handleToggleSidebar,
    pinnedDevices,
    handleDevicePin,
    viewMode,
    handleViewModeToggle,
    handleReload,
    handleAuthCapture,
    handleProxyUrl,
    proxyUrl,
    effectiveProxyUrl,
    inspectEnabled,
    inspectPending,
    inspectResolving,
    inspectResult,
    inspectError,
    inspectSourceDir,
    setInspectSourceDir,
    handleToggleInspect,
    handleInspectSelection,
    inspectAvailable,
    reloadTrigger,
  };
}