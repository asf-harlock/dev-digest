/* RunDetailModal.test.tsx — SPEC-08 per-case results of a run (AC-37, UI-5, EC-13, EC-29). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCaseOutcome, EvalRunDetail } from "@devdigest/shared";
import evalMessages from "../../../../../../../messages/en/eval.json";
import { runDetail } from "../../../../../../test/eval-fixtures";
import { RunDetailModal } from "./RunDetailModal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const LONG = "a-very-long-case-name-".repeat(8);

function outcome(over: Partial<EvalCaseOutcome>): EvalCaseOutcome {
  return {
    case_id: "c1",
    name: "stripe-key-leak",
    expectation_type: "must_find",
    status: "scored",
    pass: true,
    error_reason: null,
    expected_count: 1,
    got_count: 2,
    findings: [],
    grounding_kept: 2,
    grounding_total: 3,
    duration_ms: 1800,
    cost_usd: 0.05,
    ...over,
  };
}

const RUN: EvalRunDetail = runDetail({
  case_results: [
    outcome({
      findings: [
        { file: "src/config.ts", start_line: 11, end_line: 12, title: "<b>Hardcoded</b> secret", severity: "CRITICAL", category: "security", label: "tp" },
        { file: "src/other.ts", start_line: 3, end_line: 3, title: "Noise", severity: "INFO", category: "style", label: "fp" },
      ],
    }),
    outcome({ case_id: "c2", name: LONG, expectation_type: "must_not_flag", pass: false, expected_count: 0, got_count: 1 }),
    outcome({
      case_id: "c3",
      name: "broken",
      status: "errored",
      pass: null,
      expected_count: null,
      got_count: null,
      error_reason: "provider timeout",
      cost_usd: null,
    }),
    outcome({ case_id: "c4", name: "quiet", findings: [] , expected_count: 1, got_count: 0, pass: false }),
  ],
  snapshot: { provider: "openai", model: "gpt-4.1", strategy: "single-pass", system_prompt: "p", skills: [{ name: "sql-safety", body: "b" }] },
});

function stub(reply: { status: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: reply.status < 300, status: reply.status, statusText: "", json: async () => reply.body })) as unknown as typeof fetch,
  );
}

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <RunDetailModal runId="run1" onClose={() => {}} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("RunDetailModal (SPEC-08)", () => {
  it("AC-37: lists every case with type, state, expected/got, kept findings with their labels and run settings", async () => {
    stub({ status: 200, body: RUN });
    renderModal();

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/^Run v2 · /)).toBeInTheDocument();
    expect(within(dialog).getByText("4 of 4 cases")).toBeInTheDocument();
    expect(within(dialog).getByText("gpt-4.1")).toBeInTheDocument();
    expect(within(dialog).getByText("sql-safety")).toBeInTheDocument();

    const first = within(dialog).getByText("stripe-key-leak").closest("li")!;
    expect(within(first).getByText("must find")).toBeInTheDocument();
    expect(within(first).getByText("passed")).toBeInTheDocument();
    expect(within(first).getByText("expected 1, got 2")).toBeInTheDocument();
    expect(within(first).getByText("grounding 2/3")).toBeInTheDocument();
    expect(within(first).getByText("src/config.ts:11-12")).toBeInTheDocument();
    expect(within(first).getByText("TP")).toBeInTheDocument();
    expect(within(first).getByText("FP")).toBeInTheDocument();

    const failed = within(dialog).getByText(LONG).closest("li")!;
    expect(within(failed).getByText("must not flag")).toBeInTheDocument();
    expect(within(failed).getByText("failed")).toBeInTheDocument();
    expect(within(dialog).getByText("quiet").closest("li")).toHaveTextContent("No findings kept");
  });

  it("UI-5: a finding title is escaped text, not markup", async () => {
    stub({ status: 200, body: RUN });
    renderModal();
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("<b>Hardcoded</b> secret")).toBeInTheDocument();
    expect(dialog.querySelector("b")).toBeNull();
  });

  it("EC-29: a long case name is truncated visually but its full text stays in title and in the DOM", async () => {
    stub({ status: 200, body: RUN });
    renderModal();
    const name = await screen.findByText(LONG);
    expect(name).toHaveAttribute("title", LONG);
  });

  it("EC-12: an errored case shows the error reason and em dashes, with no findings list", async () => {
    stub({ status: 200, body: RUN });
    renderModal();
    const row = (await screen.findByText("broken")).closest("li")!;
    expect(within(row).getByText("errored")).toBeInTheDocument();
    expect(within(row).getByText("Error: provider timeout")).toBeInTheDocument();
    expect(within(row).getByText("—", { selector: "span" })).toBeInTheDocument();
    expect(within(row).queryByRole("list")).not.toBeInTheDocument();
  });

  it("EC-13: an errored run with no metrics shows the first error reason and the no-metrics note", async () => {
    stub({
      status: 200,
      body: runDetail({ status: "errored", metrics: null, error_reason: "provider timeout", case_results: [] }),
    });
    renderModal();
    expect(await screen.findByText("Reason: provider timeout")).toBeInTheDocument();
    expect(screen.getByText("No case could be scored in this run.")).toBeInTheDocument();
  });

  it("shows an error state when the run cannot be loaded", async () => {
    stub({ status: 404, body: { error: { code: "not_found", message: "x" } } });
    renderModal();
    expect(await screen.findByText("Couldn’t load this run.")).toBeInTheDocument();
  });
});
