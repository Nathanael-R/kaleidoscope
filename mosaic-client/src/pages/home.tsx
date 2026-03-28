import Header from "@/components/header";
import PreviewWorkspacePane from "@/components/workspace/preview-workspace-pane";
import { usePreviewWorkspace } from "@/hooks/use-preview-workspace";

export default function Home() {
  const previewWorkspace = usePreviewWorkspace();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <a href="#preview-content" className="sr-only focus:not-sr-only focus:absolute focus:top-20 focus:left-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow-lg">Skip to preview</a>
      <Header />
      <div className="flex flex-1 min-h-0">
        <PreviewWorkspacePane {...previewWorkspace} />
      </div>
    </div>
  );
}
