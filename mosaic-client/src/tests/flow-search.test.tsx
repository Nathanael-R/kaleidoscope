import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FlowSearch from "@/components/flow/flow-search";
import type { Node } from "@xyflow/react";

const mockNodes: Node[] = [
  { id: "1", type: "page", position: { x: 0, y: 0 }, data: { label: "Homepage" } },
  { id: "2", type: "action", position: { x: 0, y: 0 }, data: { label: "Login" } },
];

describe("FlowSearch", () => {
  it("renders search input", () => {
    render(
      <FlowSearch query="" onQueryChange={() => {}} matchedNodes={[]} onFocusNode={() => {}} />
    );
    expect(screen.getByPlaceholderText("Search nodes... (Spotlight)")).toBeDefined();
  });

  it("shows matched nodes in results", () => {
    render(
      <FlowSearch
        query="Home"
        onQueryChange={() => {}}
        matchedNodes={[mockNodes[0]]}
        onFocusNode={() => {}}
      />
    );
    expect(screen.getByText("Homepage")).toBeDefined();
    expect(screen.getByText("page")).toBeDefined();
  });

  it('shows "no nodes match" when query has no results', () => {
    render(
      <FlowSearch
        query="nonexistent"
        onQueryChange={() => {}}
        matchedNodes={[]}
        onFocusNode={() => {}}
      />
    );
    expect(screen.getByText(/No nodes match/)).toBeDefined();
  });

  it("calls onFocusNode when a result is clicked", () => {
    const onFocus = vi.fn();
    render(
      <FlowSearch
        query="Home"
        onQueryChange={() => {}}
        matchedNodes={[mockNodes[0]]}
        onFocusNode={onFocus}
      />
    );
    fireEvent.click(screen.getByText("Homepage"));
    expect(onFocus).toHaveBeenCalledWith("1");
  });

  it("calls onQueryChange when typing", () => {
    const onChange = vi.fn();
    render(
      <FlowSearch query="" onQueryChange={onChange} matchedNodes={[]} onFocusNode={() => {}} />
    );
    fireEvent.change(screen.getByPlaceholderText("Search nodes... (Spotlight)"), {
      target: { value: "test" },
    });
    expect(onChange).toHaveBeenCalledWith("test");
  });

  it("shows clear button when query is not empty", () => {
    const onChange = vi.fn();
    render(
      <FlowSearch query="test" onQueryChange={onChange} matchedNodes={[]} onFocusNode={() => {}} />
    );
    // Click the X button to clear
    const clearButtons = screen.getAllByRole("button");
    fireEvent.click(clearButtons[0]);
    expect(onChange).toHaveBeenCalledWith("");
  });
});
