/* EvalsTab.test.tsx — SPEC-08 Evals tab of the agent editor (AC-10..AC-18, AC-35/36,
   AC-39, EC-22, EC-23, UI-3). `fetch` is the outside world; hooks, api.ts and
   react-query are real. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, EvalCaseDetail, EvalCaseListItem, EvalOverview } from "@devdigest/shared";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import { caseItem, runRecord } from "../../../../../../../test/eval-fixtures";
import { EvalsTab } from "./EvalsTab";

/** Missing-translation errors seen by next-intl in the current test (NFR-6). */
const intlErrors: string[] = [];

afterEach(() => {
  intlErrors.length = 0;
  cleanup();
  vi.unstubAllGlobals();
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
    latest: null,
    previous: null,
    trend: [],
    runs: [],
    ...over,
  };
}

const PASSED = { run_id: "run1", state: "passed", expected_count: 1, got_count: 2, duration_ms: 900, cost_usd: 0.01, error_reason: null } as const;
const FAILED = { ...PASSED, state: "failed", expected_count: 1, got_count: 0 } as const;
const ERRORED = { ...PASSED, state: "errored", expected_count: null, got_count: null, error_reason: "provider timeout" } as const;

// Placeholder secret only (NFR-14); the HTML must reach the DOM as text (UI-3).
/** Pixel value of an inline size style ("" if unset → 0). jsdom computes no layout. */
function minPx(el: HTMLElement, prop: "width" | "height" | "minWidth" | "minHeight"): number {
  return parseFloat(el.style[prop]) || 0;
}

const HOSTILE_DIFF = [
  "diff --git a/src/config.ts b/src/config.ts",
  "--- a/src/config.ts",
  "+++ b/src/config.ts",
  "@@ -10,1 +10,2 @@",
  " const a = 1;",
  '+<img src=x onerror="alert(1)"> const key = "sk_live_xxx";',
].join("\n");

function detail(c: EvalCaseListItem, over: Partial<EvalCaseDetail> = {}): EvalCaseDetail {
  return {
    ...c,
    owner_kind: "agent",
    owner_id: "ag1",
    input_diff: HOSTILE_DIFF,
    input_meta: { pr_number: 7, repo_full_name: "acme/api", title: "Add <b>Stripe</b>", body: "Body <script>x</script>" },
    source_finding_id: "f1",
    notes: null,
    updated_at: c.created_at,
    source: { repo_id: "r1", pr_number: 7 },
    ...over,
  };
}

interface Api {
  overview: EvalOverview;
  cases: EvalCaseListItem[];
  detail?: EvalCaseDetail;
}
interface Call { method: string; url: string; body: unknown }

