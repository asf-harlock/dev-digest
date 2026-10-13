/* ResultsView.test.tsx — SPEC-11 results page (AC-18, AC-19, AC-26, AC-27, AC-40, AC-42…AC-45, EC-11,
   EC-14, EC-15, EC-16, EC-20, NFR-4, NFR-8). `fetch` is the outside world; AppShell, navigation and
   the repo context are stubbed. RunTraceDrawer is recorded, not rendered: the page's contract with
   it is its props and its mount lifecycle (it is reused unmodified). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import runs from "../../../../../../../../messages/en/runs.json";
import prReview from "../../../../../../../../messages/en/prReview.json";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { MULTI_AGENT_POLL_MAX_MS, MULTI_AGENT_POLL_MS } from "../../../../../../../lib/hooks/multi-agent";
import { agent, apiError, column, conflict, finding, maRun, pr, stubApi, take } from "../../../../../../../test/multi-agent-fixtures";

const nav = vi.hoisted(() => ({
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
  mounts: [] as string[],
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1", number: "7" }),
  usePathname: () => "/repos/r1/multi-agent/7",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/api" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer", async () => {
  const React = await import("react");
  function TraceDrawerStub(props: { runId: string; agentName?: string | null; prNumber?: number | null; running?: boolean; findings?: unknown[]; onClose: () => void }) {
    // Mount-only on purpose: a drawer swapped without `key` would NOT log a second mount.
    React.useEffect(() => {
      nav.mounts.push(props.runId);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <div role="dialog" aria-label="trace drawer" data-run-id={props.runId} data-running={String(!!props.running)}>
        <span>{props.agentName}</span>
        <span>PR {props.prNumber}</span>
        <span>{props.findings?.length} findings</span>
        <button onClick={props.onClose}>close drawer</button>
      </div>
    );
  }
  return { default: TraceDrawerStub };
});

import { ResultsView } from "./ResultsView";

beforeEach(() => {
  nav.search = "";
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.mounts.length = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const SQL = finding({ id: "f1", severity: "CRITICAL", title: "SQL injection", file: "src/a.ts", start_line: 12, end_line: 12 });
const DONE_A = column({ run_id: "ra", agent_id: "ag1", agent_name: "Security Reviewer", score: 64, findings: [SQL] });
const DONE_B = column({ run_id: "rb", agent_id: "ag2", agent_name: "Style Reviewer", score: 90 });
const RUNNING_B = { ...DONE_B, status: "running" as const, score: null, duration_ms: null, cost_usd: null };

const SNAPSHOT = maRun({
  columns: [DONE_A, DONE_B],
  conflicts: [
    conflict({
      file: "src/a.ts",
      line: 12,
      title: "SQL injection",
      takes: [take({ run_id: "ra", verdict: "CRITICAL" }), take({ run_id: "rb", agent_id: "ag2", verdict: "ignored" })],
    }),
  ],
});

function api(over: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    "GET /repos/r1/pulls": { body: [pr({ id: "pr1", number: 7, title: "Add payments retry", head_sha: "abc123" })] },
    "GET /pulls/pr1/multi-agent": { body: SNAPSHOT },
    "GET /agents": { body: [agent({ id: "ag1" }), agent({ id: "ag2", name: "Style Reviewer" })] },
    "GET /pulls/pr1/eval-case-links": { body: { links: [] } },
    ...over,
  });
}

function tree() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ runs, prReview, eval: evalMessages, shell }}>
        <ResultsView />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
const renderView = () => render(tree());

/** Re-render under the same QueryClient after the URL query changed. */
function renderKeepingCache() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const ui = () => (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ runs, prReview, eval: evalMessages, shell }}>
        <ResultsView />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(ui());
  return { rerender: () => view.rerender(ui()) };
}

