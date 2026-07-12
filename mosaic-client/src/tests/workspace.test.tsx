import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import Workspace from "@/pages/workspace";
import { usePreviewStore } from "@/store/preview-store";

vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));

function renderWorkspace() {
  return render(<Workspace />);
}

describe("Workspace", () => {
  beforeEach(() => {
    vi.mocked(fetch).mockClear();
    usePreviewStore.setState({
      currentUrl: "",
      darkMode: false,
    });
    localStorage.clear();
  });

  it("renders the preview workspace on the default route", () => {
    renderWorkspace();

    expect(screen.getByTestId("input-url")).toBeInTheDocument();
    expect(screen.queryByText("Flow Editor")).not.toBeInTheDocument();
  });
});
