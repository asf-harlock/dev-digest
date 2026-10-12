/* CaseEditor.run.test.tsx — the single-case run of the Case Editor (SPEC-10 Phase B): the footer
   (AC-33), the **Run case** hints (AC-34, EC-19), the result banner in its live slot (AC-41, AC-43,
   AC-44), **Run on save** for both owners (AC-45, AC-51, EC-16, EC-17, EC-31), the carrier dialog
   stacked on the editor (AC-40, AC-49, Escape) and reopening mid-run (EC-15). `fetch` is the
   outside world; hooks, api.ts, react-query and the carrier dialog are real. The existing
   CaseEditor.test.tsx covers create / edit / seed / layout and is not repeated here. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCaseDetail, EvalCaseDraft, EvalCaseLatestResult, EvalOverview, EvalSkillOverview } from "@devdigest/shared";
import evalMessages from "../../../../messages/en/eval.json";
import shellMessages from "../../../../messages/en/shell.json";
import prReviewMessages from "../../../../messages/en/prReview.json";
import skillsMessages from "../../../../messages/en/skills.json";
import { CaseEditor } from "./CaseEditor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DIFF = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n keep\n+added";

function storedCase(over: Partial<EvalCaseDetail> = {}): EvalCaseDetail {
  return {
    id: "c1",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "manual-case",
    input_diff: DIFF,
    input_meta: { pr_number: null, repo_full_name: null, title: "A title", body: null },
    expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "WARNING", category: "bug", title: null },
    source_finding_id: null,
    notes: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    source: null,
    latest_result: null,
    ...over,
  };
}

const RESULT: EvalCaseLatestResult = {
  run_id: "r0",
  state: "failed",
  expected_count: 1,
  got_count: 0,
  duration_ms: 1500,
  cost_usd: 0.02,
  error_reason: null,
  findings: [],
};

function agentOverview(over: Partial<EvalOverview> = {}): EvalOverview {
  return {
    agent: { id: "ag1", name: "Security", model: "gpt-4.1", enabled: true },
    cases_total: 1,
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

const CARRIERS = [{ agent_id: "a1", name: "Alpha", version: 1, model: "gpt-4.1", enabled: true, link_enabled: true }];

function skillOverview(over: Partial<EvalSkillOverview> = {}): EvalSkillOverview {
  return {
    skill: { id: "sk1", name: "secrets", version: 2, enabled: true },
    cases_total: 1,
    running_run_id: null,
    running_case_run: null,
    carriers: CARRIERS,
    latest: null,
    previous: null,
    trend: [],
    ...over,
  };
}

const SKILL = {
  id: "sk1",
  name: "secrets",
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

interface Call { method: string; url: string; path: string; body: unknown }
interface Reply { status: number; body?: unknown }

interface World {
  /** Stored cases by id. */
  cases: Record<string, EvalCaseDetail>;
  agent: EvalOverview;
  skill: EvalSkillOverview;
  /** What `GET /eval-runs/:id` answers; a function so a test can flip it to finished. */
  run: (id: string) => Record<string, unknown>;
  /** Overrides of the write routes: return a Reply to take over. */
  write?: (call: Call) => Reply | undefined;
}

function stubApi(world: World): Call[] {
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
      const r = reply(world, call);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, statusText: "", json: async () => r.body } as Response;
    }),
  );
  return calls;
}

function reply(w: World, c: Call): Reply {
  const custom = w.write?.(c);
  if (custom) return custom;
  const caseId = c.path.match(/^\/eval-cases\/([^/]+)$/)?.[1];
  if (c.method === "GET" && caseId) {
    const found = w.cases[caseId];
    return found ? { status: 200, body: found } : { status: 404, body: { error: { code: "not_found", message: "x" } } };
  }
  if (c.method === "GET" && c.path === "/agents/ag1/eval-overview") return { status: 200, body: w.agent };
  if (c.method === "GET" && c.path === "/skills/sk1/eval-overview") return { status: 200, body: w.skill };
  if (c.method === "GET" && c.path === "/skills/sk1") return { status: 200, body: SKILL };
  const runId = c.path.match(/^\/eval-runs\/([^/]+)$/)?.[1];
  if (c.method === "GET" && runId) return { status: 200, body: w.run(runId) };
  if (c.method === "POST" && /^\/eval-cases\/[^/]+\/run$/.test(c.path)) return { status: 202, body: { id: "run9", status: "running" } };
  if (c.method === "PATCH" && caseId) return { status: 200, body: { ...w.cases[caseId], ...(c.body as object), replaced_from_id: null } };
  return { status: 200, body: null };
}