describe("ResultsView", () => {
  it("AC-26/23/37: header (N selected agents · parallel, PR number and title, meta from the snapshot), Configure run, columns and the disagreement block", async () => {
    api();
    renderView();

    expect(await screen.findByRole("heading", { name: "Multi-Agent Review" })).toBeInTheDocument();
    expect(screen.getByText("2 selected agents · parallel")).toBeInTheDocument();
    expect(screen.getByText("#7")).toBeInTheDocument();
    expect(screen.getByText("Add payments retry")).toBeInTheDocument();
    expect(screen.getByText("2 agents · parallel · 12.0s total · $0.10")).toBeInTheDocument();
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("data-run-id")).filter(Boolean)).toEqual(["ra", "rb"]);
    expect(screen.getByRole("heading", { name: "Where agents disagree" })).toBeInTheDocument();
    expect(screen.getByText("did not flag")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    expect(nav.push).toHaveBeenCalledWith("/repos/r1/multi-agent");
  });

  it("AC-27: Columns is the default, ?view=tabs shows Tabs, and the toggle writes the choice to the URL (Columns removes it)", async () => {
    api();
    renderView();
    await screen.findByRole("heading", { name: "Multi-Agent Review" });
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tabs" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/repos/r1/multi-agent/7?view=tabs");
    cleanup();

    nav.search = "view=tabs&trace=zzz";
    api();
    renderView();
    expect(await screen.findByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tabs" })).toHaveAttribute("aria-pressed", "true");
    // the disagreement block sits under the tab detail too (AC-37)
    expect(screen.getByRole("heading", { name: "Where agents disagree" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/repos/r1/multi-agent/7?trace=zzz");
  });

  it("EC-16: a PR with no multi-agent run (404) shows 'No multi-agent run yet' with a link to Configure run", async () => {
    api({ "GET /pulls/pr1/multi-agent": apiError(404, "not_found") });
    renderView();
    expect(await screen.findByText("No multi-agent run yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    expect(nav.push).toHaveBeenCalledWith("/repos/r1/multi-agent");
  });

  it("a PR number that is not in the repo says so", async () => {
    api({ "GET /repos/r1/pulls": { body: [pr({ id: "pr9", number: 99 })] } });
    renderView();
    expect(await screen.findByText("Pull request not found")).toBeInTheDocument();
  });

  it("EC-11: every column failed — each shows its error, no conflicts, and Configure run stays available", async () => {
    api({
      "GET /pulls/pr1/multi-agent": {
        body: maRun({
          columns: [
            column({ run_id: "ra", agent_name: "Alpha", status: "failed", error: "429 from provider", score: null }),
            column({ run_id: "rb", agent_name: "Beta", status: "failed", error: "model not found", score: null }),
          ],
        }),
      },
    });
    renderView();
    expect(await screen.findByText("429 from provider")).toBeInTheDocument();
    expect(screen.getByText("model not found")).toBeInTheDocument();
    expect(screen.getAllByText("Failed")).toHaveLength(2);
    expect(screen.getByText("Comparison needs at least 2 completed agents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Configure run" })).toBeInTheDocument();
  });

  it("EC-14: a first load that fails shows the error screen with Retry that refetches", async () => {
    let fail = true;
    const calls = api({ "GET /pulls/pr1/multi-agent": () => (fail ? apiError(500, "internal") : { body: SNAPSHOT }) });
    renderView();
    expect(await screen.findByText("Couldn't load the multi-agent run")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("2 selected agents · parallel")).toBeInTheDocument();
    expect(calls.filter((c) => c.url === "/pulls/pr1/multi-agent")).toHaveLength(2);
  });

  describe("polling and live status", () => {
    const flush = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));
    /** Let the PR list, then the run query, resolve (two chained requests under fake timers). */
    const settle = async () => {
      for (let i = 0; i < 20; i++) await flush(5);
    };

    it("AC-18/19, NFR-8: a running column updates itself every 4s without reload, polling stops when all settle, and the status change is announced in an aria-live region", async () => {
      vi.useFakeTimers();
      let n = 0;
      const calls = api({
        "GET /pulls/pr1/multi-agent": () => {
          n += 1;
          return { body: n < 2 ? maRun({ columns: [DONE_A, RUNNING_B] }) : maRun({ columns: [DONE_A, DONE_B] }) };
        },
      });
      renderView();
      await settle();

      const live = screen.getByRole("status");
      expect(live).toHaveAttribute("aria-live", "polite");
      expect(screen.getByText("Running")).toBeInTheDocument();
      expect(screen.getByText("Comparing 1 of 2 agents")).toBeInTheDocument();
      expect(live).toHaveTextContent("");
      const polls = () => calls.filter((c) => c.url === "/pulls/pr1/multi-agent").length;
      expect(polls()).toBe(1);

      await flush(MULTI_AGENT_POLL_MS);
      await flush(1);
      expect(polls()).toBe(2);
      expect(screen.queryByText("Running")).not.toBeInTheDocument();
      expect(live).toHaveTextContent("Style Reviewer: Done");

      await flush(MULTI_AGENT_POLL_MS * 5);
      expect(polls()).toBe(2);
    });

    it("EC-14: a failed refresh keeps the last data on screen with a Retry banner and stops polling", async () => {
      vi.useFakeTimers();
      let outage = false;
      const calls = api({
        "GET /pulls/pr1/multi-agent": () => (outage ? apiError(500, "internal") : { body: maRun({ columns: [DONE_A, RUNNING_B] }) }),
      });
      renderView();
      await settle();
      expect(screen.getByText("Security Reviewer")).toBeInTheDocument();

      outage = true;
      await flush(MULTI_AGENT_POLL_MS + 1);
      const banner = screen.getByText("Couldn't load the multi-agent run.").closest("[role=alert]") as HTMLElement;
      expect(within(banner).getByRole("button", { name: "Retry" })).toBeInTheDocument();
      expect(screen.getByText("Security Reviewer")).toBeInTheDocument(); // last data kept
      const stopped = calls.length;
      await flush(MULTI_AGENT_POLL_MS * 5);
      expect(calls).toHaveLength(stopped);
    });

    it("EC-15: after 20 minutes still running, the page says 'Status is not up to date' and Refresh re-reads", async () => {
      vi.useFakeTimers();
      const calls = api({ "GET /pulls/pr1/multi-agent": { body: maRun({ columns: [DONE_A, RUNNING_B] }) } });
      renderView();
      await settle();
      expect(screen.queryByText("Status is not up to date.")).not.toBeInTheDocument();

      await flush(MULTI_AGENT_POLL_MAX_MS + MULTI_AGENT_POLL_MS * 2);
      expect(screen.getByText("Status is not up to date.")).toBeInTheDocument();
      const stopped = calls.length;
      await flush(MULTI_AGENT_POLL_MS * 5);
      expect(calls).toHaveLength(stopped);

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(calls.length).toBe(stopped + 1);
      expect(screen.queryByText("Status is not up to date.")).not.toBeInTheDocument();
    });
  });

  describe("trace drawer host", () => {
    it("AC-40/42/43, NFR-4: View trace puts the run id in the URL; ?trace= opens the unmodified drawer with agent name, PR number and that run's findings, `running` only for a running column, and the drawer is the only one", async () => {
      nav.search = "trace=rb";
      api({ "GET /pulls/pr1/multi-agent": { body: maRun({ columns: [DONE_A, RUNNING_B] }) } });
      renderView();

      const drawer = await screen.findByRole("dialog", { name: "trace drawer" });
      expect(drawer).toHaveAttribute("data-run-id", "rb");
      expect(drawer).toHaveAttribute("data-running", "true");
      expect(within(drawer).getByText("Style Reviewer")).toBeInTheDocument();
      expect(within(drawer).getByText("PR 7")).toBeInTheDocument();
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      cleanup();

      nav.search = "trace=ra";
      api();
      renderView();
      const done = await screen.findByRole("dialog", { name: "trace drawer" });
      expect(done).toHaveAttribute("data-running", "false");
      expect(within(done).getByText("1 findings")).toBeInTheDocument(); // that run's findings from the snapshot
      cleanup();

      nav.search = "";
      api();
      renderView();
      fireEvent.click(await screen.findByRole("button", { name: "View trace of Security Reviewer" }));
      expect(nav.replace).toHaveBeenLastCalledWith("/repos/r1/multi-agent/7?trace=ra");
    });

    it("EC-20: a ?trace= that is not a column of the shown run is ignored and opens no drawer", async () => {
      nav.search = "trace=someone-elses-run";
      api();
      renderView();
      await screen.findByRole("heading", { name: "Multi-Agent Review" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(nav.mounts).toEqual([]);
    });

    it("AC-44: opening another column's trace replaces the drawer with a freshly mounted one (key = run id)", async () => {
      nav.search = "trace=ra";
      api();
      const { rerender } = renderKeepingCache();
      await screen.findByRole("dialog", { name: "trace drawer" });
      expect(nav.mounts).toEqual(["ra"]);

      nav.search = "trace=rb";
      rerender();
      await waitFor(() => expect(screen.getByRole("dialog", { name: "trace drawer" })).toHaveAttribute("data-run-id", "rb"));
      expect(nav.mounts).toEqual(["ra", "rb"]);
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
    });

    it("AC-45: closing the drawer removes `trace` from the URL and keeps the other params", async () => {
      nav.search = "view=tabs&trace=ra";
      api();
      renderView();
      fireEvent.click(await screen.findByRole("button", { name: "close drawer" }));
      expect(nav.replace).toHaveBeenLastCalledWith("/repos/r1/multi-agent/7?view=tabs");
    });
  });
});
