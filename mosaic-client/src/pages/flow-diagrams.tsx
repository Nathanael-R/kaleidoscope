import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  type ReactFlowInstance,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import Header from "@/components/header";
import FlowSidebar, { type CrawlOptions } from "@/components/flow/flow-sidebar";
import FlowSearch from "@/components/flow/flow-search";
import PageNode from "@/components/flow/nodes/page-node";
import ActionNode from "@/components/flow/nodes/action-node";
import ConditionNode from "@/components/flow/nodes/condition-node";
import NoteNode from "@/components/flow/nodes/note-node";
import { useFlowStorage } from "@/hooks/use-flow-storage";
import { usePreviewStore } from "@/store/preview-store";
import { Button } from "@/components/ui/button";
import { ExternalLink, Globe, Loader2, RefreshCw, X } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
const DEFAULT_LOCALE_PREFIXES = [
  "en", "fr", "es", "de", "it", "pt", "nl", "ru", "zh", "ja", "ko", "ar",
];

const DEFAULT_CRAWL_OPTIONS: CrawlOptions = {
  depth: 1,
  maxLinksPerPage: 15,
  includeHash: true,
  includeQuery: true,
  localePrefixBlocklist: DEFAULT_LOCALE_PREFIXES,
};

const nodeTypes: NodeTypes = {
  page: PageNode,
  action: ActionNode,
  condition: ConditionNode,
  note: NoteNode,
};

const defaultEdgeOptions = {
  animated: true,
  style: { strokeWidth: 2 },
};

interface CrawlPageInfo {
  url: string;
  path: string;
  title: string;
  links: string[];
  error?: string;
}

interface CrawlResult {
  startUrl: string;
  pages: CrawlPageInfo[];
  sitemapUrls: string[];
}

