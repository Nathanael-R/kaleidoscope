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
import FlowSidebar from "@/components/flow/flow-sidebar";
import FlowSearch from "@/components/flow/flow-search";
import PageNode from "@/components/flow/nodes/page-node";
import ActionNode from "@/components/flow/nodes/action-node";
import ConditionNode from "@/components/flow/nodes/condition-node";
import NoteNode from "@/components/flow/nodes/note-node";
import { useFlowStorage } from "@/hooks/use-flow-storage";
import { usePreviewStore } from "@/store/preview-store";
import { Button } from "@/components/ui/button";
import { Loader2, Globe, RefreshCw } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

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
function layoutPages(crawlResult: CrawlResult): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeIdMap = new Map<string, string>(); // path -> nodeId
  let idCounter = 0;

  function nextId() {
    return `node_${++idCounter}`;
  }

  // Build a set of all discovered paths for cross-referencing
  const allPaths = new Set(crawlResult.pages.map(p => p.path));

  // Also include sitemap paths
  for (const sitemapUrl of crawlResult.sitemapUrls) {
    try {
      const parsed = new URL(sitemapUrl);
      allPaths.add(parsed.pathname);
    } catch {
      // ignore
    }
  }

  // Create the root node (the crawl start page)
  const rootPage = crawlResult.pages[0];
  if (!rootPage) return { nodes, edges };

  const rootId = nextId();
  nodeIdMap.set(rootPage.path, rootId);
  nodes.push({
    id: rootId,
    type: "page",
    position: { x: 0, y: 0 },
    data: { label: rootPage.title || rootPage.path },
  });

  // Collect all unique child paths (linked from the root)
  const childPaths = new Set<string>();
  for (const link of rootPage.links) {
    if (link !== rootPage.path) {
      childPaths.add(link);
    }
  }

  // Add pages discovered from deeper crawl levels
  for (const page of crawlResult.pages.slice(1)) {
    childPaths.add(page.path);
  }

  // Add sitemap-only pages not already in childPaths
  for (const path of allPaths) {
    if (path !== rootPage.path) {
      childPaths.add(path);
    }
  }

  // Layout children in a grid below the root
  const sortedChildren = [...childPaths].sort();
  const cols = Math.min(sortedChildren.length, 5);
  const colWidth = 250;
  const rowHeight = 150;
  const startX = -((cols - 1) * colWidth) / 2;

  sortedChildren.forEach((path, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    const nodeId = nextId();
    nodeIdMap.set(path, nodeId);

    // Find if we crawled this page (depth > 0)
    const crawledPage = crawlResult.pages.find(p => p.path === path);
    const label = crawledPage?.title || path;

    nodes.push({
      id: nodeId,
      type: "page",
      position: {
        x: startX + col * colWidth,
        y: 200 + row * rowHeight,
      },
      data: { label },
    });

    // Edge from root to this child
    edges.push({
      id: `edge_${rootId}_${nodeId}`,
      source: rootId,
      target: nodeId,
      animated: true,
    });
  });

  // Add cross-links between crawled pages (depth > 0 results)
  for (const page of crawlResult.pages.slice(1)) {
    const sourceId = nodeIdMap.get(page.path);
    if (!sourceId) continue;

    for (const link of page.links) {
      if (link === page.path) continue; // skip self-links
      const targetId = nodeIdMap.get(link);
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
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const nodeIdCounterRef = useRef(0);

  // Crawl state
  const { currentUrl } = usePreviewStore();
  const [crawling, setCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const hasAutoDiscoveredRef = useRef<string | null>(null);

  function getNextId() {
    return `node_${++nodeIdCounterRef.current}`;
  }

  const discoverPages = useCallback(async (url: string) => {
    setCrawling(true);
    setCrawlError(null);

    try {
      const res = await fetch(`${API_BASE}/api/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, depth: 1 }),
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

      const { nodes: newNodes, edges: newEdges } = layoutPages(result);

      setNodes(newNodes);
      setEdges(newEdges);

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
  }, [setNodes, setEdges, reactFlowInstance]);

  // Auto-discover pages when the component mounts with a URL
  useEffect(() => {
    if (!currentUrl || hasAutoDiscoveredRef.current === currentUrl) return;
    // Only auto-discover if canvas is empty (don't overwrite manual work)
    if (nodes.length > 0) return;

    discoverPages(currentUrl);
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
  }, [setNodes, setEdges]);

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
                onClick={() => discoverPages(currentUrl)}
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
                  discoverPages(currentUrl);
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
          </ReactFlow>
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
