import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, ChevronDown, Download, Loader2, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { devices } from "@/lib/devices";
import { useScreenshotCapture } from "@/hooks/use-screenshot-capture";

interface ScreenshotResult {
  device: string;
  path: string;
  width: number;
  height: number;
  url?: string;
}

interface ScreenshotPanelProps {
  currentUrl: string;
  proxyUrl?: string | null;
}

const DEVICE_OPTIONS = devices.map(device => ({
  id: device.id,
  name: device.name,
  type: device.type,
}));

function CollapsiblePanelSection({
  title,
  badge,
  children,
  defaultOpen = true,
  testId,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <span className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-200">{title}</span>
        {badge && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {badge}
          </span>
        )}
        <ChevronDown className={cn("w-3.5 h-3.5 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-gray-200 px-3 py-2 dark:border-gray-700">{children}</div>}
    </div>
  );
}

export default function ScreenshotPanel({ currentUrl, proxyUrl }: ScreenshotPanelProps) {
  const [selectedDevices, setSelectedDevices] = useState<string[]>([
    "iphone-14",
    "ipad",
    "desktop",
  ]);
  const [fullPage, setFullPage] = useState(false);
  const [includeMockup, setIncludeMockup] = useState(false);
  const [results, setResults] = useState<ScreenshotResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const { isCapturing: capturing, captureScreenshots } = useScreenshotCapture<ScreenshotResult>({
    currentUrl,
    proxyUrl,
    onCaptureStart: () => {
      setError(null);
      setResults([]);
      setSaveNote(null);
    },
  });

  const toggleDevice = (id: string) => {
    setSelectedDevices((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedDevices(DEVICE_OPTIONS.map((d) => d.id));
  };

  const clearAll = () => {
    setSelectedDevices([]);
  };

  const handleCaptureScreenshots = async () => {
    if (!currentUrl || selectedDevices.length === 0) return;

    const outcome = await captureScreenshots({
      devices: selectedDevices,
      fullPage,
      includeMockup,
    });

    if (outcome.status === "aborted") {
      return;
    }

    if (outcome.status === "failed") {
      setError(outcome.message);
      return;
    }

    setResults(outcome.screenshots);

    if (outcome.summary.downloadableCount === 0) {
      setSaveNote("No downloadable screenshots were produced. Check the per-device results below.");
      return;
    }

    if (!outcome.usedDirectoryHandle) {
      setSaveNote("Screenshots saved to ./screenshots/");
      return;
    }

    if (outcome.summary.failures.length > 0) {
      if (outcome.summary.savedCount > 0) {
        setSaveNote(`Downloaded ${outcome.summary.savedCount} screenshot(s); ${outcome.summary.failures.length} failed.`);
        setError(outcome.summary.failures[0]?.message ?? "Some screenshots could not be saved.");
        return;
      }

      setError(outcome.summary.failures[0]?.message ?? "Failed to save screenshots");
      return;
    }

    setSaveNote(`Downloaded ${outcome.summary.savedCount} screenshot(s) to selected folder.`);
  };

  return (
    <div className="space-y-4">
      <CollapsiblePanelSection
        title="Devices"
        badge={`${selectedDevices.length}/${DEVICE_OPTIONS.length}`}
        testId="screenshot-device-section"
      >
        <div className="mb-2 flex justify-end">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              All
            </button>
            <span className="text-xs text-gray-400">|</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              None
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DEVICE_OPTIONS.map((device) => (
            <button
              key={device.id}
              type="button"
              onClick={() => toggleDevice(device.id)}
              className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                selectedDevices.includes(device.id)
                  ? "bg-blue-50 border-blue-300 text-blue-700"
                  : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300"
              }`}
            >
              {device.name}
            </button>
          ))}
        </div>
      </CollapsiblePanelSection>

      {/* Options */}
      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={includeMockup}
          onChange={(e) => {
            const nextValue = e.target.checked;
            setIncludeMockup(nextValue);
            if (nextValue) {
              setFullPage(false);
            }
          }}
          className="rounded border-gray-300"
          data-testid="include-mockup-checkbox"
        />
        Include device mockups
      </label>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Wrap each screenshot in a device frame instead of saving only the page content.
      </p>

      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={fullPage}
          onChange={(e) => setFullPage(e.target.checked)}
          disabled={includeMockup}
          className="rounded border-gray-300"
        />
        Full page capture
      </label>
      {includeMockup && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          Full-page capture is only available for raw screenshots. Mockup captures use the visible device viewport.
        </p>
      )}

      {/* Capture Button */}
      <Button
        onClick={handleCaptureScreenshots}
        disabled={capturing || !currentUrl || selectedDevices.length === 0}
        className="w-full"
        size="sm"
      >
        {capturing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Capturing {selectedDevices.length} screenshots...
          </>
        ) : (
          <>
            <Camera className="w-4 h-4 mr-2" />
            Capture {selectedDevices.length} Screenshots
          </>
        )}
      </Button>

      {/* Error */}
      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          {(() => {
            const successfulResults = results.filter((result) => !result.path.startsWith('ERROR:'));
            const failedResults = results.length - successfulResults.length;

            return (
              <>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs font-medium text-green-700">
              {successfulResults.length} screenshot{successfulResults.length === 1 ? '' : 's'} captured
            </span>
          </div>
          {failedResults > 0 && (
            <p className="text-xs text-amber-700">
              {failedResults} screenshot{failedResults === 1 ? '' : 's'} failed during capture.
            </p>
          )}
              </>
            );
          })()}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {results.map((result, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-md text-xs"
              >
                <div>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {result.device}
                  </span>
                  <span className="text-gray-400 ml-1">
                    {result.width}x{result.height}
                  </span>
                </div>
                {!result.path.startsWith("ERROR:") && (
                  <Download className="w-3.5 h-3.5 text-gray-400" />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            {saveNote || "Screenshots saved to ./screenshots/"}
          </p>
        </div>
      )}

      {!currentUrl && (
        <p className="text-xs text-gray-400">
          Enter a URL first to enable screenshots.
        </p>
      )}
    </div>
  );
}
