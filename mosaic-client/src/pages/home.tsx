import { useState, useEffect, useCallback } from "react";
import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import PreviewArea from "@/components/preview-area";
import { devices, type Device } from "@/lib/devices";

export default function Home() {
  const [selectedDevice, setSelectedDevice] = useState<Device>(devices[0]); // Default to iPhone 14
  const [currentUrl, setCurrentUrl] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [pinnedDevices, setPinnedDevices] = useState<Device[]>([]);
  const [viewMode, setViewMode] = useState<'single' | 'comparison'>('single');
  const [reloadTrigger, setReloadTrigger] = useState(0); // Increment to trigger reload

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

  // Keyboard navigation
  const handleKeyNavigation = useCallback((e: KeyboardEvent) => {
    // Only handle keyboard navigation when not typing in inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const currentIndex = devices.findIndex(d => d.id === selectedDevice.id);
    
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : devices.length - 1;
        setSelectedDevice(devices[prevIndex]);
        break;
      }
      case 'ArrowRight':
      case 'ArrowDown': {
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

  return (
    <div className="bg-gray-50">
      <Header />
      <div className="flex h-screen pt-16">
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
        />
        <PreviewArea
          selectedDevice={selectedDevice}
          currentUrl={currentUrl}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={handleToggleSidebar}
          pinnedDevices={pinnedDevices}
          viewMode={viewMode}
          reloadTrigger={reloadTrigger}
        />
      </div>
    </div>
  );
}
