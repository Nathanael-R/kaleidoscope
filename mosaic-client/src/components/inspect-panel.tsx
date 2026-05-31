import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ClipboardCopy, Crosshair, FileCode, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  formatInspectResultAsJson,
  formatInspectResultForLlm,
  formatInspectSourcePath,
  formatInspectSourceText,
  isInspectableLocalUrl,
  type InspectResult,
} from '@/lib/inspect';

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
  const [copiedAction, setCopiedAction] = useState<'path' | 'source' | 'json' | 'llm' | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [issueSummary, setIssueSummary] = useState('');
  const [showLlmComposer, setShowLlmComposer] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const issueInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => () => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }
  }, []);

  const setCopiedFeedback = (action: 'path' | 'source' | 'json' | 'llm') => {
    setCopiedAction(action);
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setCopiedAction(null);
      resetTimerRef.current = null;
    }, 1600);
  };

  const copyToClipboard = async (text: string, action: 'path' | 'source' | 'json' | 'llm') => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable in this browser.');
      }

      await navigator.clipboard.writeText(text);
      setCopyError(null);
      setCopiedFeedback(action);
    } catch (copyIssue) {
      setCopiedAction(null);
      setCopyError(copyIssue instanceof Error ? copyIssue.message : 'Failed to copy inspect details.');
    }
  };

  const sourcePath = result ? formatInspectSourcePath(result) : null;
  const sourceText = result ? formatInspectSourceText(result) : null;
  const jsonPayload = result ? formatInspectResultAsJson(result) : null;
  const trimmedIssueSummary = issueSummary.trim();
  const llmPayload = result && trimmedIssueSummary ? formatInspectResultForLlm(result, trimmedIssueSummary) : null;

  const handleCopyForLlm = () => {
    if (!showLlmComposer) {
      setShowLlmComposer(true);
      setCopyError(null);
      window.setTimeout(() => issueInputRef.current?.focus(), 0);
      return;
    }

    if (!llmPayload) {
      issueInputRef.current?.focus();
      return;
    }

    void copyToClipboard(llmPayload, 'llm');
  };

  return (
    <div className="space-y-3" data-testid="inspect-panel">
      <div className="rounded-md border border-cyan-200 bg-cyan-50/60 p-2 text-[11px] text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/20 dark:text-cyan-300">
        Start inspect mode directly from the loaded local URL. Project path is only used as a fallback when runtime source metadata is missing.
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
          <FileCode className=" size-3 text-gray-400" />
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
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Crosshair className="mr-2 size-4" />
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
          <Loader2 className=" size-3.5 animate-spin" />
          Resolving selected element&hellip;
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

          <div className="grid gap-1 text-[11px] text-gray-600 dark:text-gray-400">
            <div className="min-w-0">
              <span className="font-medium text-gray-800 dark:text-gray-200">Page:</span>{' '}
              {result.page.title && (
                <span className="text-gray-700 dark:text-gray-300">{result.page.title}</span>
              )}
              {result.page.url && (
                <div className="mt-0.5 break-all font-mono text-[10px] text-gray-500 dark:text-gray-400" data-testid="inspect-page-url">
                  {result.page.url}
                </div>
              )}
              {!result.page.url && !result.page.title && 'Unavailable'}
            </div>
            {result.device && (
              <div>
                <span className="font-medium text-gray-800 dark:text-gray-200">Device:</span>{' '}
                {result.device.name} ({result.device.width} x {result.device.height}, {result.device.type})
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              disabled={!sourcePath}
              onClick={() => sourcePath && void copyToClipboard(sourcePath, 'path')}
              data-testid="inspect-copy-path"
            >
              <ClipboardCopy className="mr-1.5 size-3" />
              {copiedAction === 'path' ? 'Copied Path' : 'Copy Source Path'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              disabled={!sourceText}
              onClick={() => sourceText && void copyToClipboard(sourceText, 'source')}
              data-testid="inspect-copy-source"
            >
              <ClipboardCopy className="mr-1.5 size-3" />
              {copiedAction === 'source' ? 'Copied Source' : 'Copy Source'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              disabled={!jsonPayload}
              onClick={() => jsonPayload && void copyToClipboard(jsonPayload, 'json')}
              data-testid="inspect-copy-json"
            >
              <ClipboardCopy className="mr-1.5 size-3" />
              {copiedAction === 'json' ? 'Copied JSON' : 'Copy JSON'}
            </Button>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50/80 p-2 dark:border-gray-700 dark:bg-gray-950/30" data-testid="inspect-llm-group">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                disabled={!result}
                onClick={handleCopyForLlm}
                data-testid="inspect-copy-llm"
              >
                <ClipboardCopy className="mr-1.5 size-3" />
                {copiedAction === 'llm' ? 'Copied for LLM' : 'Copy for LLM'}
              </Button>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {showLlmComposer
                  ? 'Add a short bug description, then copy the prompt.'
                  : 'Opens a small issue template before copying.'}
              </span>
            </div>

            {showLlmComposer && (
              <div className="mt-2 space-y-1.5">
                <Label htmlFor="inspect-issue-input" className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                  What is the problem?
                </Label>
                <textarea
                  id="inspect-issue-input"
                  aria-label="Issue summary"
                  ref={issueInputRef}
                  value={issueSummary}
                  onChange={(event) => setIssueSummary(event.target.value)}
                  placeholder="Describe the bug you want the LLM to fix, for example: The save button wraps and overflows on iPhone 16."
                  className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
                  data-testid="inspect-issue-input"
                />
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Required for Copy for LLM. Keep it short and specific to the bug you want fixed.
                </p>
              </div>
            )}
          </div>

          {copyError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
              {copyError}
            </div>
          )}

          {result.source && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-950/40">
              <div className="text-[11px] font-mono text-gray-700 dark:text-gray-300" data-testid="inspect-source-path">
                {sourcePath}
              </div>
              {sourceText && (
                <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] text-gray-600 dark:text-gray-400">
                  {sourceText}
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
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
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
