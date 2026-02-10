import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Globe,
  Zap,
  GitBranch,
  StickyNote,
  Save,
  Download,
  Upload,
  Trash2,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";

export interface CrawlOptions {
  depth: number;
  maxLinksPerPage: number;
  includeHash: boolean;
  includeQuery: boolean;
  localePrefixBlocklist: string[];
}

interface FlowSidebarProps {
  flowName: string;
  onFlowNameChange: (name: string) => void;
  onSave: () => void;
  onClear: () => void;
  onExport: () => void;
  onImport: () => void;
  savedFlows: string[];
  onLoadFlow: (name: string) => void;
  onDeleteFlow: (name: string) => void;
  onGenerateFromUrl?: (url: string, options: CrawlOptions) => Promise<void>;
  crawlOptions: CrawlOptions;
  onCrawlOptionsChange: (options: CrawlOptions) => void;
}

const NODE_TYPES = [
  {
    type: "page",
    label: "Page",
    icon: Globe,
    color: "blue",
    description: "A page or screen in the flow",
  },
  {
    type: "action",
    label: "Action",
    icon: Zap,
    color: "amber",
    description: "A user action or API call",
  },
  {
    type: "condition",
    label: "Condition",
    icon: GitBranch,
    color: "purple",
    description: "A branching decision point",
  },
  {
    type: "note",
    label: "Note",
    icon: StickyNote,
    color: "yellow",
    description: "An annotation or comment",
  },
] as const;

const colorMap: Record<string, string> = {
  blue: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100",
  amber: "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100",
  purple: "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100",
  yellow: "bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100",
};

