import { AlertTriangle, Crosshair, FileCode, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { isInspectableLocalUrl, type InspectResult } from '@/lib/inspect';

interface InspectPanelProps {
  currentUrl: string;
  viewMode: 'single' | 'comparison';
  enabled: boolean;
  pending: boolean;
  resolving: boolean;
  sourceDir: string;
  onSourceDirChange: (value: string) => void;
  onToggle: () => void;
  result: InspectResult | null;
  error: string | null;
}

function toneClass(confidence: InspectResult['confidence']) {
  if (confidence === 'exact') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900';
  }

  if (confidence === 'likely') {
    return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900';
  }

  return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/40 dark:text-gray-300 dark:border-gray-700';
}

function disabledReason(currentUrl: string, viewMode: 'single' | 'comparison'): string | null {
  if (!currentUrl) {
    return 'Load a local/dev URL first.';
  }

  if (viewMode !== 'single') {
    return 'Inspect mode is only available in single device view.';
  }

  if (!isInspectableLocalUrl(currentUrl)) {
    return 'Inspect mode is limited to loopback targets such as localhost and 127.0.0.1.';
  }

  return null;
}

export default function InspectPanel({
  currentUrl,
  viewMode,
  enabled,
  pending,
  resolving,
  sourceDir,
  onSourceDirChange,
  onToggle,
  result,
  error,
}: InspectPanelProps) {
  const reason = disabledReason(currentUrl, viewMode);
  const buttonDisabled = pending || (!enabled && reason !== null);

  return (
    <div className="space-y-3" data-testid="inspect-panel">
      <div className="rounded-md border border-cyan-200 bg-cyan-50/60 p-2 text-[11px] text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/20 dark:text-cyan-300">
        Start inspect mode directly from the loaded local URL. Project path is only used as a fallback when runtime source metadata is missing.
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
          <FileCode className="h-3 w-3 text-gray-400" />
          Project path
          <span className="text-[10px] text-gray-400">optional</span>
        </div>
        <Input
          type="text"
          placeholder="Optional: /path/to/project/src"
          value={sourceDir}
          onChange={(event) => onSourceDirChange(event.target.value)}
          className="h-8 text-xs font-mono"
          data-testid="inspect-source-dir-input"
        />
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400" data-testid="inspect-source-dir-help">
          Leave this empty unless Kaleidoscope cannot map the selected element back to source on its own.
        </p>
      </div>

      <Button
        onClick={onToggle}
        disabled={buttonDisabled}
        className="w-full"
        size="sm"
        data-testid="inspect-toggle"
      >
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Crosshair className="mr-2 h-4 w-4" />
        )}
        {enabled ? 'Stop Inspecting' : 'Start Inspecting'}
      </Button>

      {reason && !enabled && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          {reason}
        </div>
      )}

      {enabled && !pending && (
        <div className="rounded-md border border-cyan-200 bg-cyan-50 p-2 text-xs text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/20 dark:text-cyan-300">
          Click any element in the preview to inspect it. Press Escape inside the preview to exit inspect mode quickly.
        </div>
      )}

      {resolving && !pending && (
        <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Resolving selected element...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/60" data-testid="inspect-result">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                {result.componentName || result.tagName}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                {result.selector || result.tagName}
              </div>
            </div>
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', toneClass(result.confidence))}>
              {result.confidence === 'exact' ? 'Exact Source' : result.confidence === 'likely' ? 'Likely Source' : 'No Source'}
            </span>
          </div>

          {result.source && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-950/40">
              <div className="text-[11px] font-mono text-gray-700 dark:text-gray-300" data-testid="inspect-source-path">
                {result.source.filePath}
                {result.source.lineNumber ? `:${result.source.lineNumber}` : ''}
                {result.source.columnNumber ? `:${result.source.columnNumber}` : ''}
              </div>
              {result.source.code && (
                <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] text-gray-600 dark:text-gray-400">
                  {result.source.code}
                </pre>
              )}
            </div>
          )}

          {result.text && (
            <div className="text-[11px] text-gray-600 dark:text-gray-400">
              Selected text: <span className="font-medium text-gray-800 dark:text-gray-200">{result.text}</span>
            </div>
          )}

          {result.stack.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Component stack
              </div>
              <div className="space-y-1">
                {result.stack.slice(0, 5).map((frame, index) => (
                  <div key={`${frame.filePath}-${frame.lineNumber}-${index}`} className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] dark:border-gray-700 dark:bg-gray-950/40">
                    <div className="font-medium text-gray-700 dark:text-gray-300">{frame.componentName || frame.filePath}</div>
                    <div className="font-mono text-gray-500 dark:text-gray-400">
                      {frame.filePath}
                      {frame.lineNumber ? `:${frame.lineNumber}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.diagnostics.length > 0 && (
            <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950/20">
              {result.diagnostics.map((diagnostic) => (
                <div key={diagnostic} className="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{diagnostic}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}