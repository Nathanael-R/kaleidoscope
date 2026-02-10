import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Node } from "@xyflow/react";

interface FlowSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  matchedNodes: Node[];
  onFocusNode: (nodeId: string) => void;
}

export default function FlowSearch({
  query,
  onQueryChange,
  matchedNodes,
  onFocusNode,
}: FlowSearchProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 w-80">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search nodes... (Spotlight)"
          className="pl-9 pr-8 h-9 text-sm border-0 focus-visible:ring-0 rounded-b-none"
        />
        {query && (
          <button
            onClick={() => onQueryChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {query && matchedNodes.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 max-h-48 overflow-y-auto">
          {matchedNodes.map((node) => (
            <button
              key={node.id}
              onClick={() => onFocusNode(node.id)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-gray-700 flex items-center justify-between"
            >
              <span className="text-gray-700 dark:text-gray-300 truncate">{String(node.data?.label)}</span>
              <span className="text-gray-400 dark:text-gray-500 text-[10px] shrink-0 ml-2">{node.type}</span>
            </button>
          ))}
        </div>
      )}
      {query && matchedNodes.length === 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
          No nodes match "{query}"
        </div>
      )}
    </div>
  );
}
