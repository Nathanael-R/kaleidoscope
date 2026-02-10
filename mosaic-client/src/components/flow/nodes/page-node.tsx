import { memo, useState, useCallback } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Globe } from "lucide-react";

function PageNode({ id, data, selected }: NodeProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(String(data.label || "Page"));
  const { setNodes } = useReactFlow();

  const isGroup = Boolean(data?.isGroup);
  const childCount = typeof data?.childCount === "number" ? data.childCount : 0;
  const expanded = Boolean(data?.expanded);

  const commitLabel = useCallback(() => {
    setEditing(false);
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, label } } : n));
  }, [id, label, setNodes]);

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white shadow-sm min-w-[160px] ${
        selected ? "border-blue-500 shadow-blue-100" : "border-blue-200"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-blue-500 shrink-0" />
        {isGroup && childCount > 0 && (
          <button
            className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 text-blue-600"
            onClick={(event) => {
              event.stopPropagation();
              data?.onToggleGroup?.(data?.groupKey);
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
            className="text-sm font-medium text-gray-800 cursor-text"
            onDoubleClick={() => setEditing(true)}
          >
            {label}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3 !h-3" />
    </div>
  );
}

export default memo(PageNode);