const runningRun = (over: Record<string, unknown> = {}) => ({
  id: "run9",
  status: "running",
  scope: "case",
  owner_kind: "agent",
  agent_id: "ag1",
  cases_total: 1,
  cases_done: 0,
  ...over,
});

function world(over: Partial<World> = {}): World {
  return {
    cases: { c1: storedCase() },
    agent: agentOverview(),
    skill: skillOverview(),
    run: () => runningRun(),
    ...over,
  };
}

function renderEditor(props: Partial<React.ComponentProps<typeof CaseEditor>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, shell: shellMessages, prReview: prReviewMessages, skills: skillsMessages }}>
        <CaseEditor owner={{ kind: "agent", id: "ag1" }} caseId="c1" onClose={onClose} onSaved={onSaved} {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onClose, onSaved };
}

const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const runCase = () => screen.getByRole("button", { name: "Run case" });
const runOnSave = () => screen.getByRole("switch", { name: "Run on save" });
const save = () => screen.getByRole("button", { name: "Save" });
const posts = (calls: Call[], pattern: RegExp) => calls.filter((c) => c.method === "POST" && pattern.test(c.path));
const RUN_ROUTE = /^\/eval-cases\/[^/]+\/run$/;

const CARRIER_TITLE = "Run skill eval case";
/** The carrier dialog (the kit Modal's dialog has no accessible name, so it is found by its title). */
const carrierDialog = async () => within((await screen.findByText(CARRIER_TITLE)).closest('[role="dialog"]') as HTMLElement);
const carrierGone = () => waitFor(() => expect(screen.queryByText(CARRIER_TITLE)).not.toBeInTheDocument());

/** Waits until the stored case has loaded into the editor. */
const loaded = async () => {
  await screen.findByText(/^Eval case · /);
};

// ---------------------------------------------------------------------------
// Footer, hints and the banner
// ---------------------------------------------------------------------------

describe("CaseEditor footer (AC-33, AC-34, EC-19)", () => {
  it("AC-33: the footer reads Run on save (off), Cancel, Run case with a play icon, Save - in that order", async () => {
    stubApi(world());
    renderEditor();
    await loaded();
    const toggle = runOnSave();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(runCase().querySelector("svg")).not.toBeNull();
    const follows = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(toggle, cancel)).toBe(true);
    expect(follows(cancel, runCase())).toBe(true);
    expect(follows(runCase(), save())).toBe(true);
  });

  it("AC-33: Run on save is off on every open, even after it was switched on before", async () => {
    stubApi(world());
    renderEditor();
    await loaded();
    fireEvent.click(runOnSave());
    expect(runOnSave()).toHaveAttribute("aria-checked", "true");
    cleanup();
    renderEditor();
    await loaded();
    expect(runOnSave()).toHaveAttribute("aria-checked", "false");
  });

  it("AC-34: a stored, unmodified case with no run of its owner can run; editing it disables Run case with 'Save your changes to run it'", async () => {
    stubApi(world());
    renderEditor();
    await loaded();
    await waitFor(() => expect(runCase()).toBeEnabled());
    expect(screen.queryByText("Save your changes to run it")).not.toBeInTheDocument();

    change("Name", "renamed");
    expect(runCase()).toBeDisabled();
    expect(screen.getByText("Save your changes to run it")).toBeInTheDocument();
    expect(runCase()).toHaveAccessibleDescription("Save your changes to run it");
  });

  it("AC-34: a new case and a seeded draft say 'Save the case to run it'", async () => {
    stubApi(world());
    renderEditor({ caseId: null });
    expect(runCase()).toBeDisabled();
    expect(screen.getByText("Save the case to run it")).toBeInTheDocument();
    cleanup();

    const seed: EvalCaseDraft = {
      name: "From finding: x",
      expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "CRITICAL", category: "security", title: "x" },
      input_diff: DIFF,
      input_meta: { pr_number: 7, repo_full_name: "acme/api", title: "PR", body: null },
      owners: [{ kind: "agent", id: "ag1", name: "Security", has_case: false, case_id: null }],
    };
    renderEditor({ owner: null, caseId: null, seed: { findingId: "f1", draft: seed } });
    expect(runCase()).toBeDisabled();
    expect(screen.getByText("Save the case to run it")).toBeInTheDocument();
  });

  it("AC-34/AC-49: any run of the owner - a set run or a case run - disables Run case with 'A run is in progress'", async () => {
    for (const agent of [agentOverview({ running_run_id: "set1" }), agentOverview({ running_case_run: { run_id: "run5", case_id: "other" } })]) {
      stubApi(world({ agent, run: (id) => runningRun({ id }) }));
      renderEditor();
      await loaded();
      await waitFor(() => expect(runCase()).toBeDisabled());
      expect(screen.getByText("A run is in progress")).toBeInTheDocument();
      cleanup();
    }
  });

  it("EC-19: a skill with no linked agent disables Run case and the Run on save switch, both with 'Link this skill to an agent first'", async () => {
    stubApi(
      world({
        cases: { c1: storedCase({ owner_kind: "skill", owner_id: "sk1" }) },
        skill: skillOverview({ carriers: [] }),
      }),
    );
    renderEditor({ owner: { kind: "skill", id: "sk1" } });
    await loaded();
    await waitFor(() => expect(runCase()).toBeDisabled());
    expect(screen.getAllByText("Link this skill to an agent first").length).toBeGreaterThan(0);
    expect(runOnSave()).toBeDisabled();
    expect(runOnSave()).toHaveAccessibleDescription("Link this skill to an agent first");
  });
});

