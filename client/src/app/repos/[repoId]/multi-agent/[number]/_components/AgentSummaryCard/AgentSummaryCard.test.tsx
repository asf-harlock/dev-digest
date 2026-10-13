/* AgentSummaryCard.test.tsx — SPEC-11 head of a Tabs panel (AC-24, AC-22, AC-40, EC-18). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runs from "../../../../../../../../messages/en/runs.json";
import { column } from "../../../../../../../test/multi-agent-fixtures";
import { AgentSummaryCard } from "./AgentSummaryCard";

afterEach(cleanup);

function renderCard(col: ReturnType<typeof column>, onOpenTrace = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <AgentSummaryCard column={col} onOpenTrace={onOpenTrace} />
    </NextIntlClientProvider>,
  );
  return onOpenTrace;
}

describe("AgentSummaryCard", () => {
  it("AC-24/40: a done run shows score, summary, duration and cost, and View trace opens that run", () => {
    const onOpenTrace = renderCard(column({ run_id: "run-x", summary: "Two real problems.", score: 64, duration_ms: 8200, cost_usd: 0.06 }));
    expect(screen.getByRole("img", { name: "Score 64" })).toBeInTheDocument();
    expect(screen.getByText("Two real problems.")).toBeInTheDocument();
    expect(screen.getByText("8.2s · $0.06")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View trace of Security Reviewer" }));
    expect(onOpenTrace).toHaveBeenCalledWith("run-x");
  });

  it("a done run without a summary says so; an unknown cost is a dash", () => {
    renderCard(column({ summary: null, cost_usd: null, duration_ms: 1500 }));
    expect(screen.getByText("No summary.")).toBeInTheDocument();
    expect(screen.getByText("1.5s · —")).toBeInTheDocument();
  });

  it("AC-22/EC-18: a failed run shows its error instead of a summary; a deleted agent is labelled", () => {
    renderCard(column({ agent_id: null, agent_name: null, status: "failed", error: "provider 429", score: null, summary: null }));
    expect(screen.getByText("Deleted agent")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("provider 429")).toBeInTheDocument();
    expect(screen.queryByText("No summary.")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Score/ })).not.toBeInTheDocument();
  });
});
