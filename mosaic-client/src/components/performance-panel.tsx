import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Activity, Loader2, XCircle, ChevronDown, ChevronRight,
  AlertTriangle, Info, Zap, FileCode, FolderOpen,
} from "lucide-react";
import {
  usePerformanceAudit,
  type DevicePerformanceResult,
  type SourceHint,
} from "@/hooks/use-performance-audit";
import { resolveKaleidoscopeApiUrl } from "@/lib/kaleidoscope-api";
import { cn } from "@/lib/utils";

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
  if (severity === "critical") return <XCircle className="size-3.5 text-red-500 shrink-0" />;
  if (severity === "warning") return <AlertTriangle className="size-3.5 text-orange-500 shrink-0" />;
  return <Info className="size-3.5 text-blue-500 shrink-0" />;
}

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
        <span className="text-xs font-medium text-gray-700 dark:text-gray-200 flex-1">{title}</span>
        {badge && (
          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {badge}
          </span>
        )}
        <ChevronDown className={cn("size-3.5 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-gray-200 px-3 py-2 dark:border-gray-700">{children}</div>}
    </div>
  );
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
        {value !== null ? `${value}${unit}` : "\u2014"}
      </span>
    </div>
  );
}

function SourceHintBlock({ hint }: { hint: SourceHint }) {
  return (
    <div className="mt-1.5 rounded border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30 overflow-hidden" data-testid="source-hint">
      <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-100/50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
        <FileCode className="size-3 text-blue-600 dark:text-blue-400" />
        <span className="text-[10px] font-mono text-blue-700 dark:text-blue-300 font-medium">
          {hint.file}:{hint.line}
        </span>
      </div>
      <div className="px-2 py-1.5 space-y-1">
        <div>
          <span className="text-[9px] uppercase tracking-wider text-red-500 font-semibold">Current</span>
          <pre className="text-[10px] font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all mt-0.5 leading-relaxed">
            {hint.code}
          </pre>
        </div>
        <div>
          <span className="text-[9px] uppercase tracking-wider text-green-600 font-semibold">Suggested fix</span>
          <pre className="text-[10px] font-mono text-green-700 dark:text-green-400 whitespace-pre-wrap break-all mt-0.5 leading-relaxed">
            {hint.suggestion}
          </pre>
        </div>
      </div>
    </div>
  );
}

