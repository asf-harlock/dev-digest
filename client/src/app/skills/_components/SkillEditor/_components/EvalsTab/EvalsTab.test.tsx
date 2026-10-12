/* EvalsTab.test.tsx — SPEC-09 skill Evals tab: Phase A (AC-1, AC-3, AC-9, AC-12, AC-13,
   AC-16..AC-19, EC-29, EC-30, EC-33) and the run flow of Phase B (AC-2, AC-4, AC-20..AC-22,
   AC-33..AC-35, EC-11, EC-13, EC-31, EC-46). `fetch` is the outside world; hooks, api.ts
   and react-query are real. The tab gets its `flow` from the real `useSkillEvalFlow`. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  EvalCaseDetail,
  EvalSkillCaseListItem,
  EvalSkillOverview,
  EvalSkillRunRecord,
  Skill,
} from "@devdigest/shared";
import evalMessages from "../../../../../../../messages/en/eval.json";
import skillsMessages from "../../../../../../../messages/en/skills.json";
import shellMessages from "../../../../../../../messages/en/shell.json";
import { useSkillEvalFlow } from "../../use-skill-eval-flow";
import { RunDialog } from "../RunDialog";
import { EvalsTab } from "./EvalsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

function item(over: Partial<EvalSkillCaseListItem> = {}): EvalSkillCaseListItem {
  return {
    id: "c1",
    name: "missing-test",
    expectation: { type: "must_find", file: "src/a.ts", start_line: 3, end_line: 4, severity: "WARNING", category: "test" },
    created_at: "2026-10-01T00:00:00.000Z",
    source_finding_id: null,
    latest_result: null,
    ...over,
  };
}

function detail(c: EvalSkillCaseListItem): EvalCaseDetail {
  return {
    id: c.id,
    owner_kind: "skill",
    owner_id: "sk1",
    name: c.name,
    input_diff: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,4 @@\n a\n+b\n+c\n+d",
    input_meta: { pr_number: null, repo_full_name: null, title: "T", body: null },
    expectation: c.expectation,
    source_finding_id: null,
    notes: null,
    created_at: c.created_at,
    updated_at: c.created_at,
    source: null,
    latest_result: null,
  };
}

interface Call { method: string; url: string; body: unknown }

function runRecord(over: Partial<EvalSkillRunRecord> = {}): EvalSkillRunRecord {
  const ratio = (value: number | null, num = 0, den = 0) => ({ value, num, den });
  const arm = (recall: number, passed: number) => ({
    recall: ratio(recall, 1, 2),
    precision: ratio(0.5, 1, 2),
    citation_accuracy: ratio(1, 2, 2),
    tp: 1,
    fp: 1,
    unlabeled: 0,
    traces_passed: passed,
    traces_total: 4,
    cases_errored: 0,
  });
  return {
    id: "r1",
    owner_kind: "skill",
    skill_id: "sk1",
    skill_name: "test-coverage-nudge",
    skill_version: 2,
    carrier: { agent_id: "a2", name: "Beta", version: 3, model: "gpt-4.1" },
    status: "completed",
    started_at: "2026-10-01T10:00:00.000Z",
    finished_at: "2026-10-01T10:05:00.000Z",
    cases_total: 4,
    cases_done: 4,
    with: arm(0.54, 3),
    without: arm(0.5, 1),
    lift: { recall: 0.04, precision: 0, citation_accuracy: 0 },
    cost_usd: 0.2,
    duration_ms: 300_000,
    error_reason: null,
    ...over,
  };
}

function overviewOf(cases: number, over: Partial<EvalSkillOverview> = {}): EvalSkillOverview {
  return {
    skill: { id: "sk1", name: SKILL.name, version: 2, enabled: true },
    cases_total: cases,
    running_run_id: null,
    carriers: [],
    latest: null,
    previous: null,
    trend: [],
    ...over,
  };
}

const CARRIERS = [
  { agent_id: "a2", name: "Beta", version: 3, model: "gpt-4.1", enabled: true, link_enabled: true },
  { agent_id: "a1", name: "Alpha", version: 1, model: "claude", enabled: true, link_enabled: true },
];

interface ApiState {
  cases: EvalSkillCaseListItem[];
  /** Defaults to "no carriers, no run" with `cases_total` following `cases`. */
  overview?: Partial<EvalSkillOverview>;
  /** What `GET /eval-runs/:id` returns. */
  run?: Record<string, unknown>;
}