function stubApi(api: Api): Call[] {
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
      if (method === "GET" && url.endsWith("/agents/ag1/eval-overview")) json = api.overview;
      else if (method === "GET" && url.endsWith("/agents/ag1/eval-cases")) json = api.cases;
      else if (method === "GET" && /\/eval-cases\/[^/]+$/.test(url)) json = api.detail;
      else if (method === "PATCH") json = { ...api.detail, name: body.name };
      else if (method === "DELETE") status = 204;
      return { ok: true, status, statusText: "", json: async () => json } as Response;
    }),
  );
  return calls;
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        messages={{ eval: evalMessages, shell: shellMessages, prReview: prReviewMessages }}
        onError={(e) => intlErrors.push(e.message)}
      >
        <EvalsTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalsTab (SPEC-08)", () => {
  it("EC-22: an agent with no cases gets the empty state with a link to Pull Requests, and Run all is disabled", async () => {
    stubApi({ overview: overview({ cases_total: 0 }), cases: [] });
    renderTab();

    expect(
      await screen.findByText(/accept or dismiss findings on a PR, then click Turn into eval case/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Pull Requests" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
  });

  it("EC-23/AC-12: cases without a finished run show 'never run' everywhere and an em dash in every KPI card", async () => {
    stubApi({
      overview: overview(),
      cases: [caseItem({ id: "c1", name: "case-a" }), caseItem({ id: "c2", name: "case-b" })],
    });
    renderTab();

    const list = await screen.findByRole("list", { name: "Eval cases" });
    expect(within(list).getAllByText("never run")).toHaveLength(2);

    const kpis = screen.getByRole("group", { name: "Latest eval run metrics" });
    expect(within(kpis).getAllByText("—").length).toBeGreaterThanOrEqual(4);
    expect(within(kpis).getAllByText("No finished run yet").length).toBeGreaterThan(0);
    expect(screen.queryByText(/passing/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeEnabled();
  });

  it("AC-11/12/13/35/36/39: shows each case's latest result, '{passed} / {scored} passing', the KPI cards and the dashboard link", async () => {
    stubApi({
      overview: overview({
        finished_runs: 2,
        latest: runRecord(),
        previous: runRecord({
          id: "run0",
          metrics: runRecord().metrics && { ...runRecord().metrics!, recall: { value: 0.7, num: 7, den: 10 } },
        }),
      }),
      cases: [
        caseItem({ id: "c1", name: "case-pass", latest_result: PASSED }),
        caseItem({ id: "c2", name: "case-fail", latest_result: FAILED }),
        caseItem({ id: "c3", name: "case-err", latest_result: ERRORED }),
        caseItem({ id: "c4", name: "case-new", expectation: { type: "must_not_flag", file: "a.ts", start_line: 1, end_line: 2 } }),
      ],
    });
    renderTab();

    await screen.findByRole("list", { name: "Eval cases" });
    // errored and never-run cases are not scored (AC-13).
    expect(screen.getByText("1 / 2 passing")).toBeInTheDocument();
    expect(screen.getByText("expected 1, got 2")).toBeInTheDocument();
    expect(screen.getByText("errored: provider timeout")).toBeInTheDocument();
    expect(screen.getAllByText("src/config.ts:11-12")).toHaveLength(3);
    expect(screen.getAllByText("CRITICAL · security").length).toBeGreaterThan(0);
    expect(screen.getByText("a.ts:1-2")).toBeInTheDocument();

    const kpis = screen.getByRole("group", { name: "Latest eval run metrics" });
    expect(within(kpis).getByText("75%")).toBeInTheDocument(); // recall
    expect(within(kpis).getByText("80%")).toBeInTheDocument(); // precision
    expect(within(kpis).getByText("90%")).toBeInTheDocument(); // citation
    expect(within(kpis).getByText("3/4")).toBeInTheDocument(); // traces passed
    expect(within(kpis).getByText("3 of 4 must-find cases")).toBeInTheDocument();
    expect(within(kpis).getByText("TP 3 · FP 2 · unlabeled 5")).toBeInTheDocument();
    expect(within(kpis).getByText("▲ 5 pt")).toBeInTheDocument(); // 75 - 70
    expect(within(kpis).getByText("up 5 points")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/eval/agents/ag1");
  });

  it("AC-14/15/UI-3: the case modal shows the frozen input as escaped text and renames through PATCH", async () => {
    const c = caseItem({ id: "c1", name: "stripe-key-leak" });
    const calls = stubApi({ overview: overview(), cases: [c], detail: detail(c) });
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: "Open eval case stripe-key-leak" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Eval case · stripe-key-leak")).toBeInTheDocument();

    // Frozen PR meta and diff render as text, never as markup.
    expect(within(dialog).getByText("Add <b>Stripe</b>")).toBeInTheDocument();
    expect(within(dialog).getByText("Body <script>x</script>")).toBeInTheDocument();
    expect(dialog.querySelector("img")).toBeNull();
    expect(dialog.querySelector("script")).toBeNull();
    expect(dialog.querySelector("b")).toBeNull();
    expect(within(dialog).getByText(/<img src=x onerror="alert\(1\)">/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Open source PR #7" })).toHaveAttribute("href", "/repos/r1/pulls/7");

    // Save is disabled until the name changes; an empty name is rejected client-side.
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    const input = within(dialog).getByLabelText("Name");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Enter a name");
    expect(save).toBeDisabled();

    fireEvent.change(input, { target: { value: "renamed-case" } });
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((x) => x.method === "PATCH")).toBe(true));
    const patch = calls.find((x) => x.method === "PATCH")!;
    expect(patch.url).toMatch(/\/eval-cases\/c1$/);
    expect(patch.body).toEqual({ name: "renamed-case" });
  });

  it("EC-8: a case whose source PR is gone says 'Source no longer available' instead of a link", async () => {
    const c = caseItem({ id: "c1", name: "orphan" });
    stubApi({ overview: overview(), cases: [c], detail: detail(c, { source: null }) });
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: "Open eval case orphan" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Source no longer available")).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: /Open source PR/ })).not.toBeInTheDocument();
  });

  it("AC-16/17: deleting asks for confirmation naming the case, then calls DELETE; Cancel deletes nothing", async () => {
    const c = caseItem({ id: "c1", name: "stripe-key-leak" });
    const calls = stubApi({ overview: overview(), cases: [c] });
    renderTab();

    fireEvent.click(await screen.findByRole("button", { name: "Delete case stripe-key-leak" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/“stripe-key-leak” will be removed from this agent’s eval set/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls.some((x) => x.method === "DELETE")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Delete case stripe-key-leak" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete case" }));
    await waitFor(() => expect(calls.some((x) => x.method === "DELETE" && /\/eval-cases\/c1$/.test(x.url))).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("NFR-6/AC-35: every KPI card has a translated label, including Traces passed", async () => {
    stubApi({ overview: overview({ finished_runs: 1, latest: runRecord() }), cases: [caseItem()] });
    renderTab();
    const kpis = await screen.findByRole("group", { name: "Latest eval run metrics" });
    expect(within(kpis).getByText("Traces passed")).toBeInTheDocument();
    expect(intlErrors).toEqual([]);
  });
  it("NFR-7: delete buttons, the dashboard link and the empty-state link are at least 24x24", async () => {
    stubApi({ overview: overview(), cases: [caseItem({ id: "c1", name: "case-a" })] });
    renderTab();

    const del = await screen.findByRole("button", { name: "Delete case case-a" });
    expect(minPx(del, "width")).toBeGreaterThanOrEqual(24);
    expect(minPx(del, "height")).toBeGreaterThanOrEqual(24);
    expect(minPx(screen.getByRole("link", { name: "View full dashboard →" }), "minHeight")).toBeGreaterThanOrEqual(24);
    cleanup();

    stubApi({ overview: overview({ cases_total: 0 }), cases: [] });
    renderTab();
    const link = await screen.findByRole("link", { name: "Go to Pull Requests" });
    expect(minPx(link, "minHeight")).toBeGreaterThanOrEqual(24);
  });
});
