import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Activity, Loader2, XCircle, ChevronDown, ChevronRight,
  AlertTriangle, Info, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types mirroring the server response                                */
/* ------------------------------------------------------------------ */

interface WebVitals {
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  ttfb: number | null;
  domContentLoaded: number | null;
  loadTime: number | null;
  totalBytes: number;
  requestCount: number;
}

interface PerformanceIssue {
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
  element?: string;
  value?: string;
  target?: string;
}

interface DeviceConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  type: "mobile" | "tablet" | "desktop";
}

interface DevicePerformanceResult {
  device: DeviceConfig;
  vitals: WebVitals;
  issues: PerformanceIssue[];
  score: number;
}

interface AuditResponse {
  success: boolean;
  url: string;
  timestamp: string;
  results: DevicePerformanceResult[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function scoreColor(score: number): string {
  if (score >= 90) return "text-green-600";
  if (score >= 50) return "text-orange-500";
  return "text-red-600";
}

function scoreBg(score: number): string {
  if (score >= 90) return "bg-green-50 border-green-200";
  if (score >= 50) return "bg-orange-50 border-orange-200";
  return "bg-red-50 border-red-200";
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Good";
  if (score >= 50) return "Needs Work";
  return "Poor";
}

function metricColor(metric: string, value: number | null): string {
  if (value === null) return "text-gray-400";
  const t: Record<string, { good: number; poor: number }> = {
    fcp: { good: 1800, poor: 3000 },
    lcp: { good: 2500, poor: 4000 },
    cls: { good: 0.1, poor: 0.25 },
    ttfb: { good: 800, poor: 1800 },
  };
  const thresh = t[metric];
  if (!thresh) return "text-gray-700 dark:text-gray-300";
  if (value <= thresh.good) return "text-green-600";
  if (value <= thresh.poor) return "text-orange-500";
  return "text-red-600";
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function severityIcon(severity: string) {
  if (severity === "critical") return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
  if (severity === "warning") return <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0" />;
  return <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function VitalsRow({ label, value, unit, metric }: {
  label: string; value: number | null; unit: string; metric: string;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className={cn("text-[11px] font-mono font-medium", metricColor(metric, value))}>
        {value !== null ? `${value}${unit}` : "—"}
      </span>
    </div>
  );
}

function DeviceResult({ result }: { result: DevicePerformanceResult }) {
  const [expanded, setExpanded] = useState(false);
  const { device, vitals, issues, score } = result;
  const criticalCount = issues.filter(i => i.severity === "critical").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;

  return (
    <div className={cn("border rounded-lg overflow-hidden", scoreBg(score))}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/5 transition-colors"
        data-testid={`perf-device-${device.id}`}
      >
        <span className={cn("text-lg font-bold tabular-nums", scoreColor(score))}>{score}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gray-800 dark:text-gray-200">{device.name}</div>
          <div className="text-[10px] text-gray-400">{device.width}x{device.height} &middot; {scoreLabel(score)}</div>
        </div>
        {criticalCount > 0 && (
          <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">
            {criticalCount} critical
          </span>
        )}
        {warningCount > 0 && (
          <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">
            {warningCount} warning{warningCount !== 1 ? "s" : ""}
          </span>
        )}
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        }
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Core Web Vitals grid */}
          <div className="bg-white/60 dark:bg-gray-800/40 rounded-md p-2">
            <VitalsRow label="LCP" value={vitals.lcp} unit="ms" metric="lcp" />
            <VitalsRow label="FCP" value={vitals.fcp} unit="ms" metric="fcp" />
            <VitalsRow label="CLS" value={vitals.cls} unit="" metric="cls" />
            <VitalsRow label="TTFB" value={vitals.ttfb} unit="ms" metric="ttfb" />
            <div className="border-t border-gray-200/50 my-1" />
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Load Time</span>
              <span className="text-[11px] font-mono text-gray-700 dark:text-gray-300">
                {vitals.loadTime !== null ? `${vitals.loadTime}ms` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Page Weight</span>
              <span className="text-[11px] font-mono text-gray-700 dark:text-gray-300">
                {formatBytes(vitals.totalBytes)}
              </span>
            </div>
            <div className="flex items-center justify-between py-0.5">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Requests</span>
              <span className="text-[11px] font-mono text-gray-700 dark:text-gray-300">
                {vitals.requestCount}
              </span>
            </div>
          </div>

          {/* Issues */}
          {issues.length > 0 && (
            <div>
              <h5 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Issues to fix
              </h5>
              <div className="space-y-1.5">
                {issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-1.5 bg-white/50 dark:bg-gray-800/30 rounded p-1.5">
                    {severityIcon(issue.severity)}
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                        {issue.message}
                      </p>
                      {issue.value && issue.target && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Current: {issue.value} &middot; Target: {issue.target}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {issues.length === 0 && (
            <p className="text-[11px] text-green-600 flex items-center gap-1">
              <Zap className="w-3 h-3" /> No issues found — great performance!
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Panel                                                         */
/* ------------------------------------------------------------------ */

interface PerformancePanelProps {
  currentUrl: string;
  proxyUrl?: string | null;
}

export default function PerformancePanel({ currentUrl, proxyUrl }: PerformancePanelProps) {
  const [selectedDevices, setSelectedDevices] = useState<string[]>([
    "iphone-14",
    "ipad",
    "desktop",
  ]);
  const [auditing, setAuditing] = useState(false);
  const [results, setResults] = useState<DevicePerformanceResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleDevice = (id: string) => {
    setSelectedDevices((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedDevices(DEVICE_OPTIONS.map((d) => d.id));
  const clearAll = () => setSelectedDevices([]);

  const runAudit = async () => {
    if (!currentUrl || selectedDevices.length === 0) return;

    setAuditing(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch(`${API_BASE}/api/performance/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: proxyUrl || currentUrl,
          devices: selectedDevices,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        throw new Error(data.error || "Audit failed");
      }

      const data = (await res.json()) as AuditResponse;
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Performance audit failed");
    } finally {
      setAuditing(false);
    }
  };

  // Compute overall average score
  const avgScore = results && results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
    : null;

  return (
    <div className="space-y-3" data-testid="performance-panel">
      {/* Device Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Devices</span>
          <div className="flex gap-1">
            <button onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800">All</button>
            <span className="text-xs text-gray-400">|</span>
            <button onClick={clearAll} className="text-xs text-blue-600 hover:text-blue-800">None</button>
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
                  : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300"
              }`}
              data-testid={`perf-device-toggle-${device.id}`}
            >
              {device.name}
            </button>
          ))}
        </div>
      </div>

      {/* Run Button */}
      <Button
        onClick={runAudit}
        disabled={auditing || !currentUrl || selectedDevices.length === 0}
        className="w-full"
        size="sm"
        data-testid="run-performance-audit"
      >
        {auditing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Auditing {selectedDevices.length} device{selectedDevices.length !== 1 ? "s" : ""}...
          </>
        ) : (
          <>
            <Activity className="w-4 h-4 mr-2" />
            Run Performance Audit
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
      {results && results.length > 0 && (
        <div className="space-y-2">
          {/* Average Score Banner */}
          {avgScore !== null && (
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border", scoreBg(avgScore))}>
              <span className={cn("text-2xl font-bold tabular-nums", scoreColor(avgScore))}>
                {avgScore}
              </span>
              <div>
                <div className="text-xs font-medium text-gray-700">Average Score</div>
                <div className="text-[10px] text-gray-500">
                  {scoreLabel(avgScore)} &middot; {results.length} device{results.length !== 1 ? "s" : ""} tested
                </div>
              </div>
            </div>
          )}

          {/* Per-device results */}
          <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="performance-results">
            {results.map((result) => (
              <DeviceResult key={result.device.id} result={result} />
            ))}
          </div>
        </div>
      )}

      {!currentUrl && (
        <p className="text-xs text-gray-400">
          Enter a URL first to run a performance audit.
        </p>
      )}
    </div>
  );
}
