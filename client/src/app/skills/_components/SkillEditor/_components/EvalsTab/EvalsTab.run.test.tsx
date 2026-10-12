/* EvalsTab.run.test.tsx — the single-case run on the skill Evals tab (SPEC-10 AC-39, AC-40, AC-41,
   AC-42, AC-49, EC-18, EC-19, EC-23, EC-31): the row **Run** opens the carrier dialog (never posts
   straight away), the dialog posts `{carrier_agent_id}` to the case route, "Running…" on the row,
   every run control and the dialog's confirm disabled while ANY run of the skill executes, "Link
   this skill to an agent first" with no carrier, and the 6-minute wait. `fetch` is the outside
   world; hooks, api.ts and react-query are real. The existing EvalsTab.test.tsx covers the header,
   KPI row, list, effect labels and the set-run dialog. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalSkillCaseListItem, EvalSkillOverview, Skill } from "@devdigest/shared";
import evalMessages from "../../../../../../../messages/en/eval.json";
import skillsMessages from "../../../../../../../messages/en/skills.json";
import shellMessages from "../../../../../../../messages/en/shell.json";
import { useSkillEvalFlow } from "../../use-skill-eval-flow";
import { EvalsTab } from "./EvalsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const SKILL: Skill = {
  id: "sk1",
  name: "test-coverage-nudge",
  description: "d",
  type: "custom",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 2,
  token_estimate: 10,
  injection_flagged: false,
  injection_patterns: [],
};

const item = (id: string, name: string): EvalSkillCaseListItem => ({
  id,
  name,
  expectation: { type: "must_find", file: "src/a.ts", start_line: 3, end_line: 4, severity: "WARNING", category: "test" },
  created_at: "2026-10-01T00:00:00.000Z",
  source_finding_id: null,
  latest_result: null,
});
const CASES = [item("c1", "missing-test"), item("c2", "weak-assert")];

const CARRIERS = [{ agent_id: "a1", name: "Alpha", version: 1, model: "gpt-4.1", enabled: true, link_enabled: true }];

function overview(over: Partial<EvalSkillOverview> = {}): EvalSkillOverview {
  return {
    skill: { id: "sk1", name: SKILL.name, version: 2, enabled: true },
    cases_total: 2,
    running_run_id: null,
    running_case_run: null,
    carriers: CARRIERS,
    latest: null,
    previous: null,
    trend: [],
    ...over,
  };
}

interface Call { method: string; path: string; body: unknown }
interface Reply { status: number; body?: unknown }
interface State {
  overview: EvalSkillOverview;
  run: (id: string) => Reply;
  start?: () => Reply;
}

const skillRun = (over: Record<string, unknown> = {}): Reply => ({
  status: 200,
  body: { id: "run9", status: "running", scope: "case", owner_kind: "skill", skill_id: "sk1", cases_total: 1, cases_done: 0, ...over },
});

function stubApi(state: State): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: Call = {
        method: init?.method ?? "GET",
        path: new URL(String(input)).pathname,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      let r: Reply = { status: 200, body: null };
      if (call.method === "GET" && call.path === "/skills/sk1/eval-cases") r = { status: 200, body: CASES };
      else if (call.method === "GET" && call.path === "/skills/sk1/eval-overview") r = { status: 200, body: state.overview };
      else if (call.method === "GET" && /^\/eval-runs\/[^/]+$/.test(call.path)) r = state.run(call.path.split("/")[2]!);
      else if (call.method === "POST" && /^\/eval-cases\/[^/]+\/run$/.test(call.path)) {
        r = state.start?.() ?? { status: 202, body: { id: "run9", status: "running" } };
      }
      return { ok: r.status >= 200 && r.status < 300, status: r.status, statusText: "", json: async () => r.body } as Response;
    }),
  );
  return calls;
}

/** The tab wired to the real flow hook, as the skill editor does. */
function Harness() {
  const flow = useSkillEvalFlow(SKILL.id);
  return <EvalsTab skill={SKILL} flow={flow} />;
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, skills: skillsMessages, shell: shellMessages }}>
        <Harness />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const runBtn = (name: string) => screen.getByRole("button", { name: `Run case ${name}` });
const runAll = () => screen.getByRole("button", { name: "Run all evals" });
const caseRuns = (calls: Call[]) => calls.filter((c) => c.method === "POST" && /\/eval-cases\/[^/]+\/run$/.test(c.path));
const CARRIER_TITLE = "Run skill eval case";
const carrierDialog = async () => within((await screen.findByText(CARRIER_TITLE)).closest('[role="dialog"]') as HTMLElement);