function DeviceResult({ result }: { result: DevicePerformanceResult }) {
  const [expanded, setExpanded] = useState(false);
  const { device, vitals, issues, score } = result;
  const criticalCount = issues.filter(i => i.severity === "critical").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;
  const hintCount = issues.filter(i => i.sourceHint).length;

  return (
    <div className={cn("border rounded-lg overflow-hidden", scoreBg(score))}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/5 transition-colors"
        data-testid={`perf-device-${device.id}`}
      >
        <span className={cn("text-lg font-bold tabular-nums", scoreColor(score))}>{score}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-gray-800 dark:text-gray-200">{device.name}</div>
          <div className="text-[10px] text-gray-400">{device.width}x{device.height} &middot; {scoreLabel(score)}</div>
        </div>
        {hintCount > 0 && (
          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
            {hintCount} fix{hintCount !== 1 ? "es" : ""}
          </span>
        )}
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
          ? <ChevronDown className="size-3.5 text-gray-400 shrink-0" />
          : <ChevronRight className="size-3.5 text-gray-400 shrink-0" />
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
                {vitals.loadTime !== null ? `${vitals.loadTime}ms` : "\u2014"}
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
                {issues.map((issue) => (
                  <div
                    key={`${issue.type}-${issue.severity}-${issue.message}-${issue.element ?? ''}-${issue.target ?? ''}`}
                    className="bg-white/50 dark:bg-gray-800/30 rounded p-1.5"
                  >
                    <div className="flex items-start gap-1.5">
                      {severityIcon(issue.severity)}
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
                          {issue.message}
                        </p>
                        {issue.value && issue.target && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            Current: {issue.value} &middot; Target: {issue.target}
                          </p>
                        )}
                        {issue.sourceHint && (
                          <SourceHintBlock hint={issue.sourceHint} />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {issues.length === 0 && (
            <p className="text-[11px] text-green-600 flex items-center gap-1">
              <Zap className="size-3" /> No issues found, great performance!
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
  const [sourceDir, setSourceDir] = useState("");
  const {
    runPerformanceAudit,
    resetPerformanceAudit,
    results,
    error,
    isAuditing,
  } = usePerformanceAudit();

  const toggleDevice = (id: string) => {
    setSelectedDevices((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedDevices(DEVICE_OPTIONS.map((d) => d.id));
  const clearAll = () => setSelectedDevices([]);

  const runAudit = async () => {
    if (!currentUrl || selectedDevices.length === 0) return;

    const auditUrl = proxyUrl ? resolveKaleidoscopeApiUrl(proxyUrl) : currentUrl;

    resetPerformanceAudit();

    try {
      await runPerformanceAudit({
        url: auditUrl,
        devices: selectedDevices,
        sourceDir: sourceDir.trim() || undefined,
      });
    } catch {
      // Mutation state surfaces the error message in the panel.
    }
  };

  // Compute overall average score
  const avgScore = results && results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
    : null;

  // Count total source hints across all results
  const totalHints = results
    ? results.reduce((sum, r) => sum + r.issues.filter(i => i.sourceHint).length, 0)
    : 0;

  return (
    <div className="space-y-3" data-testid="performance-panel">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200" data-testid="performance-disclaimer">
        Performance results are approximate and useful for quick comparisons, not final benchmarking. Validate important issues with dedicated tooling such as Lighthouse, Chrome DevTools, or WebPageTest.
      </div>

      <CollapsiblePanelSection
        title="Devices"
        badge={`${selectedDevices.length}/${DEVICE_OPTIONS.length}`}
        testId="perf-device-section"
      >
        <div className="mb-2 flex justify-end">
          <div className="flex gap-1">
            <button type="button" onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-800">All</button>
            <span className="text-xs text-gray-400">|</span>
            <button type="button" onClick={clearAll} className="text-xs text-blue-600 hover:text-blue-800">None</button>
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
              data-testid={`perf-device-toggle-${device.id}`}
            >
              {device.name}
            </button>
          ))}
        </div>
      </CollapsiblePanelSection>

      {/* Source Directory (optional) */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <FolderOpen className="size-3 text-gray-400" />
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Project path</span>
          <span className="text-[10px] text-gray-400">(optional)</span>
        </div>
        <Input
          type="text"
          placeholder="/path/to/your/project/src"
          value={sourceDir}
          onChange={(e) => setSourceDir(e.target.value)}
          className="h-8 text-xs font-mono"
          data-testid="source-dir-input"
        />
        <p className="text-[10px] text-gray-400 mt-1">
          {sourceDir.trim()
            ? "Source mapping enabled \u2014 issues will link to exact lines with fix suggestions."
            : "Add your project path to see exact source lines and suggested code fixes."}
        </p>
      </div>

      {/* Run Button */}
      <Button
        onClick={runAudit}
        disabled={isAuditing || !currentUrl || selectedDevices.length === 0}
        className="w-full"
        size="sm"
        data-testid="run-performance-audit"
      >
        {isAuditing ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" />
            Auditing {selectedDevices.length} device{selectedDevices.length !== 1 ? "s" : ""}...
          </>
        ) : (
          <>
            <Activity className="size-4 mr-2" />
            Run Performance Audit
          </>
        )}
      </Button>

      {/* Error */}
      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-start gap-2">
            <XCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
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
                  {totalHints > 0 && ` \u00B7 ${totalHints} source fix${totalHints !== 1 ? "es" : ""} found`}
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
