import { memo, useState, useCallback } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { StickyNote } from "lucide-react";

function NoteNode({ id, data, selected }: NodeProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(String(data.label || "Note"));
  const { setNodes } = useReactFlow();

  const commitLabel = useCallback(() => {
    setEditing(false);
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, label } } : n));
  }, [id, label, setNodes]);

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-yellow-50 dark:bg-yellow-900/30 shadow-sm min-w-[140px] max-w-[240px] ${
        selected ? "border-yellow-500 shadow-yellow-100" : "border-yellow-200 dark:border-yellow-700"
      }`}
    >
      <div className="flex items-start gap-2">
        <StickyNote className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
        {editing ? (
          <textarea
            className="text-xs bg-transparent border-b border-yellow-300 outline-none w-full resize-none"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            rows={3}
            autoFocus
          />
        ) : (
          <span
            className="text-xs text-gray-700 dark:text-gray-300 cursor-text whitespace-pre-wrap"
            onDoubleClick={() => setEditing(true)}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(NoteNode);
