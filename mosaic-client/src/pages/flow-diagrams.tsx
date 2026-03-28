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
} from "@xyflow/react";
import { ReactFlowProvider } from "@xyflow/react";
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
import { ExternalLink, Globe, Loader2, RefreshCw, X, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import {
  FLOW_ISSUE_SEVERITIES,
  FLOW_REVIEW_STATUSES,
  buildFlowPreviewUrl,
  getFlowIssueSeverityLabel,
  getFlowNodeTypeLabel,
  getFlowReviewStatusLabel,
  getFlowSeverityButtonClassName,
  getFlowStatusButtonClassName,
  hydrateFlowNode,
  matchesFlowReviewFilter,
  normalizeFlowNodeData,
  summarizeFlowNodes,
  type FlowNodeData,
  type FlowReviewFilter,
} from "@/lib/flow-review";

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

const API_BASE_CLEAN = API_BASE.replace(/\/$/, "");

const resolveScreenshotUrl = (value?: string) => {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return `${API_BASE_CLEAN}${value}`;
  return `${API_BASE_CLEAN}/${value}`;
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
  screenshotUrl?: string;
}

interface CrawlResult {
  startUrl: string;
  pages: CrawlPageInfo[];
  sitemapUrls: string[];
}

interface FlowPagePreview {
  url: string;
  label: string;
  path: string;
  screenshotUrl?: string;
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

  // Build a map from path to screenshotUrl for quick lookup
  const pathToScreenshot = new Map<string, string>();
  for (const page of crawlResult.pages) {
    if (page.screenshotUrl) {
      pathToScreenshot.set(normalizePath(page.path), resolveScreenshotUrl(page.screenshotUrl) || page.screenshotUrl);
    }
  }

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
      screenshotUrl: pathToScreenshot.get(rootPath),
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
        screenshotUrl: pathToScreenshot.get(groupKey),
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
            screenshotUrl: pathToScreenshot.get(pathKey),
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
  const [reviewFilter, setReviewFilter] = useState<FlowReviewFilter>("all");
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredPage, setHoveredPage] = useState<FlowPagePreview | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [crawlOptions, setCrawlOptions] = useState<CrawlOptions>(DEFAULT_CRAWL_OPTIONS);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const nodeIdCounterRef = useRef(0);
  const lastCrawlResultRef = useRef<CrawlResult | null>(null);
  const [, navigate] = useLocation();

  // Crawl state
  const { currentUrl, proxyUrl, setCurrentUrl, setProxyUrl } = usePreviewStore();
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

  const hydrateNodes = useCallback(
    (flowNodes: Node[]) => flowNodes.map((node) => hydrateFlowNode(node, handleToggleGroup)),
    [handleToggleGroup]
  );

  const getPagePreview = useCallback((node: Node): FlowPagePreview | null => {
    const data = normalizeFlowNodeData(node.data);
    const url = typeof data.url === "string" ? data.url : "";

    if (!url) {
      return null;
    }

    return {
      url,
      label: String(data.label || url),
      path: typeof data.path === "string" ? data.path : "",
      screenshotUrl: typeof data.screenshotUrl === "string" ? data.screenshotUrl : undefined,
    };
  }, []);

  const updateNodeData = useCallback(
    (nodeId: string, updates: Partial<FlowNodeData>) => {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...normalizeFlowNodeData(node.data), ...updates } }
            : node
        )
      );
    },
    [setNodes]
  );

  const openNodeInPreview = useCallback(
    (node: Node) => {
      const preview = getPagePreview(node);
      if (!preview) {
        return;
      }

      setCurrentUrl(preview.url);
      setProxyUrl(buildFlowPreviewUrl(proxyUrl, preview.path));
      navigate("/");
    },
    [getPagePreview, navigate, proxyUrl, setCurrentUrl, setProxyUrl]
  );

  const openNodeInNewTab = useCallback(
    (node: Node) => {
      const preview = getPagePreview(node);
      if (!preview) {
        return;
      }

      const previewUrl = buildFlowPreviewUrl(proxyUrl, preview.path) || preview.url;
      window.open(previewUrl, "_blank", "noopener,noreferrer");
    },
    [getPagePreview, proxyUrl]
  );

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
      const hydratedNodes = hydrateNodes(newNodes);

      setNodes(hydratedNodes);
      setEdges(newEdges);
      setSelectedNodeId(null);
      setHoveredPage(null);
      setExpandedGroups(nextExpandedGroups);
      lastCrawlResultRef.current = result;

      // Update ID counter to avoid collisions with manual additions
      nodeIdCounterRef.current = hydratedNodes.length;

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
  }, [setNodes, setEdges, reactFlowInstance, proxyUrl, crawlOptions, handleToggleGroup, hydrateNodes]);

  // Detect when currentUrl changes and trigger side effects safely
  const prevCurrentUrlRef = useRef(currentUrl);
  const [urlChangedPrompt, setUrlChangedPrompt] = useState<string | null>(null);

  const crawlOptionsRef = useRef(crawlOptions);
  useEffect(() => {
    crawlOptionsRef.current = crawlOptions;
  }, [crawlOptions]);

  useEffect(() => {
    if (currentUrl === prevCurrentUrlRef.current) return;
    prevCurrentUrlRef.current = currentUrl;

    if (!currentUrl) return;

    if (nodes.length > 0 && hasAutoDiscoveredRef.current && hasAutoDiscoveredRef.current !== currentUrl) {
      // URL changed and we have existing flow data — show prompt
      setUrlChangedPrompt(currentUrl);
      return;
    }

    if (nodes.length === 0 && hasAutoDiscoveredRef.current !== currentUrl) {
      // Canvas is empty and URL is new — auto-discover immediately
      discoverPages(currentUrl, crawlOptionsRef.current);
    }
  }, [currentUrl, nodes.length, discoverPages]);

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
        data: {
          label: labelMap[type] || "Node",
          reviewStatus: "untouched",
          issueSeverity: "info",
          reviewNote: "",
        },
      };

      setNodes((nds) => [...nds, hydrateFlowNode(newNode, handleToggleGroup)]);
    },
    [handleToggleGroup, reactFlowInstance, setNodes]
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

  const visibleNodeIds = useMemo(() => {
    return new Set(nodes.filter((node) => matchesFlowReviewFilter(node, reviewFilter)).map((node) => node.id));
  }, [nodes, reviewFilter]);

  // Apply highlight styling
  const styledNodes = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      hidden: !visibleNodeIds.has(node.id),
      style: {
        ...node.style,
        opacity:
          highlightedNodes.size === 0 || highlightedNodes.has(node.id)
            ? 1
            : 0.25,
        transition: "opacity 0.3s",
      },
    }));
  }, [nodes, highlightedNodes, visibleNodeIds]);

  const styledEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      hidden: !visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target),
      style: {
        ...edge.style,
        opacity:
          highlightedNodes.size === 0 || highlightedNodes.has(edge.source) || highlightedNodes.has(edge.target)
            ? 1
            : 0.15,
        transition: "opacity 0.3s",
      },
    }));
  }, [edges, highlightedNodes, visibleNodeIds]);

  const reviewSummary = useMemo(() => summarizeFlowNodes(nodes), [nodes]);

  // Save / load
  const handleSave = useCallback(() => {
    saveFlow(flowName, nodes, edges);
  }, [flowName, nodes, edges, saveFlow]);

  const handleLoad = useCallback(
    (name: string) => {
      const flow = loadFlow(name);
      if (flow) {
        const hydratedNodes = hydrateNodes(flow.nodes);
        setNodes(hydratedNodes);
        setEdges(flow.edges);
        setFlowName(name);
        setSelectedNodeId(null);
        setHoveredPage(null);
        const maxId = flow.nodes.reduce((max, n) => {
          const num = parseInt(n.id.replace("node_", ""), 10);
          return isNaN(num) ? max : Math.max(max, num);
        }, 0);
        nodeIdCounterRef.current = maxId;
      }
    },
    [hydrateNodes, loadFlow, setNodes, setEdges]
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
    setSelectedNodeId(null);
    setHoveredPage(null);
    setExpandedGroups(new Set());
    lastCrawlResultRef.current = null;
  }, [setNodes, setEdges]);

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setHoveredPage(null);
  }, []);

  const handleNodeHover = useCallback((_event: React.MouseEvent, node: Node) => {
    const preview = getPagePreview(node);
    if (!preview) {
      return;
    }

    setHoveredPage(preview);
  }, [getPagePreview]);

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
    const hydratedNodes = hydrateNodes(newNodes);
    setNodes(hydratedNodes);
    setEdges(newEdges);
    nodeIdCounterRef.current = hydratedNodes.length;
  }, [expandedGroups, handleToggleGroup, hydrateNodes, setNodes, setEdges]);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }

    const selectedNode = nodes.find((node) => node.id === selectedNodeId);
    if (!selectedNode || !matchesFlowReviewFilter(selectedNode, reviewFilter)) {
      setSelectedNodeId(null);
    }
  }, [nodes, reviewFilter, selectedNodeId]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) {
      return null;
    }

    return nodes.find((node) => node.id === selectedNodeId) ?? null;
  }, [nodes, selectedNodeId]);

  const selectedNodeData = useMemo(() => {
    return selectedNode ? normalizeFlowNodeData(selectedNode.data) : null;
  }, [selectedNode]);

  const selectedNodePreviewUrl = useMemo(() => {
    if (!selectedNode) {
      return "";
    }

    const preview = getPagePreview(selectedNode);
    if (!preview) {
      return "";
    }

    return buildFlowPreviewUrl(proxyUrl, preview.path) || preview.url;
  }, [getPagePreview, proxyUrl, selectedNode]);

  const matchedNodes = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return nodes.filter((n) => highlightedNodes.has(n.id) && visibleNodeIds.has(n.id));
  }, [nodes, searchQuery, highlightedNodes, visibleNodeIds]);

  return (
    <div className="flex flex-1 min-h-0 bg-gray-50 dark:bg-gray-900">
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
          {/* URL changed prompt — shown when user navigated away and came back with a different URL */}
          {urlChangedPrompt && !crawling && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 rounded-lg shadow-lg p-4 flex items-center gap-3 max-w-lg">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">URL changed</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Discover flow for <strong>{urlChangedPrompt}</strong>?</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setUrlChangedPrompt(null);
                    handleClear();
                    discoverPages(urlChangedPrompt, crawlOptions);
                  }}
                >
                  <Globe className="w-4 h-4 mr-1" />
                  Discover
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUrlChangedPrompt(null)}
                >
                  Keep
                </Button>
              </div>
            </div>
          )}

          {/* Discover Pages banner — shows when URL is loaded but canvas is empty */}
          {currentUrl && nodes.length === 0 && !crawling && !urlChangedPrompt && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 flex items-center gap-3 max-w-lg">
              <Globe className="w-5 h-5 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Discover site pages</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{currentUrl}</p>
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
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded-lg shadow-lg p-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Discovering pages...</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Loading site and extracting navigation links</p>
              </div>
            </div>
          )}

          {/* Re-discover button when flow is populated */}
          {currentUrl && nodes.length > 0 && !crawling && !urlChangedPrompt && (
            <div className="absolute top-4 right-4 z-10">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  handleClear();
                  discoverPages(currentUrl, crawlOptions);
                }}
                className="bg-white dark:bg-gray-800 shadow-sm"
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
                reviewFilter={reviewFilter}
                onReviewFilterChange={setReviewFilter}
                reviewSummary={reviewSummary}
              />
            </Panel>
            {hoveredPage && !selectedNode && (
              <Panel position="bottom-right">
                <div className="w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 text-[10px] font-medium text-gray-700 dark:text-gray-300 truncate">
                    {hoveredPage.label}
                  </div>
                  {hoveredPage.screenshotUrl ? (
                    <img
                      src={hoveredPage.screenshotUrl}
                      alt={`Preview of ${hoveredPage.label}`}
                      className="w-full h-auto object-cover max-h-48"
                      loading="eager"
                    />
                  ) : (
                    <div className="w-full h-36 flex items-center justify-center bg-gray-50 dark:bg-gray-700">
                      <div className="text-center">
                        <Globe className="w-6 h-6 text-gray-300 dark:text-gray-500 mx-auto mb-1" />
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">No preview available</p>
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
            )}
          </ReactFlow>
          {selectedNode && selectedNodeData && (
            <aside className="absolute right-4 top-16 bottom-4 z-20 w-[92vw] max-w-sm rounded-2xl border border-gray-200 bg-white/95 shadow-2xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95 animate-slide-in-right">
              <div className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 dark:border-gray-700">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                      {getFlowNodeTypeLabel(selectedNode.type)}
                    </p>
                    <h3 className="mt-1 truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                      {String(selectedNodeData.label || "Untitled node")}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium ${getFlowStatusButtonClassName(selectedNodeData.reviewStatus || "untouched", true)}`}>
                        {getFlowReviewStatusLabel(selectedNodeData.reviewStatus || "untouched")}
                      </span>
                      {selectedNodeData.reviewStatus === "issue" && (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium ${getFlowSeverityButtonClassName(selectedNodeData.issueSeverity || "info", true)}`}>
                          {getFlowIssueSeverityLabel(selectedNodeData.issueSeverity || "info")}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setSelectedNodeId(null)}
                    aria-label="Close review panel"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
                  <section>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Review status</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {FLOW_REVIEW_STATUSES.map((status) => (
                        <button
                          key={status}
                          onClick={() => updateNodeData(selectedNode.id, { reviewStatus: status })}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${getFlowStatusButtonClassName(status, status === selectedNodeData.reviewStatus)}`}
                        >
                          {getFlowReviewStatusLabel(status)}
                        </button>
                      ))}
                    </div>
                  </section>

                  {selectedNodeData.reviewStatus === "issue" && (
                    <section>
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Issue severity</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {FLOW_ISSUE_SEVERITIES.map((severity) => (
                          <button
                            key={severity}
                            onClick={() => updateNodeData(selectedNode.id, { issueSeverity: severity })}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${getFlowSeverityButtonClassName(severity, severity === selectedNodeData.issueSeverity)}`}
                          >
                            {getFlowIssueSeverityLabel(severity)}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  <section>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Review note</p>
                    <textarea
                      value={selectedNodeData.reviewNote || ""}
                      onChange={(event) => updateNodeData(selectedNode.id, { reviewNote: event.target.value })}
                      placeholder="Capture why this node matters, what broke, or what still needs review."
                      rows={4}
                      className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:placeholder:text-gray-500 dark:focus:border-gray-500"
                    />
                  </section>

                  {(selectedNodeData.path || selectedNodeData.url) && (
                    <section className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
                      {selectedNodeData.path && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Path</p>
                          <p className="mt-1 break-all text-xs text-gray-700 dark:text-gray-300">{selectedNodeData.path}</p>
                        </div>
                      )}
                      {selectedNodeData.url && (
                        <div className={selectedNodeData.path ? "mt-3" : ""}>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">URL</p>
                          <p className="mt-1 break-all text-xs text-gray-700 dark:text-gray-300">{selectedNodeData.url}</p>
                        </div>
                      )}
                    </section>
                  )}

                  {selectedNode.type === "page" && (
                    <section>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Page context</p>
                        {selectedNodePreviewUrl && (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500">Bridges back into preview</p>
                        )}
                      </div>
                      <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60">
                        {selectedNodeData.screenshotUrl ? (
                          <img
                            src={selectedNodeData.screenshotUrl}
                            alt={`Screenshot of ${String(selectedNodeData.label || "page")}`}
                            className="h-44 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-44 items-center justify-center">
                            <div className="text-center">
                              <Globe className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
                              <p className="text-xs text-gray-500 dark:text-gray-400">No screenshot captured for this page yet.</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => openNodeInPreview(selectedNode)}
                          disabled={!selectedNodePreviewUrl}
                        >
                          <Globe className="w-4 h-4 mr-1" />
                          Open in Preview
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openNodeInNewTab(selectedNode)}
                          disabled={!selectedNodePreviewUrl}
                        >
                          <ExternalLink className="w-4 h-4 mr-1" />
                          Open in New Tab
                        </Button>
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </aside>
          )}
        </div>
    </div>
  );
}

interface FlowWorkspacePaneProps {
  embedded?: boolean;
}

export function FlowWorkspacePane({ embedded = false }: FlowWorkspacePaneProps) {
  const content = (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  );

  if (embedded) {
    return <div className="flex flex-1 min-h-0">{content}</div>;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="flex flex-1 min-h-0">{content}</div>
    </div>
  );
}

export default function FlowDiagrams() {
  return <FlowWorkspacePane />;
}
