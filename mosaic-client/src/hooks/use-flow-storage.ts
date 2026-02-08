import { useState, useCallback } from "react";
import type { Node, Edge } from "@xyflow/react";

const STORAGE_KEY = "kaleidoscope-flows";

interface FlowData {
  nodes: Node[];
  edges: Edge[];
  savedAt: string;
}

interface FlowStore {
  [name: string]: FlowData;
}

function readStore(): FlowStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FlowStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: FlowStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function useFlowStorage() {
  const [savedFlows, setSavedFlows] = useState<string[]>(() =>
    Object.keys(readStore())
  );

  const saveFlow = useCallback((name: string, nodes: Node[], edges: Edge[]) => {
    const store = readStore();
    store[name] = { nodes, edges, savedAt: new Date().toISOString() };
    writeStore(store);
    setSavedFlows(Object.keys(store));
  }, []);

  const loadFlow = useCallback((name: string): FlowData | null => {
    const store = readStore();
    return store[name] ?? null;
  }, []);

  const deleteFlow = useCallback((name: string) => {
    const store = readStore();
    delete store[name];
    writeStore(store);
    setSavedFlows(Object.keys(store));
  }, []);

  const exportFlows = useCallback((): string => {
    return JSON.stringify(readStore(), null, 2);
  }, []);

  const importFlows = useCallback((json: string) => {
    try {
      const imported = JSON.parse(json) as FlowStore;
      const store = readStore();
      // Merge imported flows into existing store
      for (const [name, data] of Object.entries(imported)) {
        store[name] = data;
      }
      writeStore(store);
      setSavedFlows(Object.keys(store));
    } catch (e) {
      console.error("Failed to import flows:", e);
    }
  }, []);

  return { savedFlows, saveFlow, loadFlow, deleteFlow, exportFlows, importFlows };
}