export default function FlowSidebar({
  flowName,
  onFlowNameChange,
  onSave,
  onClear,
  onExport,
  onImport,
  savedFlows,
  onLoadFlow,
  onDeleteFlow,
  onGenerateFromUrl,
  crawlOptions,
  onCrawlOptionsChange,
}: FlowSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [localeInput, setLocaleInput] = useState(crawlOptions.localePrefixBlocklist.join(", "));

  useEffect(() => {
    setLocaleInput(crawlOptions.localePrefixBlocklist.join(", "));
  }, [crawlOptions.localePrefixBlocklist]);

  const handleCrawl = async () => {
    if (!crawlUrl.trim() || !onGenerateFromUrl) return;
    let finalUrl = crawlUrl.trim();
    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = "https://" + finalUrl;
    }
    setCrawling(true);
    setCrawlError(null);
    try {
      await onGenerateFromUrl(finalUrl, crawlOptions);
    } catch (err) {
      setCrawlError(err instanceof Error ? err.message : "Crawl failed");
    } finally {
      setCrawling(false);
    }
  };

  const updateOption = <K extends keyof CrawlOptions>(key: K, value: CrawlOptions[K]) => {
    onCrawlOptionsChange({
      ...crawlOptions,
      [key]: value,
    });
  };

  const handleLocaleChange = (value: string) => {
    setLocaleInput(value);
    const parsed = value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    updateOption("localePrefixBlocklist", parsed);
  };

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  if (collapsed) {
    return (
      <aside className="w-12 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(false)}
          className="w-8 h-8 p-0 mb-4"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        {NODE_TYPES.map((nt) => (
          <div
            key={nt.type}
            className="w-8 h-8 flex items-center justify-center rounded cursor-grab mb-2 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            draggable
            onDragStart={(e) => onDragStart(e, nt.type)}
            title={nt.label}
          >
            <nt.icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </div>
        ))}
      </aside>
    );
  }

  return (
    <aside className="w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Flow Editor</h2>
          <Link href="/" className="text-xs text-blue-600 hover:underline">
            Back to Preview
          </Link>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(true)}
          className="w-8 h-8 p-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* Flow Name */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400 dark:text-gray-300 mb-1 block">Flow Name</Label>
        <Input
          value={flowName}
          onChange={(e) => onFlowNameChange(e.target.value)}
          className="h-8 text-sm"
          placeholder="My User Flow"
        />
      </div>

      {/* Generate from URL */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400 dark:text-gray-300 mb-1 block">
          Generate from URL
        </Label>
        <div className="flex gap-1.5">
          <Input
            value={crawlUrl}
            onChange={(e) => setCrawlUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCrawl()}
            placeholder="https://example.com"
            className="h-8 text-sm flex-1"
            disabled={crawling}
          />
          <Button
            variant="default"
            size="sm"
            onClick={handleCrawl}
            disabled={crawling || !crawlUrl.trim()}
            className="h-8 px-2"
          >
            {crawling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
        {crawling && (
          <p className="text-[10px] text-blue-600 mt-1">Crawling site pages...</p>
        )}
        {crawlError && (
          <p className="text-[10px] text-red-600 mt-1">{crawlError}</p>
        )}
        <p className="text-[10px] text-gray-400 mt-1">
          Enter a URL to auto-generate a site flow
        </p>
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-medium text-gray-500">Depth</Label>
            <Input
              type="number"
              min={0}
              max={3}
              value={crawlOptions.depth}
              onChange={(e) => updateOption("depth", Number(e.target.value))}
              className="h-7 w-16 text-xs"
              disabled={crawling}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-medium text-gray-500">Max links/page</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={crawlOptions.maxLinksPerPage}
              onChange={(e) => updateOption("maxLinksPerPage", Number(e.target.value))}
              className="h-7 w-16 text-xs"
              disabled={crawling}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[10px] text-gray-500">
              <input
                type="checkbox"
                checked={crawlOptions.includeQuery}
                onChange={(e) => updateOption("includeQuery", e.target.checked)}
                disabled={crawling}
              />
              Include query
            </label>
            <label className="flex items-center gap-2 text-[10px] text-gray-500">
              <input
                type="checkbox"
                checked={crawlOptions.includeHash}
                onChange={(e) => updateOption("includeHash", e.target.checked)}
                disabled={crawling}
              />
              Include hash
            </label>
          </div>
          <div>
            <Label className="text-[10px] font-medium text-gray-500">Locale prefixes</Label>
            <Input
              value={localeInput}
              onChange={(e) => handleLocaleChange(e.target.value)}
              placeholder="en, fr, es"
              className="h-7 text-xs mt-1"
              disabled={crawling}
            />
          </div>
        </div>
      </div>

      {/* Node Palette */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400 dark:text-gray-300 mb-2 block">
          Drag nodes onto the canvas
        </Label>
        <div className="space-y-2">
          {NODE_TYPES.map((nt) => (
            <div
              key={nt.type}
              className={`flex items-center gap-3 px-3 py-2 rounded-md border cursor-grab transition-colors ${colorMap[nt.color]}`}
              draggable
              onDragStart={(e) => onDragStart(e, nt.type)}
            >
              <nt.icon className="w-4 h-4 shrink-0" />
              <div>
                <div className="text-sm font-medium">{nt.label}</div>
                <div className="text-[10px] opacity-70">{nt.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 space-y-2">
        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400 dark:text-gray-300 mb-1 block">Actions</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={onSave} className="text-xs h-8">
            <Save className="w-3 h-3 mr-1" /> Save
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            className="text-xs h-8 text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-3 h-3 mr-1" /> Clear
          </Button>
          <Button variant="outline" size="sm" onClick={onExport} className="text-xs h-8">
            <Download className="w-3 h-3 mr-1" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={onImport} className="text-xs h-8">
            <Upload className="w-3 h-3 mr-1" /> Import
          </Button>
        </div>
      </div>

      {/* Saved Flows */}
      <div className="px-4 py-3 flex-1">
        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400 dark:text-gray-300 mb-2 block">
          Saved Flows ({savedFlows.length})
        </Label>
        {savedFlows.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">No saved flows yet. Create one and click Save.</p>
        ) : (
          <div className="space-y-1.5">
            {savedFlows.map((name) => (
              <div
                key={name}
                className="flex items-center justify-between p-2 rounded-md bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 group"
              >
                <button
                  onClick={() => onLoadFlow(name)}
                  className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 hover:text-gray-900 truncate flex-1 text-left"
                >
                  <FolderOpen className="w-3 h-3 shrink-0" />
                  <span className="truncate">{name}</span>
                </button>
                <button
                  onClick={() => onDeleteFlow(name)}
                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <p className="text-[10px] text-gray-500 leading-relaxed">
          <strong>Tips:</strong> Drag nodes from the palette. Connect by dragging between handles.
          Double-click a node label to edit. Press Delete to remove selected elements.
        </p>
      </div>
    </aside>
  );
}
