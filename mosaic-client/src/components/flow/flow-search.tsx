import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Node } from "@xyflow/react";
import {
  FLOW_REVIEW_FILTERS,
  type FlowReviewFilter,
  type FlowReviewSummary,
  getFlowReviewFilterLabel,
} from "@/lib/flow-review";

interface FlowSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  matchedNodes: Node[];
  onFocusNode: (nodeId: string) => void;
  reviewFilter: FlowReviewFilter;
  onReviewFilterChange: (filter: FlowReviewFilter) => void;
  reviewSummary: FlowReviewSummary;
}

export default function FlowSearch({
  query,
  onQueryChange,
  matchedNodes,
  onFocusNode,
  reviewFilter,
  onReviewFilterChange,
  reviewSummary,
}: FlowSearchProps) {
  const filterCounts: Record<FlowReviewFilter, number> = {
    all: reviewSummary.all,
    issues: reviewSummary.issues,
    "needs-review": reviewSummary.untouched,
    approved: reviewSummary.approved,
  };

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
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 px-2 py-2 flex flex-wrap gap-1.5">
        {FLOW_REVIEW_FILTERS.map((filter) => {
          const active = filter === reviewFilter;

          return (
            <button
              key={filter}
              onClick={() => onReviewFilterChange(filter)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors ${
                active
                  ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:bg-gray-700"
              }`}
            >
              <span>{getFlowReviewFilterLabel(filter)}</span>
              <span className={`rounded-full px-1.5 py-0.5 ${active ? "bg-white/20 text-white dark:bg-gray-900/15 dark:text-gray-900" : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300"}`}>
                {filterCounts[filter]}
              </span>
            </button>
          );
        })}
      </div>
      <div className="px-3 pb-2 text-[10px] text-gray-400 dark:text-gray-500">
        Reviewed {reviewSummary.reviewed} nodes so far.
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
