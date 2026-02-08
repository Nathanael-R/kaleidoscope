import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFlowStorage } from "@/hooks/use-flow-storage";
import type { Node, Edge } from "@xyflow/react";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

const sampleNodes: Node[] = [
  { id: "node_1", type: "page", position: { x: 100, y: 100 }, data: { label: "Homepage" } },
  { id: "node_2", type: "action", position: { x: 200, y: 200 }, data: { label: "Login" } },
];

const sampleEdges: Edge[] = [
  { id: "e1-2", source: "node_1", target: "node_2" },
];

describe("useFlowStorage", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("starts with empty saved flows", () => {
    const { result } = renderHook(() => useFlowStorage());
    expect(result.current.savedFlows).toEqual([]);
  });

  it("saves and loads a flow", () => {
    const { result } = renderHook(() => useFlowStorage());

    act(() => {
      result.current.saveFlow("Test Flow", sampleNodes, sampleEdges);
    });

    expect(result.current.savedFlows).toEqual(["Test Flow"]);

    const loaded = result.current.loadFlow("Test Flow");
    expect(loaded).not.toBeNull();
    expect(loaded!.nodes).toHaveLength(2);
    expect(loaded!.edges).toHaveLength(1);
    expect(loaded!.nodes[0].data.label).toBe("Homepage");
  });

  it("returns null for non-existent flow", () => {
    const { result } = renderHook(() => useFlowStorage());
    expect(result.current.loadFlow("nonexistent")).toBeNull();
  });

  it("deletes a flow", () => {
    const { result } = renderHook(() => useFlowStorage());

    act(() => {
      result.current.saveFlow("To Delete", sampleNodes, sampleEdges);
    });
    expect(result.current.savedFlows).toContain("To Delete");

    act(() => {
      result.current.deleteFlow("To Delete");
    });
    expect(result.current.savedFlows).not.toContain("To Delete");
  });

  it("overwrites flow when saving with same name", () => {
    const { result } = renderHook(() => useFlowStorage());

    act(() => {
      result.current.saveFlow("My Flow", sampleNodes, sampleEdges);
    });

    const updatedNodes: Node[] = [
      { id: "node_1", type: "page", position: { x: 0, y: 0 }, data: { label: "Updated" } },
    ];

    act(() => {
      result.current.saveFlow("My Flow", updatedNodes, []);
    });

    expect(result.current.savedFlows).toEqual(["My Flow"]);
    const loaded = result.current.loadFlow("My Flow");
    expect(loaded!.nodes).toHaveLength(1);
    expect(loaded!.nodes[0].data.label).toBe("Updated");
  });

  it("exports all flows as JSON", () => {
    const { result } = renderHook(() => useFlowStorage());

    act(() => {
      result.current.saveFlow("Flow A", sampleNodes, sampleEdges);
      result.current.saveFlow("Flow B", [], []);
    });

    const json = result.current.exportFlows();
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed)).toEqual(["Flow A", "Flow B"]);
  });

  it("imports flows from JSON and merges", () => {
    const { result } = renderHook(() => useFlowStorage());

    act(() => {
      result.current.saveFlow("Existing", sampleNodes, sampleEdges);
    });

    const importJson = JSON.stringify({
      "Imported Flow": {
        nodes: [{ id: "node_99", type: "note", position: { x: 0, y: 0 }, data: { label: "Imported" } }],
        edges: [],
        savedAt: new Date().toISOString(),
      },
    });

    act(() => {
      result.current.importFlows(importJson);
    });

    expect(result.current.savedFlows).toContain("Existing");
    expect(result.current.savedFlows).toContain("Imported Flow");
  });
});
