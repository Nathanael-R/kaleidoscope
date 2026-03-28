import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";

import Workspace from "@/pages/workspace";
import { usePreviewStore } from "@/store/preview-store";

let mockLocation = "/";
const mockNavigate = vi.fn();

vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => [mockLocation, mockNavigate] as const,
  };
});

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Workspace />
    </QueryClientProvider>
  );
}

describe("Workspace", () => {
  beforeEach(() => {
    mockLocation = "/";
    mockNavigate.mockReset();
    vi.mocked(fetch).mockClear();
    usePreviewStore.setState({
      currentUrl: "",
      proxyUrl: null,
      darkMode: false,
    });
    localStorage.clear();
  });

  it("renders the preview workspace on the default route", () => {
    renderWorkspace();

    expect(screen.getByTestId("input-url")).toBeInTheDocument();
    expect(screen.queryByText("Flow Editor")).not.toBeInTheDocument();
  });

  it("renders the flow workspace on the flows route", () => {
    mockLocation = "/flows";

    renderWorkspace();

    expect(screen.getByText("Flow Editor")).toBeInTheDocument();
    expect(screen.queryByTestId("input-url")).not.toBeInTheDocument();
  });
});