function stubApi(state: ApiState): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = String(input);
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, url, body });
      let json: unknown = null;
      let status = 200;
      if (method === "GET" && url.endsWith("/skills/sk1/eval-cases")) json = state.cases;
      else if (method === "GET" && url.endsWith("/skills/sk1/eval-overview")) {
        json = overviewOf(state.cases.length, state.overview);
      } else if (method === "GET" && /\/eval-runs\/[^/]+$/.test(url)) json = state.run;
      else if (method === "POST" && url.endsWith("/skills/sk1/eval-runs")) {
        json = { id: "run9", status: "running" };
        status = 202;
      }
      else if (method === "GET" && /\/eval-cases\/c1$/.test(url)) json = detail(state.cases[0]!);
      else if (method === "POST" && url.endsWith("/skills/sk1/eval-cases")) {
        const created = item({ id: "c9", name: body.name, created_at: "2026-10-02T00:00:00.000Z" });
        state.cases = [created, ...state.cases];
        json = { ...detail(created), source_finding_id: null };
        status = 201;
      } else if (method === "DELETE") {
        state.cases = state.cases.filter((c) => !url.endsWith(`/${c.id}`));
        status = 204;
      }
      return { ok: true, status, statusText: "", json: async () => json } as Response;
    }),
  );
  return calls;
}

/** The tab plus the dialog the editor renders for it, wired to the real flow hook. */
function Harness({ skill }: { skill: Skill }) {
  const flow = useSkillEvalFlow(skill.id);
  return (
    <>
      <EvalsTab skill={skill} flow={flow} />
      {flow.dialogOpen && flow.overview.data && (
        <RunDialog
          skill={skill}
          overview={flow.overview.data}
          onClose={flow.closeDialog}
          onStarted={flow.onStarted}
        />
      )}
    </>
  );
}

