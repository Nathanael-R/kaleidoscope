import { describe, expect, it, vi } from "vitest";
import type { Node } from "@xyflow/react";

import {
  buildFlowPreviewUrl,
  hydrateFlowNode,
  matchesFlowReviewFilter,
  normalizeFlowNodeData,
  summarizeFlowNodes,
} from "@/lib/flow-review";

describe("flow review helpers", () => {
  it("normalizes missing review fields", () => {
    const data = normalizeFlowNodeData({ label: "Checkout" });

    expect(data.reviewStatus).toBe("untouched");
    expect(data.issueSeverity).toBe("info");
    expect(data.reviewNote).toBe("");
  });

  it("hydrates saved nodes with review defaults and group callbacks", () => {
    const onToggleGroup = vi.fn();
    const node: Node = {
      id: "node_1",
      type: "page",
      position: { x: 0, y: 0 },
      data: {
        label: "Docs",
        isGroup: true,
        groupKey: "/docs",
      },
    };

    const hydrated = hydrateFlowNode(node, onToggleGroup);
    const data = normalizeFlowNodeData(hydrated.data);

    expect(data.reviewStatus).toBe("untouched");
    expect(data.onToggleGroup).toBe(onToggleGroup);
  });

  it("matches issue and review filters from node status", () => {
    const issueNode: Node = {
      id: "node_2",
      type: "note",
      position: { x: 0, y: 0 },
      data: {
        label: "Billing error",
        reviewStatus: "issue",
        issueSeverity: "warning",
      },
    };

    expect(matchesFlowReviewFilter(issueNode, "issues")).toBe(true);
    expect(matchesFlowReviewFilter(issueNode, "approved")).toBe(false);
  });

  it("summarizes node review counts", () => {
    const nodes: Node[] = [
      {
        id: "n1",
        type: "page",
        position: { x: 0, y: 0 },
        data: { label: "Home", reviewStatus: "untouched" },
      },
      {
        id: "n2",
        type: "page",
        position: { x: 0, y: 0 },
        data: { label: "Pricing", reviewStatus: "reviewed" },
      },
      {
        id: "n3",
        type: "note",
        position: { x: 0, y: 0 },
        data: { label: "Broken CTA", reviewStatus: "issue" },
      },
      {
        id: "n4",
        type: "action",
        position: { x: 0, y: 0 },
        data: { label: "Submit", reviewStatus: "approved" },
      },
    ];

    expect(summarizeFlowNodes(nodes)).toEqual({
      all: 4,
      untouched: 1,
      reviewed: 1,
      issues: 1,
      approved: 1,
    });
  });

  it("builds preview URLs from proxied flow routes", () => {
    expect(buildFlowPreviewUrl("http://localhost:5000/api/proxy/session123/checkout", "/pricing")).toBe(
      "http://localhost:5000/api/proxy/session123/pricing"
    );
    expect(buildFlowPreviewUrl(null, "/pricing")).toBeNull();
  });
});