/** Layout discovered pages as a tree: root at top, children fanning out below */
function layoutPages(
  crawlResult: CrawlResult,
  expandedGroups: Set<string>,
  onToggleGroup: (groupKey: string) => void
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeIdMap = new Map<string, string>(); // path -> nodeId
  let idCounter = 0;

  const origin = (() => {
    try {
      return new URL(crawlResult.startUrl).origin;
    } catch {
      return "";
    }
  })();

  const hostname = (() => {
    try {
      return new URL(crawlResult.startUrl).hostname;
    } catch {
      return "";
    }
  })();

  const normalizePath = (path: string | undefined) => {
    if (!path) return "/";
    if (path.startsWith("/")) return path || "/";
    return `/${path}`;
  };

  const stripQueryHash = (path: string) => {
    const queryIndex = path.indexOf("?");
    const hashIndex = path.indexOf("#");
    const cutIndex = Math.min(
      queryIndex === -1 ? path.length : queryIndex,
      hashIndex === -1 ? path.length : hashIndex
    );
    return path.slice(0, cutIndex) || "/";
  };

  const getGroupKey = (pathKey: string) => {
    const basePath = stripQueryHash(pathKey);
    if (basePath === "/") return "/";
    const segments = basePath.split("/").filter(Boolean);
    return segments.length > 0 ? `/${segments[0]}` : "/";
  };

  const titleCase = (value: string) => {
    return value
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const labelFromPath = (pathKey: string) => {
    const basePath = stripQueryHash(pathKey);
    if (basePath === "/" || basePath === "") {
      return hostname || basePath || "/";
    }
    const segments = basePath.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1] || basePath;
    return titleCase(lastSegment);
  };

  const pathToUrl = new Map<string, string>();
  const basePathToUrl = new Map<string, string>();
  for (const page of crawlResult.pages) {
    const normalized = normalizePath(page.path);
    const basePath = stripQueryHash(normalized);
    pathToUrl.set(normalized, page.url);
    if (!basePathToUrl.has(basePath) || normalized === basePath) {
      basePathToUrl.set(basePath, page.url);
    }
  }
  for (const sitemapUrl of crawlResult.sitemapUrls) {
    try {
      const parsed = new URL(sitemapUrl);
      const normalized = normalizePath(parsed.pathname);
      const basePath = stripQueryHash(normalized);
      pathToUrl.set(normalized, parsed.toString());
      if (!basePathToUrl.has(basePath)) {
        basePathToUrl.set(basePath, parsed.toString());
      }
    } catch {
      // ignore
    }
  }

  function nextId() {
    return `node_${++idCounter}`;
  }

  // Build a set of all discovered paths for cross-referencing
  const allPaths = new Set(crawlResult.pages.map(p => normalizePath(p.path)));

  // Also include sitemap paths
  for (const sitemapUrl of crawlResult.sitemapUrls) {
    try {
      const parsed = new URL(sitemapUrl);
      allPaths.add(normalizePath(parsed.pathname));
    } catch {
      // ignore
    }
  }

  // Create the root node (the crawl start page)
  const rootPage = crawlResult.pages[0];
  if (!rootPage && crawlResult.sitemapUrls.length === 0) return { nodes, edges };

  const rootPath = rootPage
    ? normalizePath(rootPage.path)
    : (() => {
        try {
          return normalizePath(new URL(crawlResult.startUrl).pathname);
        } catch {
          return "/";
        }
      })();

  const rootUrl = rootPage?.url || crawlResult.startUrl;

  const rootId = nextId();
  nodeIdMap.set(rootPath, rootId);
  nodes.push({
    id: rootId,
    type: "page",
    position: { x: 0, y: 0 },
    data: {
      label: labelFromPath(rootPath),
      url: rootUrl,
      path: rootPath,
    },
  });

  // Collect all unique child paths (linked from the root)
  const childPaths = new Set<string>();
  if (rootPage) {
    for (const link of rootPage.links) {
      const normalized = normalizePath(link);
      if (normalized !== rootPath) {
        childPaths.add(normalized);
      }
    }
  }

  // Add pages discovered from deeper crawl levels
  for (const page of crawlResult.pages.slice(1)) {
    childPaths.add(normalizePath(page.path));
  }

  // Add sitemap-only pages not already in childPaths
  for (const path of allPaths) {
    if (path !== rootPath) {
      childPaths.add(path);
    }
  }

  const groupedPaths = new Map<string, Set<string>>();
  for (const pathKey of childPaths) {
    const groupKey = getGroupKey(pathKey);
    if (groupKey === rootPath) continue;
    if (!groupedPaths.has(groupKey)) {
      groupedPaths.set(groupKey, new Set());
    }
    groupedPaths.get(groupKey)!.add(pathKey);
  }

  // Layout children in a grid below the root
  const sortedGroups = [...groupedPaths.keys()].sort();
  const cols = Math.min(sortedGroups.length, 5);
  const colWidth = 250;
  const rowHeight = 150;
  const startX = -((cols - 1) * colWidth) / 2;

  sortedGroups.forEach((groupKey, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const nodeId = nextId();
    nodeIdMap.set(groupKey, nodeId);

    const basePath = stripQueryHash(groupKey);
    const label = labelFromPath(groupKey);
    const url = basePathToUrl.get(basePath) || (origin ? `${origin}${basePath}` : basePath);
    const children = groupedPaths.get(groupKey) || new Set();
    const expanded = expandedGroups.has(groupKey);

    nodes.push({
      id: nodeId,
      type: "page",
      position: {
        x: startX + col * colWidth,
        y: 200 + row * rowHeight,
      },
      data: {
        label,
        url,
        path: groupKey,
        isGroup: true,
        groupKey,
        childCount: children.size,
        expanded,
        onToggleGroup,
      },
    });

    // Edge from root to this child
    edges.push({
      id: `edge_${rootId}_${nodeId}`,
      source: rootId,
      target: nodeId,
      animated: true,
    });

    if (expanded) {
      const sortedChildren = [...children].sort();
      const childStartX = startX + col * colWidth - ((sortedChildren.length - 1) * 200) / 2;
      sortedChildren.forEach((pathKey, childIndex) => {
        const childId = nextId();
        nodeIdMap.set(pathKey, childId);
        const childBase = stripQueryHash(pathKey);
        const childUrl = pathToUrl.get(pathKey) || basePathToUrl.get(childBase) || (origin ? `${origin}${childBase}` : childBase);
        nodes.push({
          id: childId,
          type: "page",
          position: {
            x: childStartX + childIndex * 200,
            y: 200 + row * rowHeight + 150,
          },
          data: {
            label: labelFromPath(pathKey),
            url: childUrl,
            path: pathKey,
            parentGroup: groupKey,
          },
        });
        edges.push({
          id: `edge_${nodeId}_${childId}`,
          source: nodeId,
          target: childId,
          animated: true,
          style: { strokeWidth: 1, strokeDasharray: "4 4" },
        });
      });
    }
  });

  // Add cross-links between crawled pages (depth > 0 results)
  for (const page of crawlResult.pages.slice(1)) {
    const sourceKey = normalizePath(page.path);
    const sourceId = nodeIdMap.get(sourceKey) || nodeIdMap.get(getGroupKey(sourceKey));
    if (!sourceId) continue;

    for (const link of page.links) {
      const normalized = normalizePath(link);
      if (normalized === normalizePath(page.path)) continue; // skip self-links
      const targetId = nodeIdMap.get(normalized) || nodeIdMap.get(getGroupKey(normalized));
      if (!targetId) continue;

      const edgeId = `edge_${sourceId}_${targetId}`;
      if (!edges.some(e => e.id === edgeId)) {
        edges.push({
          id: edgeId,
          source: sourceId,
          target: targetId,
          animated: true,
          style: { strokeWidth: 1, strokeDasharray: '5 5' },
        });
      }
    }
  }

  return { nodes, edges };
}