function renderTab(skill: Skill = SKILL) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        messages={{ eval: evalMessages, skills: skillsMessages, shell: shellMessages }}
      >
        <Harness skill={skill} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("skill EvalsTab", () => {
  it("AC-1/AC-3/EC-30/EC-33: lists the cases with state, name, tag, range, edit before delete; Run all stays disabled with its reason", async () => {
    const long = "n".repeat(70);
    stubApi({
      cases: [
        item({ id: "c1", name: "missing-test" }),
        item({
          id: "c2",
          name: long,
          expectation: { type: "must_not_flag", file: "src/very/long/path/file.ts", start_line: 1, end_line: 9 },
          latest_result: {
            run_id: "r1",
            with_state: "passed",
            without_state: "failed",
            effect: "helped",
            expected_count: 1,
            got_count: 2,
            cost_usd: 0.01,
            error_reason: null,
          },
        }),
      ],
    });
    renderTab();

    expect(screen.getByRole("heading", { name: "Eval cases" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Skill eval cases" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    // Row 1: never run icon, MUST FIND badge, SEVERITY · category tag (SPEC-10 AC-29).
    expect(within(rows[0]!).getByRole("img", { name: "never run" })).toBeInTheDocument();
    expect(within(rows[0]!).getByText("MUST FIND")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("WARNING · test")).toBeInTheDocument();
    expect(within(rows[0]!).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Open eval case missing-test",
      "Edit case missing-test",
      "Delete case missing-test",
    ]);

    // Row 2: with-skill result (no recall for must_not_flag, SPEC-10 AC-30), MUST NOT FLAG badge,
    // truncated name keeps its full text in a title.
    expect(within(rows[1]!).getByRole("img", { name: "passed" })).toBeInTheDocument();
    expect(within(rows[1]!).getByText("expected 1 finding, got 2")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("MUST NOT FLAG")).toBeInTheDocument();
    expect(within(rows[1]!).getByText(long)).toHaveAttribute("title", long);

    // No agent linked → Run all evals is disabled with its reason (EC-11).
    const runAll = screen.getByRole("button", { name: "Run all evals" });
    await waitFor(() => expect(runAll).toBeDisabled());
    expect(runAll.parentElement).toHaveAttribute("title", "Link this skill to an agent first");
    // No finished run → "0/0 passing" and no value in any KPI card (SPEC-10 AC-28, AC-31).
    expect(screen.getByText("0/0 passing")).toBeInTheDocument();
    expect(screen.getByText("2 cases")).toBeInTheDocument();
  });

  it("EC-29: no cases shows the empty state with a New eval case action", async () => {
    stubApi({ cases: [] });
    renderTab();
    expect(
      await screen.findByText(
        "No eval cases yet — create one from a diff, or turn a finding into a skill eval case on a PR",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "New eval case" })).toHaveLength(2);
  });

  it("AC-9/AC-12: creating a case posts to the skill's route, closes the editor and shows it at the top as never run", async () => {
    const calls = stubApi({ cases: [item({ id: "c1", name: "older" })] });
    renderTab();
    await screen.findByRole("list", { name: "Skill eval cases" });

    fireEvent.click(screen.getAllByRole("button", { name: "New eval case" })[0]!);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "brand-new" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Diff" }), {
      target: { value: "@@ -1,1 +1,2 @@\n a\n+b" },
    });
    fireEvent.change(within(dialog).getByLabelText("Expected output"), {
      target: { value: JSON.stringify([{ file: "src/a.ts", start_line: 2, end_line: 2 }]) },
    });
    fireEvent.click(within(dialog).getByRole("tab", { name: "PR meta" }));
    fireEvent.change(within(dialog).getByLabelText("PR title"), { target: { value: "T" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/skills/sk1/eval-cases"))).toBe(true);
    // Scoped to the case list: the trend legend (SPEC-09 C3) is a list too.
    const caseList = () => screen.getByRole("list", { name: "Skill eval cases" });
    await waitFor(() => expect(within(caseList()).getAllByRole("listitem")).toHaveLength(2));
    const top = within(caseList()).getAllByRole("listitem")[0]!;
    expect(within(top).getByText("brand-new")).toBeInTheDocument();
    expect(within(top).getByRole("img", { name: "never run" })).toBeInTheDocument();
  });

  it("AC-13/AC-17/AC-18: edit opens the stored case; delete asks naming the case and removes its row", async () => {
    const calls = stubApi({ cases: [item({ id: "c1", name: "missing-test" })] });
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: "Edit case missing-test" }));
    const editor = await screen.findByRole("dialog");
    expect(await within(editor).findByText("Eval case · missing-test")).toBeInTheDocument();
    expect(within(editor).getByLabelText("Name")).toHaveValue("missing-test");
    fireEvent.click(within(editor).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Delete case missing-test" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/“missing-test” will be removed from this skill’s eval set/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete case" }));

    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/eval-cases/c1"))).toBe(true));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Skill eval cases" })).not.toBeInTheDocument());
    expect(await screen.findByText(/create one from a diff/)).toBeInTheDocument();
  });
});

