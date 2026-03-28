import type { Node } from "@xyflow/react";

export const FLOW_REVIEW_STATUSES = ["untouched", "reviewed", "issue", "approved"] as const;
export const FLOW_ISSUE_SEVERITIES = ["info", "warning", "critical"] as const;
export const FLOW_REVIEW_FILTERS = ["all", "issues", "needs-review", "approved"] as const;

export type FlowReviewStatus = (typeof FLOW_REVIEW_STATUSES)[number];
export type FlowIssueSeverity = (typeof FLOW_ISSUE_SEVERITIES)[number];
export type FlowReviewFilter = (typeof FLOW_REVIEW_FILTERS)[number];

const DEFAULT_REVIEW_STATUS: FlowReviewStatus = "untouched";
const DEFAULT_ISSUE_SEVERITY: FlowIssueSeverity = "info";

export interface FlowNodeData extends Record<string, unknown> {
  label?: string;
  url?: string;
  path?: string;
  screenshotUrl?: string;
  isGroup?: boolean;
  groupKey?: string;
  childCount?: number;
  expanded?: boolean;
  parentGroup?: string;
  reviewStatus?: FlowReviewStatus;
  issueSeverity?: FlowIssueSeverity;
  reviewNote?: string;
  onToggleGroup?: (groupKey: string) => void;
}

export interface FlowReviewSummary {
  all: number;
  untouched: number;
  reviewed: number;
  issues: number;
  approved: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isFlowReviewStatus(value: unknown): value is FlowReviewStatus {
  return typeof value === "string" && FLOW_REVIEW_STATUSES.includes(value as FlowReviewStatus);
}

export function isFlowIssueSeverity(value: unknown): value is FlowIssueSeverity {
  return typeof value === "string" && FLOW_ISSUE_SEVERITIES.includes(value as FlowIssueSeverity);
}

export function normalizeFlowNodeData(data: unknown): FlowNodeData {
  const base = isRecord(data) ? (data as FlowNodeData) : {};
  return {
    ...base,
    reviewStatus: isFlowReviewStatus(base.reviewStatus) ? base.reviewStatus : DEFAULT_REVIEW_STATUS,
    issueSeverity: isFlowIssueSeverity(base.issueSeverity) ? base.issueSeverity : DEFAULT_ISSUE_SEVERITY,
    reviewNote: typeof base.reviewNote === "string" ? base.reviewNote : "",
  };
}

export function hydrateFlowNode(node: Node, onToggleGroup?: (groupKey: string) => void): Node {
  const data = normalizeFlowNodeData(node.data);
  return {
    ...node,
    data: data.isGroup && onToggleGroup ? { ...data, onToggleGroup } : data,
  };
}

export function matchesFlowReviewFilter(node: Node, filter: FlowReviewFilter): boolean {
  const data = normalizeFlowNodeData(node.data);

  switch (filter) {
    case "issues":
      return data.reviewStatus === "issue";
    case "needs-review":
      return data.reviewStatus === "untouched";
    case "approved":
      return data.reviewStatus === "approved";
    case "all":
    default:
      return true;
  }
}

export function summarizeFlowNodes(nodes: Node[]): FlowReviewSummary {
  return nodes.reduce<FlowReviewSummary>(
    (summary, node) => {
      const data = normalizeFlowNodeData(node.data);

      summary.all += 1;
      switch (data.reviewStatus) {
        case "reviewed":
          summary.reviewed += 1;
          break;
        case "issue":
          summary.issues += 1;
          break;
        case "approved":
          summary.approved += 1;
          break;
        case "untouched":
        default:
          summary.untouched += 1;
          break;
      }

      return summary;
    },
    {
      all: 0,
      untouched: 0,
      reviewed: 0,
      issues: 0,
      approved: 0,
    }
  );
}

export function getFlowNodeTypeLabel(type?: string): string {
  switch (type) {
    case "page":
      return "Page";
    case "action":
      return "Action";
    case "condition":
      return "Condition";
    case "note":
      return "Note";
    default:
      return "Node";
  }
}

export function getFlowReviewStatusLabel(status: FlowReviewStatus): string {
  switch (status) {
    case "reviewed":
      return "Reviewed";
    case "issue":
      return "Issue";
    case "approved":
      return "Approved";
    case "untouched":
    default:
      return "Untouched";
  }
}

export function getFlowReviewFilterLabel(filter: FlowReviewFilter): string {
  switch (filter) {
    case "issues":
      return "Issues";
    case "needs-review":
      return "Needs Review";
    case "approved":
      return "Approved";
    case "all":
    default:
      return "All";
  }
}

export function getFlowIssueSeverityLabel(severity: FlowIssueSeverity): string {
  switch (severity) {
    case "warning":
      return "Warning";
    case "critical":
      return "Critical";
    case "info":
    default:
      return "Info";
  }
}

export function getFlowStatusBadgeClassName(status: FlowReviewStatus): string {
  switch (status) {
    case "reviewed":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200";
    case "issue":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200";
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
    case "untouched":
    default:
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
  }
}

export function getFlowStatusButtonClassName(status: FlowReviewStatus, active: boolean): string {
  const activeClasses = getFlowStatusBadgeClassName(status);
  return active
    ? `border ${activeClasses} shadow-sm`
    : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800";
}

export function getFlowSeverityBadgeClassName(severity: FlowIssueSeverity): string {
  switch (severity) {
    case "warning":
      return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200";
    case "critical":
      return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-200";
    case "info":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
  }
}

export function getFlowSeverityButtonClassName(severity: FlowIssueSeverity, active: boolean): string {
  const activeClasses = getFlowSeverityBadgeClassName(severity);
  return active
    ? `border ${activeClasses} shadow-sm`
    : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-800";
}

export function getFlowProxyBase(proxyUrl: string | null | undefined): string | null {
  if (!proxyUrl) {
    return null;
  }

  const match = proxyUrl.match(/^(.*?\/api\/proxy\/[^/]+\/)/);
  return match ? match[1] : null;
}

export function buildFlowPreviewUrl(proxyUrl: string | null | undefined, path?: string): string | null {
  const proxyBase = getFlowProxyBase(proxyUrl);
  if (!proxyBase) {
    return null;
  }

  if (!path || path === "/") {
    return proxyBase;
  }

  return `${proxyBase}${path.replace(/^\//, "")}`;
}