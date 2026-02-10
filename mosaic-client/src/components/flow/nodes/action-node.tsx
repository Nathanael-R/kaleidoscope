import { memo, useState, useCallback } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";

function ActionNode({ id, data, selected }: NodeProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(String(data.label || "Action"));
  const { setNodes } = useReactFlow();

  const commitLabel = useCallback(() => {
    setEditing(false);
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, label } } : n));
  }, [id, label, setNodes]);

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white dark:bg-gray-800 shadow-sm min-w-[160px] ${
        selected ? "border-amber-500 shadow-amber-100" : "border-amber-200 dark:border-amber-700"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-500 shrink-0" />
        {editing ? (
          <input
            className="text-sm font-medium bg-transparent border-b border-amber-300 outline-none w-full"
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
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500 !w-3 !h-3" />
    </div>
  );
}

export default memo(ActionNode);
