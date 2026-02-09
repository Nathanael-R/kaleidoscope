import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Download, Loader2, CheckCircle, XCircle } from "lucide-react";

interface ScreenshotResult {
  device: string;
  path: string;
  width: number;
  height: number;
}

interface ScreenshotPanelProps {
  currentUrl: string;
  proxyUrl?: string | null;
}

const DEVICE_OPTIONS = [
  { id: "iphone-14", name: "iPhone 14", type: "mobile" },
  { id: "samsung-s21", name: "Samsung S21", type: "mobile" },
  { id: "pixel-6", name: "Pixel 6", type: "mobile" },
  { id: "ipad", name: "iPad", type: "tablet" },
  { id: "ipad-pro", name: "iPad Pro", type: "tablet" },
  { id: "macbook-air", name: "MacBook Air", type: "desktop" },
  { id: "desktop", name: "Desktop HD", type: "desktop" },
  { id: "desktop-4k", name: "Desktop 4K", type: "desktop" },
] as const;

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function ScreenshotPanel({ currentUrl, proxyUrl }: ScreenshotPanelProps) {
  const [selectedDevices, setSelectedDevices] = useState<string[]>([
    "iphone-14",
    "ipad",
    "desktop",
  ]);
  const [capturing, setCapturing] = useState(false);
  const [results, setResults] = useState<ScreenshotResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fullPage, setFullPage] = useState(false);

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

  const captureScreenshots = async () => {
    if (!currentUrl || selectedDevices.length === 0) return;

    setCapturing(true);
    setError(null);
    setResults([]);

    try {
      const res = await fetch(`${API_BASE}/api/screenshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: proxyUrl || currentUrl,
          devices: selectedDevices,
          fullPage,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error || "Failed to capture screenshots");
      }

      const data = (await res.json()) as {
        screenshots: ScreenshotResult[];
      };
      setResults(data.screenshots);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screenshot capture failed");
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Device Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600">Devices</span>
          <div className="flex gap-1">
            <button
              onClick={selectAll}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              All
            </button>
            <span className="text-xs text-gray-400">|</span>
            <button
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
              onClick={() => toggleDevice(device.id)}
              className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                selectedDevices.includes(device.id)
                  ? "bg-blue-50 border-blue-300 text-blue-700"
                  : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              {device.name}
            </button>
          ))}
        </div>
      </div>

      {/* Options */}
      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={fullPage}
          onChange={(e) => setFullPage(e.target.checked)}
          className="rounded border-gray-300"
        />
        Full page capture
      </label>

      {/* Capture Button */}
      <Button
        onClick={captureScreenshots}
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
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs font-medium text-green-700">
              {results.length} screenshots captured
            </span>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {results.map((result, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-md text-xs"
              >
                <div>
                  <span className="font-medium text-gray-700">
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
            Screenshots saved to ./screenshots/
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