describe("CaseEditor result banner (AC-41, AC-43, AC-44, EC-15)", () => {
  const slot = () => document.querySelector('[data-slot="result-banner"]') as HTMLElement;

  it("AC-43: the banner lives in a polite status slot and shows the stored result - failed, 0/1 passed, duration and cost", async () => {
    stubApi(world({ cases: { c1: storedCase({ latest_result: RESULT }) } }));
    renderEditor();
    await loaded();
    expect(slot()).toHaveAttribute("role", "status");
    expect(slot()).toHaveAttribute("aria-live", "polite");
    expect(within(slot()).getByText("Last run failed")).toBeInTheDocument();
    expect(within(slot()).getByText("0/1 passed · 1.5s · $0.02")).toBeInTheDocument();
  });

  it("AC-43/EC-21: an errored result shows its reason after a reload; an unpriced run shows an em dash", async () => {
    stubApi(
      world({
        cases: { c1: storedCase({ latest_result: { ...RESULT, state: "errored", error_reason: "provider timeout", expected_count: null, got_count: null, cost_usd: null } }) },
      }),
    );
    renderEditor();
    await loaded();
    expect(within(slot()).getByText("Last run errored: provider timeout")).toBeInTheDocument();
    expect(within(slot()).getByText("1.5s · —")).toBeInTheDocument();
  });

  it("AC-44: a skill case adds its effect label; Actual output comes from the result's findings", async () => {
    stubApi(
      world({
        cases: {
          c1: storedCase({
            owner_kind: "skill",
            owner_id: "sk1",
            latest_result: {
              ...RESULT,
              state: "passed",
              got_count: 1,
              effect: "helped",
              findings: [{ file: "src/a.ts", start_line: 2, end_line: 2, title: "t", severity: "INFO", category: "bug", label: "tp" }],
            },
          }),
        },
      }),
    );
    renderEditor({ owner: { kind: "skill", id: "sk1" } });
    await loaded();
    expect(within(slot()).getByText("Last run passed")).toBeInTheDocument();
    expect(within(slot()).getByText("Effect: helped")).toBeInTheDocument();
    expect(JSON.parse((screen.getByLabelText("Actual output") as HTMLTextAreaElement).value)[0]).toMatchObject({ label: "tp" });
  });

  it("EC-15: reopening the editor while its case still runs shows the running banner and blocks Run case; another case running does not", async () => {
    stubApi(world({ agent: agentOverview({ running_case_run: { run_id: "run9", case_id: "c1" } }) }));
    renderEditor();
    await loaded();
    expect(await within(slot()).findByText("Running…")).toBeInTheDocument();
    expect(runCase()).toBeDisabled();
    cleanup();

    stubApi(world({ agent: agentOverview({ running_case_run: { run_id: "run9", case_id: "someone-else" } }), cases: { c1: storedCase({ latest_result: RESULT }) } }));
    renderEditor();
    await loaded();
    await waitFor(() => expect(runCase()).toBeDisabled()); // the owner is busy...
    expect(within(slot()).queryByText("Running…")).not.toBeInTheDocument(); // ...but this case is not the one running
    expect(within(slot()).getByText("Last run failed")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Run case
// ---------------------------------------------------------------------------

describe("Run case (AC-35, AC-40, AC-41, AC-42)", () => {
  it("AC-35/AC-41/AC-42: an agent case posts with no body, shows 'Running…', polls and then shows the new result", async () => {
    const w = world();
    // the run finishes on its second poll; the stored case then carries its result
    let polls = 0;
    w.run = (id) => {
      polls++;
      if (polls < 2) return runningRun({ id });
      w.cases.c1 = storedCase({ latest_result: { ...RESULT, run_id: id, state: "passed", got_count: 1, duration_ms: 800 } });
      return runningRun({ id, status: "completed", cases_done: 1 });
    };
    const calls = stubApi(w);
    renderEditor();
    await loaded();
    await waitFor(() => expect(runCase()).toBeEnabled());

    fireEvent.click(runCase());
    const banner = () => document.querySelector('[data-slot="result-banner"]') as HTMLElement;
    expect(await within(banner()).findByText("Running…")).toBeInTheDocument();
    const [start] = posts(calls, RUN_ROUTE);
    expect(start).toMatchObject({ path: "/eval-cases/c1/run", body: undefined });
    expect(runCase()).toBeDisabled();

    expect(await within(banner()).findByText("Last run passed", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(within(banner()).getByText(/^1\/1 passed/)).toBeInTheDocument();
    expect(within(banner()).queryByText("Running…")).not.toBeInTheDocument();
    await waitFor(() => expect(runCase()).toBeEnabled());
    // polling stopped with the run
    const polled = calls.filter((c) => c.path === "/eval-runs/run9").length;
    await new Promise((r) => setTimeout(r, 2300));
    expect(calls.filter((c) => c.path === "/eval-runs/run9")).toHaveLength(polled);
  }, 15_000);

  it("AC-40: Run case of a skill-owned case opens the carrier dialog and posts the confirmed carrier; Cancel starts nothing", async () => {
    const calls = stubApi(
      world({
        cases: { c1: storedCase({ owner_kind: "skill", owner_id: "sk1" }) },
        run: (id) => runningRun({ id, owner_kind: "skill", skill_id: "sk1", agent_id: undefined }),
      }),
    );
    renderEditor({ owner: { kind: "skill", id: "sk1" } });
    await loaded();
    await waitFor(() => expect(runCase()).toBeEnabled());

    fireEvent.click(runCase());
    const dialog = await carrierDialog();
    expect(dialog.getByText("1 case · 2 reviews")).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await carrierGone();
    expect(posts(calls, RUN_ROUTE)).toHaveLength(0);

    fireEvent.click(runCase());
    const again = await carrierDialog();
    fireEvent.click(again.getByRole("button", { name: "Run case" }));
    await waitFor(() => expect(posts(calls, RUN_ROUTE)).toHaveLength(1));
    expect(posts(calls, RUN_ROUTE)[0]).toMatchObject({ path: "/eval-cases/c1/run", body: { carrier_agent_id: "a1" } });
    expect(await within(document.querySelector('[data-slot="result-banner"]') as HTMLElement).findByText("Running…")).toBeInTheDocument();
  });

  it("EC-18: a 409 on start follows no run of this case and leaves the controls disabled by the owner's overview", async () => {
    const w = world({
      write: (c) =>
        c.method === "POST" && RUN_ROUTE.test(c.path)
          ? { status: 409, body: { error: { code: "eval_run_in_progress", message: "x", details: { run_id: "other-run" } } } }
          : undefined,
    });
    const calls = stubApi(w);
    renderEditor();
    await loaded();
    await waitFor(() => expect(runCase()).toBeEnabled());
    // the owner's overview now reports the run that blocked the start
    w.agent = agentOverview({ running_case_run: { run_id: "other-run", case_id: "other" } });
    fireEvent.click(runCase());
    await waitFor(() => expect(runCase()).toBeDisabled());
    expect(screen.getByText("A run is in progress")).toBeInTheDocument();
    // the conflicting run is not this case's: no polling of it as its own, no running banner for this case
    expect(screen.queryByText("Running…")).not.toBeInTheDocument();
    expect(calls.some((c) => c.path === "/eval-runs/run9")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Run on save
// ---------------------------------------------------------------------------

describe("Run on save - agent-owned (AC-45, EC-16, EC-17)", () => {
  it("AC-45: saving an edit with the switch on keeps the editor open on the saved case and starts its run", async () => {
    const calls = stubApi(world());
    const { onClose } = renderEditor();
    await loaded();
    change("Name", "renamed");
    fireEvent.click(runOnSave());
    fireEvent.click(save());

    await waitFor(() => expect(posts(calls, RUN_ROUTE)).toHaveLength(1));
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ name: "renamed" });
    expect(posts(calls, RUN_ROUTE)[0]).toMatchObject({ path: "/eval-cases/c1/run" });
    expect(await within(document.querySelector('[data-slot="result-banner"]') as HTMLElement).findByText("Running…")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("without the switch a successful save closes the editor and starts nothing", async () => {
    const calls = stubApi(world());
    const { onClose } = renderEditor();
    await loaded();
    change("Name", "renamed");
    fireEvent.click(save());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(posts(calls, RUN_ROUTE)).toHaveLength(0);
  });

  it("EC-17: when the save replaced the case the run starts on the NEW id, which shows 'Never run yet' and no earlier-result banner", async () => {
    const w = world({
      cases: { c1: storedCase(), c2: storedCase({ id: "c2", latest_result: null }) },
      write: (c) => (c.method === "PATCH" ? { status: 200, body: { ...storedCase({ id: "c2" }), replaced_from_id: "c1" } } : undefined),
    });
    const calls = stubApi(w);
    const { onClose } = renderEditor();
    await loaded();
    change("Expected output", JSON.stringify([{ file: "src/a.ts", start_line: 2, end_line: 3, severity: "WARNING", category: "bug", title: null }]));
    fireEvent.click(runOnSave());
    fireEvent.click(save());

    await waitFor(() => expect(posts(calls, RUN_ROUTE)).toHaveLength(1));
    expect(posts(calls, RUN_ROUTE)[0]!.path).toBe("/eval-cases/c2/run");
    expect(calls.some((c) => c.method === "GET" && c.path === "/eval-cases/c2")).toBe(true);
    expect(await screen.findByText("Never run yet")).toBeInTheDocument();
    expect(screen.queryByText(/^Last run/)).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("EC-16: a rejected save (422) or a failed one (5xx) starts no run, keeps the editor open with its inputs and leaves the switch on", async () => {
    for (const rejected of [
      { status: 422, body: { error: { code: "range_outside_diff", message: "x" } } },
      { status: 500, body: { error: { code: "internal", message: "boom" } } },
    ]) {
      const calls = stubApi(world({ write: (c) => (c.method === "PATCH" ? rejected : undefined) }));
      const { onClose } = renderEditor();
      await loaded();
      change("Name", "renamed");
      fireEvent.click(runOnSave());
      fireEvent.click(save());
      await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
      await new Promise((r) => setTimeout(r, 30));

      expect(posts(calls, RUN_ROUTE)).toHaveLength(0);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Name")).toHaveValue("renamed");
      expect(runOnSave()).toHaveAttribute("aria-checked", "true");
      if (rejected.status === 422) {
        expect(await screen.findByText(/outside the diff's changed lines/)).toBeInTheDocument();
      }
      cleanup();
    }
  });

  it("AC-45: a seeded draft saved with the switch on stays open on the created case and runs it", async () => {
    const seed: EvalCaseDraft = {
      name: "From finding: x",
      expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "CRITICAL", category: "security", title: "x" },
      input_diff: DIFF,
      input_meta: { pr_number: 7, repo_full_name: "acme/api", title: "PR", body: null },
      owners: [{ kind: "agent", id: "ag1", name: "Security", has_case: false, case_id: null }],
    };
    const w = world({
      cases: { n1: storedCase({ id: "n1", name: "From finding: x" }) },
      write: (c) => (c.method === "POST" && c.path === "/findings/f1/eval-case" ? { status: 201, body: { id: "n1", owner_kind: "agent", owner_id: "ag1" } } : undefined),
    });
    const calls = stubApi(w);
    const { onClose, onSaved } = renderEditor({ owner: null, caseId: null, seed: { findingId: "f1", pullId: "pr1", draft: seed } });
    fireEvent.click(runOnSave());
    fireEvent.click(save());

    await waitFor(() => expect(posts(calls, RUN_ROUTE)).toHaveLength(1));
    expect(posts(calls, RUN_ROUTE)[0]!.path).toBe("/eval-cases/n1/run");
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText("Eval case · From finding: x")).toBeInTheDocument();
  });
});

describe("Run on save - skill-owned (AC-51, EC-31)", () => {
  const skillWorld = () => world({ cases: { c1: storedCase({ owner_kind: "skill", owner_id: "sk1" }) } });

  it("AC-51: the save keeps the editor open and opens the carrier dialog; confirming posts the carrier for the saved case", async () => {
    const calls = stubApi(skillWorld());
    const { onClose } = renderEditor({ owner: { kind: "skill", id: "sk1" } });
    await loaded();
    change("Name", "renamed");
    fireEvent.click(runOnSave());
    fireEvent.click(save());

    const dialog = await carrierDialog();
    expect(posts(calls, RUN_ROUTE)).toHaveLength(0); // nothing starts before the confirmation
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "Run case" }));
    await waitFor(() => expect(posts(calls, RUN_ROUTE)).toHaveLength(1));
    expect(posts(calls, RUN_ROUTE)[0]).toMatchObject({ path: "/eval-cases/c1/run", body: { carrier_agent_id: "a1" } });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("EC-31: cancelling the dialog starts no run and keeps the saved case in the open editor", async () => {
    const calls = stubApi(skillWorld());
    const { onClose } = renderEditor({ owner: { kind: "skill", id: "sk1" } });
    await loaded();
    change("Name", "renamed");
    fireEvent.click(runOnSave());
    fireEvent.click(save());

    const dialog = await carrierDialog();
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await carrierGone();
    expect(posts(calls, RUN_ROUTE)).toHaveLength(0);
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1); // the case is saved, once
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Eval case · manual-case")).toBeInTheDocument();
  });

  it("AC-49: with a run of the skill already executing the dialog opens but its confirm button stays disabled", async () => {
    const calls = stubApi(
      world({
        cases: { c1: storedCase({ owner_kind: "skill", owner_id: "sk1" }) },
        skill: skillOverview({ running_run_id: "set1" }),
      }),
    );
    renderEditor({ owner: { kind: "skill", id: "sk1" } });
    await loaded();
    change("Name", "renamed");
    fireEvent.click(runOnSave());
    fireEvent.click(save());
    const dialog = await carrierDialog();
    expect(dialog.getByRole("button", { name: "Run case" })).toBeDisabled();
    fireEvent.click(dialog.getByRole("button", { name: "Run case" }));
    expect(posts(calls, RUN_ROUTE)).toHaveLength(0);
  });

  it("Escape with the carrier dialog stacked closes only the dialog; the next Escape closes the editor", async () => {
    stubApi(skillWorld());
    const { onClose } = renderEditor({ owner: { kind: "skill", id: "sk1" } });
    await loaded();
    await waitFor(() => expect(runCase()).toBeEnabled());
    fireEvent.click(runCase());
    await carrierDialog();

    fireEvent.keyDown(window, { key: "Escape" });
    await carrierGone();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Eval case · manual-case")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// A run that stops being followed: the editor can be open with no Evals tab behind it
// (opened from a finding card), so it carries the timeout sentence and Retry itself.
// ---------------------------------------------------------------------------

describe("CaseEditor stalled run (EC-23, EC-24, AC-42)", () => {
  const slot = () => document.querySelector('[data-slot="result-banner"]') as HTMLElement;
  const TIMEOUT = "The eval run is still in progress — reload to check its status";
  const POLL_FAILED = "Couldn’t refresh the run status.";
  const failedPoll = { status: 500, body: { error: { code: "boom", message: "x" } } };
  const SEED: EvalCaseDraft = {
    name: "From finding: x",
    expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "CRITICAL", category: "security", title: "x" },
    input_diff: DIFF,
    input_meta: { pr_number: 7, repo_full_name: "acme/api", title: "PR", body: null },
    owners: [{ kind: "agent", id: "ag1", name: "Security", has_case: false, case_id: null }],
  };

  it("EC-23: after the 3-minute cap the modal says the run is still in progress, drops the running banner and no longer blocks Run case", async () => {
    stubApi(world({ agent: agentOverview({ running_case_run: { run_id: "run9", case_id: "c1" } }) }));
    renderEditor();
    await loaded();
    expect(await within(slot()).findByText("Running…")).toBeInTheDocument();
    expect(runCase()).toBeDisabled();

    // The poll window opened at the first running response; jump past the cap, the next tick gives up.
    const real = Date.now;
    vi.spyOn(Date, "now").mockImplementation(() => real() + 3 * 60 * 1000 + 1000);
    try {
      expect(await within(slot()).findByText(TIMEOUT, {}, { timeout: 6000 })).toBeInTheDocument();
    } finally {
      vi.restoreAllMocks();
    }
    expect(within(slot()).queryByText("Running…")).not.toBeInTheDocument();
    expect(screen.queryByText("A run is in progress")).not.toBeInTheDocument();
    expect(runCase()).toBeEnabled();
    // No second live region: the sentence sits inside the banner slot, which is the one region.
    expect(slot()).toHaveAttribute("aria-live", "polite");
    expect(slot().querySelector("[aria-live]")).toBeNull();
  }, 15_000);

  it("EC-24: a failed poll shows the message and Retry in the modal; Retry resumes following and the banner shows the result when the run finishes", async () => {
    const w = world({ agent: agentOverview({ running_case_run: { run_id: "run9", case_id: "c1" } }) });
    let polls = 0;
    let finished = false;
    w.write = (c) => {
      if (c.method !== "GET" || c.path !== "/eval-runs/run9") return undefined;
      polls++;
      return polls < 2 || finished ? undefined : failedPoll;
    };
    w.run = () => {
      if (!finished) return runningRun();
      w.cases.c1 = storedCase({ latest_result: { ...RESULT, run_id: "run9", state: "passed", got_count: 1, duration_ms: 800 } });
      w.agent = agentOverview(); // the server no longer reports a running case run
      return runningRun({ status: "completed", cases_done: 1 });
    };
    const calls = stubApi(w);
    renderEditor();
    await loaded();
    expect(await within(slot()).findByText("Running…")).toBeInTheDocument();

    expect(await within(slot()).findByText(POLL_FAILED, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(slot()).queryByText("Running…")).not.toBeInTheDocument();
    expect(runCase()).toBeEnabled();
    // Polling stopped: no further reads while the message is up.
    const reads = calls.filter((c) => c.path === "/eval-runs/run9").length;
    await new Promise((r) => setTimeout(r, 2300));
    expect(calls.filter((c) => c.path === "/eval-runs/run9")).toHaveLength(reads);

    finished = true;
    fireEvent.click(within(slot()).getByRole("button", { name: "Retry" }));
    expect(await within(slot()).findByText("Last run passed", {}, { timeout: 6000 })).toBeInTheDocument();
    expect(within(slot()).queryByText(POLL_FAILED)).not.toBeInTheDocument();
    expect(within(slot()).queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  }, 25_000);

  it("EC-24 from a finding-card mount: a run started by Run on save whose poll fails also shows the message and Retry in the modal", async () => {
    const w = world({
      cases: { n1: storedCase({ id: "n1", name: "From finding: x" }) },
      write: (c) => {
        if (c.method === "POST" && c.path === "/findings/f1/eval-case") return { status: 201, body: { id: "n1", owner_kind: "agent", owner_id: "ag1" } };
        if (c.method === "GET" && c.path === "/eval-runs/run9" && (c.body === undefined) && polled++ >= 1) return failedPoll;
        return undefined;
      },
    });
    let polled = 0;
    stubApi(w);
    renderEditor({ owner: null, caseId: null, seed: { findingId: "f1", pullId: "pr1", draft: SEED } });
    fireEvent.click(runOnSave());
    fireEvent.click(save());

    expect(await screen.findByText("Eval case · From finding: x")).toBeInTheDocument();
    expect(await within(slot()).findByText("Running…")).toBeInTheDocument();
    expect(await within(slot()).findByText(POLL_FAILED, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(slot()).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(within(slot()).queryByText("Running…")).not.toBeInTheDocument();
  }, 25_000);
});
