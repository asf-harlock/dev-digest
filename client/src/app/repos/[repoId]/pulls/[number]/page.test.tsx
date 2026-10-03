/* page.test.tsx — the PR detail route's URL plumbing for SPEC-06 deep links.
   Data hooks and the tab bodies are stubbed; what is under test is the
   `router.replace` the page builds from a focus click or a tab switch. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const nav = { replace: vi.fn(), search: "" };

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "7" }),
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => null }));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "o/r" } }),
  useRepoNotFound: () => false,
}));
vi.mock("../../../../../lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "pr1", number: 7 }], isLoading: false }),
  usePullDetail: () => ({
    data: { number: 7, body: "b", intent: null, head_sha: "abc", files: [], files_count: 0, commits: [], status: "open" },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("../../../../../lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  useCancelRun: () => ({}),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
}));
vi.mock("./_components/PrDetailHeader", () => ({
  PrDetailHeader: ({ onSetTab }: { onSetTab: (t: string) => void }) => (
    <div>
      <button onClick={() => onSetTab("overview")}>to-overview</button>
      <button onClick={() => onSetTab("findings")}>to-findings</button>
    </div>
  ),
}));
vi.mock("./_components/OverviewTab", () => ({
  OverviewTab: ({ onOpenFile }: { onOpenFile: (f: string, l?: number) => void }) => (
    <div>
      <button onClick={() => onOpenFile("src/a.ts", 12)}>focus-with-line</button>
      <button onClick={() => onOpenFile("src/a.ts")}>focus-no-line</button>
    </div>
  ),
}));
vi.mock("./_components/FindingsTab", () => ({ FindingsTab: () => <div>findings-tab</div> }));
vi.mock("./_components/DiffTab", () => ({
  DiffTab: (p: { targetFile?: string | null; targetLine?: string | null }) => (
    <div>diff-tab file={p.targetFile} line={p.targetLine}</div>
  ),
}));
vi.mock("./_components/RunTraceDrawer", () => ({ default: () => null }));

import PRDetailPage from "./page";

beforeEach(() => {
  nav.replace.mockClear();
  nav.search = "";
});
afterEach(cleanup);

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PRDetailPage />
    </QueryClientProvider>,
  );
}

describe("PR detail page URL plumbing", () => {
  it("SPEC-06 F4/AC-14: a focus click makes ONE router.replace carrying tab, file and line together", () => {
    renderPage();
    fireEvent.click(screen.getByText("focus-with-line"));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    const url = new URL(nav.replace.mock.calls[0]![0] as string, "http://x");
    expect(url.pathname).toBe("/repos/r1/pulls/7");
    expect(Object.fromEntries(url.searchParams)).toEqual({ tab: "diff", file: "src/a.ts", line: "12" });
  });

  it("SPEC-06 AC-14: a reference without a line sets file only and drops a stale line", () => {
    nav.search = "tab=overview&file=old.ts&line=5";
    renderPage();
    fireEvent.click(screen.getByText("focus-no-line"));

    expect(nav.replace).toHaveBeenCalledTimes(1);
    const url = new URL(nav.replace.mock.calls[0]![0] as string, "http://x");
    expect(Object.fromEntries(url.searchParams)).toEqual({ tab: "diff", file: "src/a.ts" });
  });

  it("SPEC-06 F4: switching tab clears file and line in the same single update", () => {
    nav.search = "tab=diff&file=src%2Fa.ts&line=12";
    renderPage();
    expect(screen.getByText(/diff-tab file=src\/a\.ts line=12/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("to-findings"));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    const url = new URL(nav.replace.mock.calls[0]![0] as string, "http://x");
    expect(Object.fromEntries(url.searchParams)).toEqual({ tab: "findings" });
  });
});
