import { useMemo } from "react";

import { useLocation } from "wouter";

import Header from "@/components/header";
import PreviewWorkspacePane from "@/components/workspace/preview-workspace-pane";
import { usePreviewWorkspace } from "@/hooks/use-preview-workspace";
import { FlowWorkspacePane } from "@/pages/flow-diagrams";

export default function Workspace() {
  const [location] = useLocation();
  const flowMode = useMemo(() => location === "/flows", [location]);
  const previewWorkspace = usePreviewWorkspace({
    keyboardNavigationEnabled: !flowMode,
  });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <a
        href={flowMode ? "#flow-workspace" : "#preview-content"}
        className="sr-only focus:not-sr-only focus:absolute focus:top-20 focus:left-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow-lg"
      >
        {flowMode ? "Skip to flow workspace" : "Skip to preview"}
      </a>
      <Header />
      <div className="flex flex-1 min-h-0">
        {flowMode ? (
          <div id="flow-workspace" className="flex h-full min-h-0">
            <FlowWorkspacePane embedded />
          </div>
        ) : (
          <PreviewWorkspacePane {...previewWorkspace} />
        )}
      </div>
    </div>
  );
}