describe("skill EvalsTab run flow (SPEC-09 Phase B)", () => {
  const helped = {
    run_id: "r1",
    with_state: "passed" as const,
    without_state: "failed" as const,
    effect: "helped" as const,
    expected_count: 1,
    got_count: 1,
    cost_usd: 0.01,
    error_reason: null,
  };

  it("AC-2/AC-4/AC-35: shows the passing count, the lift in signed points and each row's effect with both arms", async () => {
    stubApi({
      cases: [item({ id: "c1", name: "missing-test", latest_result: helped })],
      overview: { carriers: CARRIERS, latest: runRecord() },
    });
    renderTab();

    expect(await screen.findByText("3/4 passing")).toBeInTheDocument();
    // SPEC-10 AC-31: the EVAL METRICS label, the caption and the four KPI cards of the with-skill arm.
    expect(screen.getByRole("heading", { name: "EVAL METRICS" })).toBeInTheDocument();
    expect(screen.getByText(/Scoring is mechanical/)).toBeInTheDocument();
    const kpis = screen.getByRole("group", { name: "Latest eval run metrics" });
    expect(within(kpis).getByText("54%")).toBeInTheDocument(); // with-skill recall, not the without arm's 50%
    expect(within(kpis).getByText("3/4")).toBeInTheDocument(); // with-skill traces passed
    expect(screen.queryByRole("link", { name: /full dashboard/ })).not.toBeInTheDocument();
    expect(
      screen.getByText("Lift vs. without skill — recall ▲ 4 pt · precision 0 pt · citation 0 pt"),
    ).toBeInTheDocument();
    const row = within(await screen.findByRole("list", { name: "Skill eval cases" })).getAllByRole("listitem")[0]!;
    expect(within(row).getByText("helped")).toBeInTheDocument();
    expect(within(row).getByText("with skill: passed · without: failed")).toBeInTheDocument();
  });

  it("AC-4: every effect has its own text label", async () => {
    const effects = [
      ["hurt", "hurt"],
      ["no_effect_pass", "no effect · pass"],
      ["no_effect_fail", "no effect · fail"],
      ["errored", "errored"],
    ] as const;
    stubApi({
      cases: effects.map(([effect], i) =>
        item({ id: `c${i}`, name: `case-${i}`, latest_result: { ...helped, effect } }),
      ),
      overview: { carriers: CARRIERS, latest: runRecord() },
    });
    renderTab();
    const rows = within(await screen.findByRole("list", { name: "Skill eval cases" })).getAllByRole("listitem");
    effects.forEach(([, label], i) => {
      expect(within(rows[i]!).getAllByText(label).length).toBeGreaterThan(0);
    });
  });

  it("EC-30: a never-run skill shows no KPI value, no lift and an empty passing pill", async () => {
    stubApi({ cases: [item()], overview: { carriers: CARRIERS } });
    renderTab();
    expect(await screen.findByText("Lift vs. without skill: —")).toBeInTheDocument();
    expect(screen.getByText("0/0 passing")).toBeInTheDocument();
    expect(screen.getAllByText("No finished run yet").length).toBeGreaterThan(0);
  });

  it("EC-13: no cases disables Run all evals with its hint", async () => {
    stubApi({ cases: [], overview: { carriers: CARRIERS } });
    renderTab();
    const runAll = screen.getByRole("button", { name: "Run all evals" });
    await waitFor(() => expect(runAll.parentElement).toHaveAttribute("title", "Add an eval case first"));
    expect(runAll).toBeDisabled();
    expect(screen.getByText("Add an eval case first")).toBeInTheDocument();
  });

  it("AC-20..AC-22: the dialog preselects the latest carrier, shows the review count and starts the run with it", async () => {
    const calls = stubApi({
      cases: [item({ id: "c1" }), item({ id: "c2", name: "second" })],
      overview: { carriers: CARRIERS, latest: runRecord() },
    });
    renderTab();

    const runAll = screen.getByRole("button", { name: "Run all evals" });
    await waitFor(() => expect(runAll).toBeEnabled());
    fireEvent.click(runAll);

    const dialog = await screen.findByRole("dialog");
    const picker = within(dialog).getByRole("combobox");
    expect(within(dialog).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Alpha · v1 · claude",
      "Beta · v3 · gpt-4.1",
    ]);
    expect(picker).toHaveValue("a2"); // the latest run's carrier
    expect(within(dialog).getByText("2 cases · 4 reviews")).toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Run evals" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/skills/sk1/eval-runs"));
    expect(post?.body).toEqual({ carrier_agent_id: "a2" });
  });

  it("AC-20: with no earlier run the first agent by name is preselected", async () => {
    stubApi({ cases: [item()], overview: { carriers: CARRIERS } });
    renderTab();
    const runAll = screen.getByRole("button", { name: "Run all evals" });
    await waitFor(() => expect(runAll).toBeEnabled());
    fireEvent.click(runAll);
    expect(within(await screen.findByRole("dialog")).getByRole("combobox")).toHaveValue("a1");
  });

  it("EC-31/EC-46: warns about an injection-flagged skill and a disabled link, per chosen carrier, and still allows the run", async () => {
    stubApi({
      cases: [item()],
      overview: {
        carriers: [
          { agent_id: "a1", name: "Alpha", version: 1, model: "claude", enabled: true, link_enabled: false },
          { agent_id: "a2", name: "Beta", version: 3, model: "gpt-4.1", enabled: true, link_enabled: true },
        ],
      },
    });
    renderTab({ ...SKILL, injection_flagged: true, injection_patterns: ["instruction-override"] });
    const runAll = screen.getByRole("button", { name: "Run all evals" });
    await waitFor(() => expect(runAll).toBeEnabled());
    fireEvent.click(runAll);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "This skill was flagged for prompt injection — its text is sent to the model in every with-skill review",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("This skill or its link to Alpha is disabled — the with-skill arm includes it anyway"),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Run evals" })).toBeEnabled();

    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "a2" } });
    expect(within(dialog).queryByText(/is disabled — the with-skill arm/)).not.toBeInTheDocument();
  });

  it("EC-46: a disabled skill warns for any carrier", async () => {
    stubApi({ cases: [item()], overview: { carriers: CARRIERS } });
    renderTab({ ...SKILL, enabled: false });
    const runAll = screen.getByRole("button", { name: "Run all evals" });
    await waitFor(() => expect(runAll).toBeEnabled());
    fireEvent.click(runAll);
    expect(
      await within(await screen.findByRole("dialog")).findByText(
        "This skill or its link to Alpha is disabled — the with-skill arm includes it anyway",
      ),
    ).toBeInTheDocument();
  });

  it("AC-33: a running run disables Run all evals and shows 'Running case {k} of {n}' with k = cases_done + 1", async () => {
    stubApi({
      cases: [item()],
      overview: { carriers: CARRIERS, running_run_id: "r5" },
      run: { ...runRecord({ id: "r5", status: "running", cases_done: 1, cases_total: 4, with: null, without: null, lift: null }), snapshot: {}, case_set: [], case_results: [] },
    });
    renderTab();
    expect(await screen.findByText("Running case 2 of 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
  });

  it("AC-34: a finished run is announced in the polite live region and the status line stays", async () => {
    stubApi({
      cases: [item()],
      overview: { carriers: CARRIERS, running_run_id: "r5" },
      run: { ...runRecord({ id: "r5", status: "partial", with: { ...runRecord().with!, cases_errored: 2 } }), snapshot: {}, case_set: [], case_results: [] },
    });
    renderTab();
    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(await within(status).findByText("Eval run finished with 2 cases errored")).toBeInTheDocument();
  });

  it("SPEC-09 AC-36/AC-37/EC-27: the Metric trend plots the with-skill arm per run, x-axis v{skill version}, tooltip with carrier, model, signed lifts and total cost", async () => {
    stubApi({
      cases: [item()],
      overview: {
        carriers: CARRIERS,
        latest: runRecord(),
        trend: [
          {
            run_id: "r1",
            ran_at: "2026-10-01T10:05:00",
            skill_version: 1,
            carrier_agent_id: "a2",
            carrier_name: "Beta",
            carrier_version: 3,
            model: "gpt-4.1",
            recall: 0.54,
            precision: 0.5,
            citation_accuracy: null,
            lift: { recall: 0.04, precision: -0.02, citation_accuracy: null },
            cost_usd: 0.2,
          },
          {
            run_id: "r2",
            ran_at: "2026-10-02T10:05:00",
            skill_version: 2,
            carrier_agent_id: "a2",
            carrier_name: "Beta",
            carrier_version: 3,
            model: "gpt-4.1",
            recall: 0.6,
            precision: 0.5,
            citation_accuracy: 1,
            lift: { recall: 0.1, precision: 0, citation_accuracy: 0 },
            cost_usd: null,
          },
        ],
      },
    });
    renderTab();

    const chart = await screen.findByRole("img", { name: "Recall, precision and citation accuracy over the last 2 runs" });
    expect(within(chart).getByText("v1")).toBeInTheDocument();
    expect(within(chart).getByText("v2")).toBeInTheDocument();

    const runs = screen.getAllByRole("button", { name: /^v\d · / });
    expect(runs).toHaveLength(2);
    expect(runs[0]).toHaveAccessibleName(
      "v1 · 2026-10-01 10:05 · Beta v3 · gpt-4.1 · With skill: recall 54%, precision 50%, citation accuracy — · Lift: recall ▲ 4 pt, precision ▼ 2 pt, citation accuracy — · Cost (both arms) $0.20",
    );
    expect(runs[1]).toHaveAccessibleName(expect.stringContaining("Cost (both arms) —"));
    act(() => runs[0]!.focus());
    expect(screen.getByRole("tooltip").textContent).toBe(runs[0]!.getAttribute("aria-label"));
    fireEvent.keyDown(runs[0]!, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("SPEC-09 EC-30: a skill with cases but no finished run shows 'No runs yet' in place of the trend chart", async () => {
    stubApi({ cases: [item()], overview: { carriers: CARRIERS } });
    renderTab();
    expect(await screen.findByText("No runs yet")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /over the last/ })).not.toBeInTheDocument();
  });
});