describe("skill EvalsTab - row Run (AC-39, AC-40, AC-41, AC-42, AC-49)", () => {
  it("AC-39/AC-40: Run opens the carrier dialog and starts nothing by itself; confirming posts the carrier to the case route and the row shows 'Running…'", async () => {
    let polls = 0;
    const state: State = {
      overview: overview(),
      run: () => {
        polls++;
        if (polls < 2) return skillRun();
        state.overview = overview(); // the server no longer reports a running case run
        return skillRun({ status: "completed", cases_done: 1 });
      },
      // the server reports the run it just accepted on the next overview read (AC-48)
      start: () => {
        state.overview = overview({ running_case_run: { run_id: "run9", case_id: "c1" } });
        return { status: 202, body: { id: "run9", status: "running" } };
      },
    };
    const calls = stubApi(state);
    renderTab();
    await screen.findByText("missing-test");
    await waitFor(() => expect(runBtn("missing-test")).toBeEnabled());

    fireEvent.click(runBtn("missing-test"));
    const dialog = await carrierDialog();
    expect(caseRuns(calls)).toHaveLength(0);
    expect(dialog.getByText("1 case · 2 reviews")).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Run case" }));

    await waitFor(() => expect(caseRuns(calls)).toHaveLength(1));
    expect(caseRuns(calls)[0]).toMatchObject({ path: "/eval-cases/c1/run", body: { carrier_agent_id: "a1" } });
    await waitFor(() => expect(screen.queryByText(CARRIER_TITLE)).not.toBeInTheDocument());

    // AC-41/AC-49: that row reads "Running…"; every other control of the skill is disabled
    const running = await waitFor(() => screen.getByRole("button", { name: "Running case missing-test" }));
    expect(running).toHaveTextContent("Running…");
    expect(runBtn("weak-assert")).toBeDisabled();
    await waitFor(() => expect(runAll()).toBeDisabled());

    // AC-42: finished → announced, controls back
    await waitFor(
      () => expect(Array.from(document.querySelectorAll('[aria-live="polite"]')).map((e) => e.textContent).join(" ")).toContain("Case run completed"),
      { timeout: 6000 },
    );
    await waitFor(() => expect(runBtn("weak-assert")).toBeEnabled());
  }, 15_000);

  it("EC-31: cancelling the dialog starts no run", async () => {
    const calls = stubApi({ overview: overview(), run: () => skillRun() });
    renderTab();
    await screen.findByText("missing-test");
    await waitFor(() => expect(runBtn("missing-test")).toBeEnabled());
    fireEvent.click(runBtn("missing-test"));
    const dialog = await carrierDialog();
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText(CARRIER_TITLE)).not.toBeInTheDocument());
    expect(caseRuns(calls)).toHaveLength(0);
    expect(runBtn("missing-test")).toBeEnabled();
  });

  it("EC-19: with no linked agent every row Run is disabled with 'Link this skill to an agent first' and opens nothing", async () => {
    stubApi({ overview: overview({ carriers: [] }), run: () => skillRun() });
    renderTab();
    await screen.findByText("missing-test");
    await waitFor(() => expect(runBtn("missing-test")).toBeDisabled());
    expect(runBtn("weak-assert")).toBeDisabled();
    expect(runBtn("missing-test").closest("[title]")).toHaveAttribute("title", "Link this skill to an agent first");
    fireEvent.click(runBtn("missing-test"));
    expect(screen.queryByText(CARRIER_TITLE)).not.toBeInTheDocument();
  });

  it("AC-49: a running SET run disables every row Run and Run all evals; a running case run does too, and shows 'Running…' on its own row", async () => {
    stubApi({ overview: overview({ running_run_id: "set1" }), run: (id) => skillRun({ id, scope: "set", cases_total: 2 }) });
    renderTab();
    await screen.findByText("missing-test");
    await waitFor(() => expect(runBtn("missing-test")).toBeDisabled());
    expect(runBtn("weak-assert")).toBeDisabled();
    expect(runAll()).toBeDisabled();
    cleanup();

    stubApi({ overview: overview({ running_case_run: { run_id: "run5", case_id: "c2" } }), run: (id) => skillRun({ id }) });
    renderTab();
    await screen.findByText("weak-assert");
    const running = await waitFor(() => screen.getByRole("button", { name: "Running case weak-assert" }));
    expect(running).toHaveTextContent("Running…");
    expect(runBtn("missing-test")).toBeDisabled();
    expect(runAll()).toBeDisabled();
  });

  it("EC-18/AC-49: a start that finds another run executing (409) closes the dialog, follows no run as its own and leaves every control disabled", async () => {
    const state: State = { overview: overview(), run: () => skillRun() };
    const calls = stubApi(state);
    renderTab();
    await screen.findByText("missing-test");
    await waitFor(() => expect(runBtn("missing-test")).toBeEnabled());
    fireEvent.click(runBtn("missing-test"));
    const dialog = await carrierDialog();
    expect(dialog.getByRole("button", { name: "Run case" })).toBeEnabled();

    // another tab starts a set run in the meantime; the overview refetch after the rejected start reports it
    state.overview = overview({ running_run_id: "set1" });
    state.start = () => ({ status: 409, body: { error: { code: "eval_run_in_progress", message: "x", details: { run_id: "set1" } } } });
    fireEvent.click(dialog.getByRole("button", { name: "Run case" }));
    await waitFor(() => expect(caseRuns(calls)).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText(CARRIER_TITLE)).not.toBeInTheDocument()); // a 409 closes the dialog
    // EC-18: nothing of the skill can start; the 409's run is not followed as this case's run
    await waitFor(() => expect(runBtn("missing-test")).toBeDisabled());
    expect(runAll()).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Running case/ })).not.toBeInTheDocument();
  });
});

describe("skill EvalsTab - following a case run (EC-23)", () => {
  it("EC-23: a skill case run is followed for 6 minutes - no timeout sentence at 3 minutes, the sentence after 6", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = stubApi({
      overview: overview({ running_case_run: { run_id: "run5", case_id: "c1" } }),
      run: (id) => skillRun({ id }),
    });
    renderTab();
    await screen.findByText("missing-test");
    await waitFor(() => expect(calls.some((c) => c.path === "/eval-runs/run5")).toBe(true));

    await act(() => vi.advanceTimersByTimeAsync(3.5 * 60 * 1000));
    expect(screen.queryByText("The eval run is still in progress — reload to check its status")).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3 * 60 * 1000));
    expect(screen.getByText("The eval run is still in progress — reload to check its status")).toBeInTheDocument();

    const stopped = calls.filter((c) => c.path === "/eval-runs/run5").length;
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(calls.filter((c) => c.path === "/eval-runs/run5")).toHaveLength(stopped);
  }, 30_000);
});