function FlowEditor() {
  const { savedFlows, saveFlow, loadFlow, deleteFlow, exportFlows, importFlows } = useFlowStorage();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [flowName, setFlowName] = useState("Untitled Flow");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [selectedPage, setSelectedPage] = useState<{ url: string; label: string; path: string } | null>(null);
  const [hoveredPage, setHoveredPage] = useState<{ url: string; label: string; path: string } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [crawlOptions, setCrawlOptions] = useState<CrawlOptions>(DEFAULT_CRAWL_OPTIONS);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const nodeIdCounterRef = useRef(0);
  const lastCrawlResultRef = useRef<CrawlResult | null>(null);

  // Crawl state
  const { currentUrl, proxyUrl } = usePreviewStore();
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const hasAutoDiscoveredRef = useRef<string | null>(null);

  function getNextId() {
    return `node_${++nodeIdCounterRef.current}`;
  }

  const handleToggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const discoverPages = useCallback(async (url: string, options: CrawlOptions = crawlOptions) => {
    setCrawling(true);
    setCrawlError(null);

    try {
      const res = await fetch(`${API_BASE}/api/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          depth: options.depth,
          maxLinksPerPage: options.maxLinksPerPage,
          includeHash: options.includeHash,
          includeQuery: options.includeQuery,
          localePrefixBlocklist: options.localePrefixBlocklist,
          proxyUrl: proxyUrl || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error: string };
        throw new Error(err.error || 'Crawl failed');
      }

      const result = await res.json() as CrawlResult;

      if (result.pages.length === 0 && result.sitemapUrls.length === 0) {
        setCrawlError('No pages discovered. The site may not have any navigable links.');
        return;
      }

      const nextExpandedGroups = new Set<string>();
      const { nodes: newNodes, edges: newEdges } = layoutPages(result, nextExpandedGroups, handleToggleGroup);

      setNodes(newNodes);
      setEdges(newEdges);
      setSelectedPage(null);
      setHoveredPage(null);
      setExpandedGroups(nextExpandedGroups);
      lastCrawlResultRef.current = result;

      // Update ID counter to avoid collisions with manual additions
      nodeIdCounterRef.current = newNodes.length;

      // Set flow name from the URL
      try {
        const parsed = new URL(url);
        setFlowName(`${parsed.hostname} Site Map`);
      } catch {
        setFlowName('Discovered Flow');
      }

      hasAutoDiscoveredRef.current = url;

      // Fit view after nodes are rendered
      setTimeout(() => {
        reactFlowInstance?.fitView({ padding: 0.3, duration: 500 });
      }, 100);
    } catch (error) {
      setCrawlError(error instanceof Error ? error.message : 'Failed to discover pages');
    } finally {
      setCrawling(false);
    }
  }, [setNodes, setEdges, reactFlowInstance, setSelectedPage, setHoveredPage, proxyUrl, crawlOptions, handleToggleGroup]);

  // Auto-discover pages when the component mounts with a URL
  useEffect(() => {
    if (!currentUrl || hasAutoDiscoveredRef.current === currentUrl) return;
    // Only auto-discover if canvas is empty (don't overwrite manual work)
    if (nodes.length > 0) return;

    discoverPages(currentUrl, crawlOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUrl, discoverPages]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, animated: true }, eds));
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");
      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const labelMap: Record<string, string> = {
        page: "New Page",
        action: "New Action",
        condition: "Condition?",
        note: "Note",
      };

      const newNode: Node = {
        id: getNextId(),
        type,
        position,
        data: { label: labelMap[type] || "Node" },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes]
  );

  // Search / spotlight
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (!query.trim()) {
        setHighlightedNodes(new Set());
        return;
      }
      const lowerQuery = query.toLowerCase();
      const matched = new Set<string>();
      for (const node of nodes) {
        const label = String(node.data?.label || "").toLowerCase();
        if (label.includes(lowerQuery)) {
          matched.add(node.id);
        }
      }
      setHighlightedNodes(matched);
    },
    [nodes]
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node && reactFlowInstance) {
        reactFlowInstance.fitView({
          nodes: [node],
          duration: 400,
          padding: 2,
        });
      }
    },
    [nodes, reactFlowInstance]
  );

  // Apply highlight styling
  const styledNodes = useMemo(() => {
    if (highlightedNodes.size === 0) return nodes;
    return nodes.map((node) => ({
      ...node,
      style: {
        ...node.style,
        opacity: highlightedNodes.has(node.id) ? 1 : 0.25,
        transition: "opacity 0.3s",
      },
    }));
  }, [nodes, highlightedNodes]);

  const styledEdges = useMemo(() => {
    if (highlightedNodes.size === 0) return edges;
    return edges.map((edge) => ({
      ...edge,
      style: {
        ...edge.style,
        opacity:
          highlightedNodes.has(edge.source) || highlightedNodes.has(edge.target)
            ? 1
            : 0.15,
        transition: "opacity 0.3s",
      },
    }));
  }, [edges, highlightedNodes]);

  // Save / load
  const handleSave = useCallback(() => {
    saveFlow(flowName, nodes, edges);
  }, [flowName, nodes, edges, saveFlow]);

  const handleLoad = useCallback(
    (name: string) => {
      const flow = loadFlow(name);
      if (flow) {
        setNodes(flow.nodes);
        setEdges(flow.edges);
        setFlowName(name);
        const maxId = flow.nodes.reduce((max, n) => {
          const num = parseInt(n.id.replace("node_", ""), 10);
          return isNaN(num) ? max : Math.max(max, num);
        }, 0);
        nodeIdCounterRef.current = maxId;
      }
    },
    [loadFlow, setNodes, setEdges]
  );

  const handleExport = useCallback(() => {
    const json = exportFlows();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kaleidoscope-flows.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [exportFlows]);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      importFlows(text);
    };
    input.click();
  }, [importFlows]);

  const handleClear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    hasAutoDiscoveredRef.current = null;
    setSelectedPage(null);
    setHoveredPage(null);
    setExpandedGroups(new Set());
    lastCrawlResultRef.current = null;
  }, [setNodes, setEdges, setSelectedPage, setHoveredPage]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const url = typeof node.data?.url === "string" ? node.data.url : "";
    if (!url) return;
    const label = String(node.data?.label || url);
    const path = typeof node.data?.path === "string" ? node.data.path : "";
    setSelectedPage({ url, label, path });
    setHoveredPage(null);
  }, []);

  const handleNodeHover = useCallback((_event: React.MouseEvent, node: Node) => {
    const url = typeof node.data?.url === "string" ? node.data.url : "";
    if (!url) return;
    const label = String(node.data?.label || url);
    const path = typeof node.data?.path === "string" ? node.data.path : "";
    setHoveredPage({ url, label, path });
  }, []);

  const handleNodeHoverEnd = useCallback(() => {
    setHoveredPage(null);
  }, []);

  useEffect(() => {
    if (!lastCrawlResultRef.current) return;
    const { nodes: newNodes, edges: newEdges } = layoutPages(
      lastCrawlResultRef.current,
      expandedGroups,
      handleToggleGroup
    );
    setNodes(newNodes);
    setEdges(newEdges);
    nodeIdCounterRef.current = newNodes.length;
  }, [expandedGroups, handleToggleGroup, setNodes, setEdges]);

  const matchedNodes = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return nodes.filter((n) => highlightedNodes.has(n.id));
  }, [nodes, searchQuery, highlightedNodes]);

  return (
    <div className="bg-gray-50">
      <Header />
      <div className="flex h-screen pt-16">
        <FlowSidebar
          flowName={flowName}
          onFlowNameChange={setFlowName}
          onSave={handleSave}
          onClear={handleClear}
          onExport={handleExport}
          onImport={handleImport}
          savedFlows={savedFlows}
          onLoadFlow={handleLoad}
          onDeleteFlow={deleteFlow}
          onGenerateFromUrl={discoverPages}
          crawlOptions={crawlOptions}
          onCrawlOptionsChange={setCrawlOptions}
        />
        <div className="flex-1 relative" ref={reactFlowWrapper}>
          {/* Discover Pages banner — shows when URL is loaded but canvas is empty */}
          {currentUrl && nodes.length === 0 && !crawling && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-4 flex items-center gap-3 max-w-lg">
              <Globe className="w-5 h-5 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Discover site pages</p>
                <p className="text-xs text-gray-500 truncate">{currentUrl}</p>
                {crawlError && (
                  <p className="text-xs text-red-600 mt-1">{crawlError}</p>
                )}
              </div>
              <Button
                size="sm"
                onClick={() => discoverPages(currentUrl, crawlOptions)}
                disabled={crawling}
              >
                <Globe className="w-4 h-4 mr-1" />
                Discover
              </Button>
            </div>
          )}

          {/* Crawling indicator */}
          {crawling && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white border border-blue-200 rounded-lg shadow-lg p-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <div>
                <p className="text-sm font-medium text-gray-900">Discovering pages...</p>
                <p className="text-xs text-gray-500">Loading site and extracting navigation links</p>
              </div>
            </div>
          )}

          {/* Re-discover button when flow is populated */}
          {currentUrl && nodes.length > 0 && !crawling && (
            <div className="absolute top-4 right-4 z-10">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleClear();
                  discoverPages(currentUrl, crawlOptions);
                }}
                className="bg-white shadow-sm"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Re-discover
              </Button>
            </div>
          )}

          <ReactFlow
            nodes={styledNodes}
            edges={styledEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeClick={handleNodeClick}
            onNodeMouseEnter={handleNodeHover}
            onNodeMouseLeave={handleNodeHoverEnd}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background gap={20} size={1} />
            <Controls />
            <MiniMap
              nodeStrokeWidth={3}
              pannable
              zoomable
            />
            <Panel position="top-center">
              <FlowSearch
                query={searchQuery}
                onQueryChange={handleSearch}
                matchedNodes={matchedNodes}
                onFocusNode={focusNode}
              />
            </Panel>
            {hoveredPage && !selectedPage && (
              <Panel position="bottom-right">
                <div className="w-72 h-44 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 text-[10px] font-medium text-gray-700 truncate">
                    {hoveredPage.label}
                  </div>
                  <iframe
                    title={`Preview of ${hoveredPage.url}`}
                    src={(() => {
                      const proxyBase = proxyUrl ? proxyUrl.replace(/\/$/, "") : "";
                      if (proxyBase && hoveredPage.path) {
                        return `${proxyBase}${hoveredPage.path}`;
                      }
                      return hoveredPage.url;
                    })()}
                    className="w-full h-[calc(100%-30px)] border-0"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                </div>
              </Panel>
            )}
          </ReactFlow>
          {selectedPage && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white w-[90vw] h-[80vh] max-w-5xl rounded-xl shadow-2xl overflow-hidden border border-gray-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                  <div className="text-sm font-semibold text-gray-800 truncate">
                    {selectedPage.label}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        const proxyBase = proxyUrl ? proxyUrl.replace(/\/$/, "") : "";
                        const previewUrl = proxyBase && selectedPage.path
                          ? `${proxyBase}${selectedPage.path}`
                          : selectedPage.url;
                        window.open(previewUrl, "_blank", "noopener,noreferrer");
                      }}
                      aria-label="Open in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setSelectedPage(null)}
                      aria-label="Close preview"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <iframe
                  title={`Preview of ${selectedPage.url}`}
                  src={(() => {
                    const proxyBase = proxyUrl ? proxyUrl.replace(/\/$/, "") : "";
                    if (proxyBase && selectedPage.path) {
                      return `${proxyBase}${selectedPage.path}`;
                    }
                    return selectedPage.url;
                  })()}
                  className="w-full h-[calc(100%-56px)] border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FlowDiagrams() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );
}
