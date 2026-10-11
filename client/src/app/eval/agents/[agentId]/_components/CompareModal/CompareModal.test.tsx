/* CompareModal.test.tsx — SPEC-08 Compare modal (AC-45..AC-50, EC-26, UI-8, EC-25/34).
   `fetch` is the outside world; the hook, api.ts and react-query are real. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCompare } from "@devdigest/shared";
import evalMessages from "../../../../../../../messages/en/eval.json";
import { runRecord } from "../../../../../../test/eval-fixtures";
import { CompareModal } from "./CompareModal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OLD = runRecord({ id: "ra", agent_version: 1, cost_usd: 0.1, started_at: "2026-09-01T10:00:00.000Z" });
const NEW = runRecord({ id: "rb", agent_version: 2, cost_usd: 0.25, started_at: "2026-09-02T10:00:00.000Z" });

function compare(over: Partial<EvalCompare> = {}): EvalCompare {
  return {
    old: OLD,
    new: NEW,
    common_cases: 3,
    only_old: 1,
    only_new: 2,
    common: {
      old: { recall: 0.7, precision: 0.8, citation_accuracy: 0.9 },
      new: { recall: 0.75, precision: 0.78, citation_accuracy: 0.9 },
    },
    prompt_diff: [
      { kind: "context", text: "You are a reviewer." },
      { kind: "removed", text: "Be terse." },
      { kind: "added", text: 'Be <b>thorough</b> <img src=x onerror="alert(1)">' },
    ],
    prompt_changed: true,
    skills_diff: { added: ["secrets-scan"], removed: [], changed: ["sql-safety"] },
    model_change: { from: "gpt-4.1", to: "gpt-5" },
    strategy_change: null,
    ...over,
  };
}

function stub(reply: { status: number; body: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: reply.status < 300,
      status: reply.status,
      statusText: "",
      json: async () => reply.body,
    })) as unknown as typeof fetch,
  );
}

function renderModal(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <CompareModal runA="ra" runB="rb" onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onClose };
}

describe("CompareModal (SPEC-08)", () => {
  it("AC-45..AC-49: title, four cards with signed deltas, case counts, prompt diff and skills diff", async () => {
    stub({ status: 200, body: compare() });
    renderModal();

    expect(await screen.findByText("Compare runs · v1 → v2")).toBeInTheDocument();

    const recall = screen.getByRole("group", { name: "Recall" });
    expect(within(recall).getByText("70% → 75%")).toBeInTheDocument();
    expect(within(recall).getByText("▲ 5 pt")).toBeInTheDocument();
    const precision = screen.getByRole("group", { name: "Precision" });
    expect(within(precision).getByText("▼ 2 pt")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Citation" })).getByText("0 pt")).toBeInTheDocument();
    const cost = screen.getByRole("group", { name: "Cost" });
    expect(within(cost).getByText("$0.10 → $0.25")).toBeInTheDocument();
    expect(within(cost).getByText("▲ $0.15")).toBeInTheDocument();
    // The arrow is decoration; the direction is also spoken.
    expect(within(recall).getByText("up 5 points")).toBeInTheDocument();

    expect(screen.getByText("3 common cases · 1 only in v1 · 2 only in v2")).toBeInTheDocument();
    expect(screen.queryByText(/share no cases/)).not.toBeInTheDocument();
    expect(screen.getByText("model: gpt-4.1 → gpt-5")).toBeInTheDocument();
    expect(screen.getByText("Removed in v1")).toBeInTheDocument();
    expect(screen.getByText("Added in v2")).toBeInTheDocument();

    const skills = screen.getByRole("heading", { name: "Skills changed between v1 and v2" }).closest("section")!;
    expect(within(skills).getByText("secrets-scan")).toBeInTheDocument();
    expect(within(skills).getByText("sql-safety")).toBeInTheDocument();
  });

  it("UI-8: prompt lines are rendered as escaped text, never as markup", async () => {
    stub({ status: 200, body: compare() });
    renderModal();

    const heading = await screen.findByRole("heading", { name: "System prompt diff" });
    const section = heading.closest("section")!;
    expect(within(section).getByText('Be <b>thorough</b> <img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(section.querySelector("b")).toBeNull();
    expect(section.querySelector("img")).toBeNull();
  });

  it("AC-50: identical prompts show 'System prompt unchanged' instead of a diff, and no skills block", async () => {
    stub({
      status: 200,
      body: compare({ prompt_changed: false, prompt_diff: [], skills_diff: { added: [], removed: [], changed: [] }, model_change: null }),
    });
    renderModal();

    expect(await screen.findByText("System prompt unchanged")).toBeInTheDocument();
    expect(screen.queryByText("Be terse.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Skills changed between/)).not.toBeInTheDocument();
  });

  it("EC-26: runs with no common case get the notice and an em dash for every ratio delta", async () => {
    stub({
      status: 200,
      body: compare({
        common_cases: 0,
        only_old: 2,
        only_new: 2,
        common: {
          old: { recall: 0.7, precision: 0.8, citation_accuracy: 0.9 },
          new: { recall: 0.75, precision: 0.78, citation_accuracy: 0.9 },
        },
      }),
    });
    renderModal();

    expect(await screen.findByText("These runs share no cases — metrics are not comparable")).toBeInTheDocument();
    for (const name of ["Recall", "Precision", "Citation"]) {
      const card = screen.getByRole("group", { name });
      expect(within(card).getByText("— → —")).toBeInTheDocument();
      expect(within(card).getByText("no comparison available")).toBeInTheDocument();
    }
    // cost is the whole run's, still comparable
    expect(within(screen.getByRole("group", { name: "Cost" })).getByText("▲ $0.15")).toBeInTheDocument();
  });

  it("EC-20/EC-21: a null metric or null cost on one side shows an em dash delta, never 0", async () => {
    stub({
      status: 200,
      body: compare({
        old: { ...OLD, cost_usd: null },
        common: {
          old: { recall: null, precision: 0.8, citation_accuracy: 0.9 },
          new: { recall: 0.75, precision: 0.78, citation_accuracy: 0.9 },
        },
      }),
    });
    renderModal();

    const recall = await screen.findByRole("group", { name: "Recall" });
    expect(within(recall).getByText("— → 75%")).toBeInTheDocument();
    expect(within(recall).getByText("no comparison available")).toBeInTheDocument();
    const cost = screen.getByRole("group", { name: "Cost" });
    expect(within(cost).getByText("— → $0.25")).toBeInTheDocument();
    expect(cost).not.toHaveTextContent("$0.00");
  });

  it("EC-34/EC-25: 422 run_not_finished, 422 runs_not_comparable and 404 each get their own message", async () => {
    const cases = [
      [{ status: 422, body: { error: { code: "run_not_finished", message: "x" } } }, "Only finished runs can be compared"],
      [{ status: 422, body: { error: { code: "runs_not_comparable", message: "x" } } }, "These runs belong to different agents and can’t be compared"],
      [{ status: 404, body: { error: { code: "not_found", message: "x" } } }, "One of these runs no longer exists"],
    ] as const;
    for (const [reply, text] of cases) {
      stub(reply);
      renderModal();
      expect(await screen.findByText(text)).toBeInTheDocument();
      cleanup();
    }
  });

  it("Escape and the close button both close the modal", async () => {
    stub({ status: 200, body: compare() });
    const { onClose } = renderModal();
    await screen.findByText("Compare runs · v1 → v2");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

