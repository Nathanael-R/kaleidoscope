import Sidebar from "@/components/sidebar";
import PreviewArea from "@/components/preview-area";
import type { PreviewWorkspaceController } from "@/hooks/use-preview-workspace";

export default function PreviewWorkspacePane({
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
  handleAddDeviceToCanvas,
}: PreviewWorkspaceController) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row">
      <Sidebar
        deviceControls={{
          selectedDevice,
          onDeviceSelect: handleDeviceSelect,
          pinnedDevices,
          onDevicePin: handleDevicePin,
        }}
        previewControls={{
          currentUrl,
          onUrlChange: handleUrlChange,
          onLoadUrl: handleLoadUrl,
          viewMode,
          onViewModeToggle: handleViewModeToggle,
        }}
        inspectControls={{
          enabled: inspectEnabled,
          pending: inspectPending,
          resolving: inspectResolving,
          result: inspectResult,
          error: inspectError,
          sourceDir: inspectSourceDir,
          onSourceDirChange: setInspectSourceDir,
          onToggle: handleToggleInspect,
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
      />
      <div id="preview-content" className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <PreviewArea
          selectedDevice={selectedDevice}
          currentUrl={currentUrl}
          proxyUrl={effectiveProxyUrl}
          pinnedDevices={pinnedDevices}
          viewMode={viewMode}
          onDevicePin={handleDevicePin}
          onCanvasDeviceDrop={handleAddDeviceToCanvas}
          canInspect={inspectAvailable}
          inspectEnabled={inspectEnabled}
          inspectPending={inspectPending}
          onToggleInspect={handleToggleInspect}
          onInspectSelection={handleInspectSelection}
        />
      </div>
    </div>
  );
}
