import type {
  LayoutChange,
  LayoutDiffResult,
  LayoutDiffVerdict,
} from './layout-diff.service.js';
import type { LayoutSourceLocation } from './layout-types.js';

export interface LayoutSummaryOptions {
  maxChanges?: number;
}

export interface LayoutSummaryResult {
  verdict: LayoutDiffVerdict;
  text: string;
  changedDevices: string[];
  topChanges: Array<{
    deviceId: string;
    type: LayoutChange['type'];
    severity: LayoutChange['severity'];
    label: string;
    details: string;
    source: string | null;
  }>;
}

function formatSource(source: LayoutSourceLocation | null): string | null {
  if (!source?.filePath) {
    return null;
  }

  if (source.lineNumber) {
    return `${source.filePath}:${source.lineNumber}`;
  }

  return source.filePath;
}

function changePriority(change: LayoutChange): number {
  const severityScore = change.severity === 'high' ? 300 : change.severity === 'medium' ? 200 : 100;
  const typeScore = change.type === 'removed' ? 40 : change.type === 'added' ? 30 : change.type === 'text' ? 20 : 10;
  const sourceScore = change.source ? 5 : 0;
  return severityScore + typeScore + sourceScore;
}

function topChanges(diff: LayoutDiffResult, maxChanges: number): LayoutChange[] {
  return diff.devices
    .flatMap(device => device.changes)
    .sort((left, right) => changePriority(right) - changePriority(left))
    .slice(0, maxChanges);
}

function summarizeNoChange(diff: LayoutDiffResult): string {
  const deviceList = diff.devices.map(device => device.device.id).join(', ');
  return `noChange: ${diff.deviceCount} device(s) checked (${deviceList}); no visible layout/text changes detected.`;
}

function summarizeInconclusive(diff: LayoutDiffResult): string {
  const reasons: string[] = [];
  if (diff.truncated) {
    reasons.push('capture truncated');
  }
  if (diff.devices.length === 0) {
    reasons.push('no shared devices');
  }
  const diagnostics = diff.devices.flatMap(device => device.diagnostics);
  if (diagnostics.length > 0) {
    reasons.push(diagnostics[0] ?? 'capture diagnostic');
  }
  if (diff.warnings.length > 0) {
    reasons.push(diff.warnings[0] ?? 'capture warning');
  }

  return `inconclusive: ${reasons.join('; ') || 'layout comparison could not prove stability'}.`;
}

function summarizeChanged(diff: LayoutDiffResult, changes: LayoutChange[]): string {
  const lines = [
    `changed: ${diff.changeCount} visible change(s) across ${diff.changedDeviceCount}/${diff.deviceCount} device(s).`,
  ];

  for (const change of changes) {
    const source = formatSource(change.source);
    lines.push(
      `- ${change.deviceId}: ${change.type} ${change.label}; ${change.details}${source ? ` (${source})` : ''}`,
    );
  }

  return lines.join('\n');
}

export function summarizeLayoutDiff(
  diff: LayoutDiffResult,
  options: LayoutSummaryOptions = {},
): LayoutSummaryResult {
  const maxChanges = Math.max(1, Math.min(options.maxChanges ?? 8, 20));
  const changes = topChanges(diff, maxChanges);
  const changedDevices = diff.devices
    .filter(device => device.changes.length > 0)
    .map(device => device.device.id);

  const text = diff.verdict === 'noChange'
    ? summarizeNoChange(diff)
    : diff.verdict === 'inconclusive'
      ? summarizeInconclusive(diff)
      : summarizeChanged(diff, changes);

  return {
    verdict: diff.verdict,
    text,
    changedDevices,
    topChanges: changes.map(change => ({
      deviceId: change.deviceId,
      type: change.type,
      severity: change.severity,
      label: change.label,
      details: change.details,
      source: formatSource(change.source),
    })),
  };
}
