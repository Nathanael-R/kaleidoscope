import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Globe } from "lucide-react";

function PageNode({ data, selected }: NodeProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(String(data.label || "Page"));

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white shadow-sm min-w-[160px] ${
        selected ? "border-blue-500 shadow-blue-100" : "border-blue-200"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-blue-500 shrink-0" />
        {editing ? (
          <input
            className="text-sm font-medium bg-transparent border-b border-blue-300 outline-none w-full"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              setEditing(false);
              data.label = label;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setEditing(false);
                data.label = label;
              }
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
