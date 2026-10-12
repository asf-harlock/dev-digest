/* EvalsTab.run.test.tsx — the single-case run on the agent Evals tab (SPEC-10 AC-39, AC-41, AC-42,
   AC-49, EC-18, EC-23, EC-24): the row **Run** posts directly, "Running…" on the row, every run
   control disabled while ANY run of the agent executes (a set run or a case run, from this tab, a
   reload or another tab), a 409 start, the polite announcement, the 3-minute timeout sentence and
   the Retry after a failed poll. `fetch` is the outside world; hooks, api.ts and react-query are
   real. The existing EvalsTab.test.tsx covers the header, KPI row, list and editor. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, EvalCaseListItem, EvalOverview } from "@devdigest/shared";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import { caseItem } from "../../../../../../../test/eval-fixtures";
import { EvalsTab } from "./EvalsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function overview(over: Partial<EvalOverview> = {}): EvalOverview {
  return {
    agent: { id: "ag1", name: "Security Reviewer", model: "gpt-4.1", enabled: true },
    cases_total: 2,
    finished_runs: 0,
    running_run_id: null,
    running_case_run: null,
    latest: null,
    previous: null,
    trend: [],
    runs: [],
    ...over,
  };
}

const CASES: EvalCaseListItem[] = [
  caseItem({ id: "c1", name: "stripe-key-leak" }),
  caseItem({ id: "c2", name: "sql-injection", created_at: "2026-09-18T10:00:00.000Z" }),
];

interface Call { method: string; url: string; path: string; body: unknown }
interface Reply { status: number; body?: unknown }

interface State {
  overview: EvalOverview;
  cases: EvalCaseListItem[];
  /** `GET /eval-runs/:id`. */
  run: (id: string) => Reply;
  /** The reply of `POST /eval-cases/:id/run`. */
  start?: () => Reply;
}

const runBody = (over: Record<string, unknown> = {}): Reply => ({
  status: 200,
  body: { id: "run9", status: "running", scope: "case", owner_kind: "agent", agent_id: "ag1", cases_total: 1, cases_done: 0, ...over },
});

function stubApi(state: State): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const call: Call = {
        method: init?.method ?? "GET",
        url,
        path: new URL(url).pathname,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      let r: Reply = { status: 200, body: null };
      if (call.method === "GET" && call.path === "/agents/ag1/eval-overview") r = { status: 200, body: state.overview };
      else if (call.method === "GET" && call.path === "/agents/ag1/eval-cases") r = { status: 200, body: state.cases };
      else if (call.method === "GET" && /^\/eval-runs\/[^/]+$/.test(call.path)) r = state.run(call.path.split("/")[2]!);
      else if (call.method === "POST" && /^\/eval-cases\/[^/]+\/run$/.test(call.path)) {
        r = state.start?.() ?? { status: 202, body: { id: "run9", status: "running" } };
      }
      return { ok: r.status >= 200 && r.status < 300, status: r.status, statusText: "", json: async () => r.body } as Response;
    }),
  );
  return calls;
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, shell: shellMessages, prReview: prReviewMessages }}>
        <EvalsTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const runBtn = (name: string) => screen.getByRole("button", { name: `Run case ${name}` });
const runningBtn = (name: string) => screen.getByRole("button", { name: `Running case ${name}` });
const runAll = () => screen.getByRole("button", { name: /Run all evals|Starting…/ });
const runs = (calls: Call[]) => calls.filter((c) => c.method === "POST" && /\/eval-cases\/[^/]+\/run$/.test(c.path));
const liveRegions = () => Array.from(document.querySelectorAll('[aria-live="polite"]')).map((el) => el.textContent ?? "");

