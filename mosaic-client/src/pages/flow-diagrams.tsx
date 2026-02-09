import { useState, useCallback, useRef, useMemo } from "react";
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

  function getNextId() {
    return `node_${++nodeIdCounterRef.current}`;
  }

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
        // Update counter to avoid ID collisions
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
        />
        <div className="flex-1 relative" ref={reactFlowWrapper}>
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
