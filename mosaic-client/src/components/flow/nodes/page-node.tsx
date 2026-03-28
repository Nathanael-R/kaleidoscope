import { memo, useState, useCallback } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Globe } from "lucide-react";
import {
  getFlowIssueSeverityLabel,
  getFlowReviewStatusLabel,
  getFlowSeverityBadgeClassName,
  getFlowStatusBadgeClassName,
  normalizeFlowNodeData,
} from "@/lib/flow-review";

function PageNode({ id, data, selected }: NodeProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(String(data.label || "Page"));
  const { setNodes } = useReactFlow();

  const nodeData = normalizeFlowNodeData(data);

  const isGroup = Boolean(nodeData.isGroup);
  const childCount = typeof nodeData.childCount === "number" ? nodeData.childCount : 0;
  const expanded = Boolean(nodeData.expanded);
  const path = typeof nodeData.path === "string" ? nodeData.path : "";
  const screenshotUrl = typeof nodeData.screenshotUrl === "string" ? nodeData.screenshotUrl : undefined;

  const commitLabel = useCallback(() => {
    setEditing(false);
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, label } } : n));
  }, [id, label, setNodes]);

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white dark:bg-gray-800 shadow-sm min-w-40 ${
        selected ? "border-blue-500 shadow-blue-100" : "border-blue-200 dark:border-blue-700"
      }`}
    >
      <Handle type="target" position={Position.Top} className="bg-blue-500! w-3! h-3!" />
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-blue-500 shrink-0" />
        {isGroup && childCount > 0 && (
          <button
            className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 text-blue-600"
            onClick={(event) => {
              event.stopPropagation();
              nodeData.onToggleGroup?.(String(nodeData.groupKey || ""));
            }}
            aria-label={expanded ? "Collapse group" : "Expand group"}
          >
            {expanded ? "-" : "+"} {childCount}
          </button>
        )}
        {editing ? (
          <input
            className="text-sm font-medium bg-transparent border-b border-blue-300 outline-none w-full"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitLabel();
            }}
            autoFocus
          />
        ) : (
          <span
            className="text-sm font-medium text-gray-800 dark:text-gray-200 cursor-text"
            onDoubleClick={() => setEditing(true)}
          >
            {label}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getFlowStatusBadgeClassName(nodeData.reviewStatus || "untouched")}`}>
          {getFlowReviewStatusLabel(nodeData.reviewStatus || "untouched")}
        </span>
        {nodeData.reviewStatus === "issue" && (
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getFlowSeverityBadgeClassName(nodeData.issueSeverity || "info")}`}>
            {getFlowIssueSeverityLabel(nodeData.issueSeverity || "info")}
          </span>
        )}
      </div>
      {path && (
        <div className="mt-2 truncate text-[10px] text-gray-400 dark:text-gray-500">{path}</div>
      )}
      {screenshotUrl && (
        <div className="mt-3 overflow-hidden rounded-md border border-blue-100 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <img
            src={screenshotUrl}
            alt=""
            className="h-14 w-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="bg-blue-500! w-3! h-3!" />
    </div>
  );
}

export default memo(PageNode);
