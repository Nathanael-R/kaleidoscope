import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitBranch } from "lucide-react";

function ConditionNode({ data, selected }: NodeProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(String(data.label || "Condition?"));

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white shadow-sm min-w-[160px] ${
        selected ? "border-purple-500 shadow-purple-100" : "border-purple-200"
      }`}
      style={{ transform: "rotate(0deg)" }}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-3 !h-3" />
      <div className="flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-purple-500 shrink-0" />
        {editing ? (
          <input
            className="text-sm font-medium bg-transparent border-b border-purple-300 outline-none w-full"
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
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        className="!bg-green-500 !w-3 !h-3"
        style={{ left: "30%" }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        className="!bg-red-500 !w-3 !h-3"
        style={{ left: "70%" }}
      />
      <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
        <span>Yes</span>
        <span>No</span>
      </div>
    </div>
  );
}

export default memo(ConditionNode);
