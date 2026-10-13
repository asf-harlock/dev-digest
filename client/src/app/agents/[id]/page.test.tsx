/* page.test.tsx — /agents/:id tab routing: `?tab=ci` opens the CI tab (SPEC-11 AC-36). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const h = vi.hoisted(() => ({ tab: null as string | null, replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ag1" }),
  useSearchParams: () => new URLSearchParams(h.tab ? `tab=${h.tab}` : ""),
  useRouter: () => ({ replace: h.replace, push: vi.fn() }),
}));
vi.mock("../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../_components/AgentCard", () => ({ AgentCard: () => null }));
vi.mock("./_components/AgentEditor", () => ({
  AgentEditor: ({ tab, onTab }: { tab: string; onTab: (t: string) => void }) => (
    <div>
      <span data-testid="tab">{tab}</span>
      <button type="button" onClick={() => onTab("ci")}>
        go ci
      </button>
    </div>
  ),
}));
vi.mock("../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: [] }),
  useAgent: () => ({
    data: { id: "ag1", name: "Security Reviewer", provider: "openrouter", model: "m", enabled: true },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateAgent: () => ({ mutate: vi.fn() }),
}));

import AgentEditorPage from "./page";

beforeEach(() => {
  h.tab = null;
  h.replace.mockClear();
});
afterEach(cleanup);

describe("/agents/:id tab routing", () => {
  it("AC-36: ?tab=ci opens the CI tab", () => {
    h.tab = "ci";
    render(<AgentEditorPage />);
    expect(screen.getByTestId("tab")).toHaveTextContent("ci");
  });

  it("AC-36: an unknown tab falls back to config, and switching to ci writes ?tab=ci", () => {
    h.tab = "nope";
    render(<AgentEditorPage />);
    expect(screen.getByTestId("tab")).toHaveTextContent("config");
    fireEvent.click(screen.getByRole("button", { name: "go ci" }));
    expect(h.replace).toHaveBeenCalledWith("/agents/ag1?tab=ci");
  });
});