describe("agent EvalsTab - row Run (AC-39, AC-41, AC-42, AC-49)", () => {
  it("AC-39/AC-41: Run sits on every row, posts with no body, shows 'Running…' on that row and disables every other run control", async () => {
    let polls = 0;
    const state: State = {
      overview: overview(),
      cases: CASES,
      run: () => {
        polls++;
        return polls < 2 ? runBody() : runBody({ status: "completed", cases_done: 1 });
      },
    };
    const calls = stubApi(state);
    renderTab();
    await screen.findByText("stripe-key-leak");
    await waitFor(() => expect(runAll()).toBeEnabled());
    expect(runBtn("stripe-key-leak")).toBeEnabled();
    expect(runBtn("sql-injection")).toBeEnabled();

    fireEvent.click(runBtn("stripe-key-leak"));
    await waitFor(() => expect(runs(calls)).toHaveLength(1));
    expect(runs(calls)[0]).toMatchObject({ path: "/eval-cases/c1/run", body: undefined });

    // AC-41: "Running…" on the row of that case; AC-49: nothing else of the agent can start
    const running = await waitFor(() => runningBtn("stripe-key-leak"));
    expect(running).toHaveTextContent("Running…");
    expect(running).toBeDisabled();
    expect(runBtn("sql-injection")).toBeDisabled();
    expect(runBtn("sql-injection").closest("[title]")).toHaveAttribute("title", "A run is in progress");
    expect(runAll()).toBeDisabled();
    fireEvent.click(runBtn("sql-injection"));
    expect(runs(calls)).toHaveLength(1);

    // AC-42: the run leaves `running` → polling stops, the announcement is made, the controls come back
    await waitFor(() => expect(liveRegions().join(" ")).toContain("Case run completed"), { timeout: 6000 });
    await waitFor(() => expect(runBtn("sql-injection")).toBeEnabled());
    expect(runBtn("stripe-key-leak")).toBeEnabled();
    expect(runAll()).toBeEnabled();
    // lists, overview and the case detail were re-read when it finished
    expect(calls.filter((c) => c.path === "/agents/ag1/eval-cases").length).toBeGreaterThan(1);
  }, 15_000);

  it("AC-49: a running SET run (running_run_id) disables every row Run and starts nothing on click", async () => {
    const calls = stubApi({
      overview: overview({ running_run_id: "set1" }),
      cases: CASES,
      run: () => runBody({ id: "set1", scope: "set", cases_total: 2 }),
    });
    renderTab();
    await screen.findByText("stripe-key-leak");
    await waitFor(() => expect(runBtn("stripe-key-leak")).toBeDisabled());
    expect(runBtn("sql-injection")).toBeDisabled();
    expect(runAll()).toBeDisabled();
    fireEvent.click(runBtn("stripe-key-leak"));
    expect(runs(calls)).toHaveLength(0);
  });

  it("AC-41/AC-49: a case run reported by the server (a reload, another tab) shows 'Running…' on ITS row, disables the rest and is followed", async () => {
    const calls = stubApi({
      overview: overview({ running_case_run: { run_id: "run5", case_id: "c2" } }),
      cases: CASES,
      run: (id) => runBody({ id }),
    });
    renderTab();
    await screen.findByText("sql-injection");
    expect(await waitFor(() => runningBtn("sql-injection"))).toHaveTextContent("Running…");
    expect(runBtn("stripe-key-leak")).toBeDisabled();
    expect(runAll()).toBeDisabled();
    await waitFor(() => expect(calls.some((c) => c.path === "/eval-runs/run5")).toBe(true));
  });

  it("EC-18: a 409 on start leaves every run control disabled by the owner's overview and follows no run of its own", async () => {
    const state: State = {
      overview: overview(),
      cases: CASES,
      run: () => runBody(),
      start: () => ({ status: 409, body: { error: { code: "eval_run_in_progress", message: "x", details: { run_id: "set7" } } } }),
    };
    const calls = stubApi(state);
    renderTab();
    await screen.findByText("stripe-key-leak");
    await waitFor(() => expect(runBtn("stripe-key-leak")).toBeEnabled());
    // somebody else's set run is what blocked it; the refetch after the start reports it
    state.overview = overview({ running_run_id: "set7" });
    fireEvent.click(runBtn("stripe-key-leak"));

    await waitFor(() => expect(runBtn("stripe-key-leak")).toBeDisabled());
    expect(runBtn("sql-injection")).toBeDisabled();
    expect(runAll()).toBeDisabled();
    expect(runs(calls)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Running case/ })).not.toBeInTheDocument(); // not this case's run
    expect(calls.some((c) => c.path === "/eval-runs/run9")).toBe(false);
  });
});

describe("agent EvalsTab - following a case run (EC-23, EC-24)", () => {
  it("EC-23: after 3 minutes still running it stops polling and says so; Run stays blocked by the server's overview", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = stubApi({
      overview: overview({ running_case_run: { run_id: "run5", case_id: "c1" } }),
      cases: CASES,
      run: (id) => runBody({ id }),
    });
    renderTab();
    await screen.findByText("stripe-key-leak");
    await waitFor(() => expect(calls.some((c) => c.path === "/eval-runs/run5")).toBe(true));

    await act(() => vi.advanceTimersByTimeAsync(2.5 * 60 * 1000));
    expect(screen.queryByText("The eval run is still in progress — reload to check its status")).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(60 * 1000));
    expect(screen.getByText("The eval run is still in progress — reload to check its status")).toBeInTheDocument();

    const stopped = calls.filter((c) => c.path === "/eval-runs/run5").length;
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(calls.filter((c) => c.path === "/eval-runs/run5")).toHaveLength(stopped);
    expect(runBtn("sql-injection")).toBeDisabled();
  }, 30_000);

  it("EC-24: a failed poll stops polling, shows Retry, and Retry resumes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let outage = false;
    const calls = stubApi({
      overview: overview({ running_case_run: { run_id: "run5", case_id: "c1" } }),
      cases: CASES,
      run: (id) => (outage ? { status: 500, body: { error: { code: "internal", message: "boom" } } } : runBody({ id })),
    });
    renderTab();
    await screen.findByText("stripe-key-leak");
    await waitFor(() => expect(calls.some((c) => c.path === "/eval-runs/run5")).toBe(true));
    outage = true;
    await act(() => vi.advanceTimersByTimeAsync(8000));

    expect(await screen.findByText("Couldn’t refresh the run status.")).toBeInTheDocument();
    const stopped = calls.filter((c) => c.path === "/eval-runs/run5").length;
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(calls.filter((c) => c.path === "/eval-runs/run5")).toHaveLength(stopped);

    outage = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText("Couldn’t refresh the run status.")).not.toBeInTheDocument());
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(calls.filter((c) => c.path === "/eval-runs/run5").length).toBeGreaterThan(stopped);
    // the live region is rendered the whole time (announcements need an existing region)
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  }, 30_000);
});
