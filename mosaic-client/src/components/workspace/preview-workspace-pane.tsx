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
  handleAddDeviceToCanvas,
  reloadTrigger,
}: PreviewWorkspaceController) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col md:flex-row">
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
      <div id="preview-content" className="flex min-h-0 min-w-0 flex-1">
        <PreviewArea
          selectedDevice={selectedDevice}
          currentUrl={currentUrl}
          proxyUrl={effectiveProxyUrl}
          pinnedDevices={pinnedDevices}
          viewMode={viewMode}
          onDevicePin={handleDevicePin}
          onCanvasDeviceDrop={handleAddDeviceToCanvas}
          reloadTrigger={reloadTrigger}
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