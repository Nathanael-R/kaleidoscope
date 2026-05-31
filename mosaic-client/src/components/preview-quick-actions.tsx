import { Button } from "@/components/ui/button";
import { ArrowLeftFromLine, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

interface PreviewQuickActionsProps {
  onRotate: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export default function PreviewQuickActions({
  onRotate,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: PreviewQuickActionsProps) {
  return (
    <div className="mt-12 flex justify-center">
      <div className="flex items-center flex-wrap gap-2 md:gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 transition-shadow duration-200 hover:shadow-md">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRotate}
          className="flex items-center text-gray-700 dark:text-gray-300 hover:text-primary transition-all duration-150 hover:scale-105 active:scale-95"
          data-testid="button-rotate"
          aria-label="Rotate device orientation"
        >
          <RotateCw className="size-4 mr-2" />
          <span className="hidden sm:inline">Rotate</span>
        </Button>
        <div className="w-px h-6 bg-gray-300 hidden sm:block"></div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onZoomIn}
          className="flex items-center text-gray-700 dark:text-gray-300 hover:text-primary transition-all duration-150 hover:scale-105 active:scale-95"
          data-testid="button-zoom-in"
          aria-label="Zoom in"
        >
          <ZoomIn className="size-4 mr-2" />
          <span className="hidden sm:inline">Zoom In</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onZoomOut}
          className="flex items-center text-gray-700 dark:text-gray-300 hover:text-primary transition-all duration-150 hover:scale-105 active:scale-95"
          data-testid="button-zoom-out"
          aria-label="Zoom out"
        >
          <ZoomOut className="size-4 mr-2" />
          <span className="hidden sm:inline">Zoom Out</span>
        </Button>
        <div className="w-px h-6 bg-gray-300 hidden sm:block"></div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onResetZoom}
          className="flex items-center text-gray-700 dark:text-gray-300 hover:text-primary transition-all duration-150 hover:scale-105 active:scale-95"
          data-testid="button-reset-zoom"
          aria-label="Fit to screen"
        >
          <ArrowLeftFromLine className="size-4 mr-2" />
          <span className="hidden sm:inline">Fit</span>
        </Button>
      </div>
    </div>
  );
}