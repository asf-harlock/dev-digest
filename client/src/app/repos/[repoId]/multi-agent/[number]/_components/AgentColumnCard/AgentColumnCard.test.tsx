/* AgentColumnCard.test.tsx — SPEC-11 one agent's column (AC-21, AC-22, AC-23, EC-18, EC-19, EC-24, NFR-8). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runs from "../../../../../../../../messages/en/runs.json";
import { column, finding } from "../../../../../../../test/multi-agent-fixtures";
import { AgentColumnCard } from "./AgentColumnCard";

afterEach(cleanup);

function renderCard(col: ReturnType<typeof column>, onOpenTrace = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <AgentColumnCard column={col} onOpenTrace={onOpenTrace} />
    </NextIntlClientProvider>,
  );
  return onOpenTrace;
}

describe("AgentColumnCard", () => {
  it("AC-21/23, EC-24: a done column shows name, status text, score, duration and cost, finding cards worst first, the count without dismissed, and dismissed muted", () => {
    const onOpenTrace = renderCard(
      column({
        run_id: "run-a",
        agent_name: "Security Reviewer",
        score: 82,
        duration_ms: 8200,
        cost_usd: 0.06,
        findings: [
          finding({ id: "f1", severity: "SUGGESTION", title: "Rename helper", file: "src/b.ts", start_line: 3 }),
          finding({ id: "f2", severity: "CRITICAL", title: "SQL injection", file: "src/a.ts", start_line: 12 }),
          finding({ id: "f3", severity: "WARNING", title: "Old nit", dismissed_at: "2026-06-12T00:00:00Z" }),
        ],
      }),
    );

    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Score 82" })).toBeInTheDocument();
    expect(screen.getByText("8.2s · $0.06")).toBeInTheDocument();

    const list = screen.getByRole("list", { name: "Findings of Security Reviewer" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => within(li).getByText(/SQL injection|Rename helper|Old nit/).textContent)).toEqual([
      "SQL injection",
      "Old nit",
      "Rename helper",
    ]);
    expect(within(items[0]!).getByText("Critical")).toBeInTheDocument();
    expect(within(items[0]!).getByText("src/a.ts:12")).toBeInTheDocument();
    // EC-24: the dismissed one stays listed (tagged) but is not counted.
    expect(within(items[1]!).getByText("dismissed")).toBeInTheDocument();
    expect(screen.getByText("2 findings")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View trace of Security Reviewer" }));
    expect(onOpenTrace).toHaveBeenCalledWith("run-a");
  });

  it("AC-21: an unknown cost is a dash, never $0.00", () => {
    renderCard(column({ cost_usd: null, duration_ms: 2000 }));
    expect(screen.getByText("2.0s · —")).toBeInTheDocument();
  });

  it("AC-22: a failed column shows its error in place of findings, with the full text on hover, and still offers View trace", () => {
    const long = "429 Too Many Requests: provider rate limit exceeded for this key, retry after 30 seconds";
    const onOpenTrace = renderCard(
      column({ run_id: "run-f", status: "failed", error: long, score: null, duration_ms: null, cost_usd: null, findings: [finding()] }),
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
    const err = screen.getByText(long);
    expect(err).toHaveAttribute("title", long);
    expect(screen.queryByRole("list", { name: /Findings of/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Score/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/findings?$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View trace/ }));
    expect(onOpenTrace).toHaveBeenCalledWith("run-f");
  });

  it("AC-22: a cancelled column shows its error text too; a running one shows status only", () => {
    renderCard(column({ status: "cancelled", error: "Cancelled by user", score: null }));
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("Cancelled by user")).toBeInTheDocument();
    cleanup();
    renderCard(column({ status: "running", score: null, duration_ms: null, cost_usd: null }));
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.queryByText("No findings.")).not.toBeInTheDocument();
  });

  it("EC-18/EC-19: a deleted agent reads 'Deleted agent'; a long name keeps its full text as the title", () => {
    renderCard(column({ agent_id: null, agent_name: null }));
    expect(screen.getByText("Deleted agent")).toHaveAttribute("title", "Deleted agent");
    expect(screen.getByRole("button", { name: "View trace of Deleted agent" })).toBeInTheDocument();
    cleanup();
    const name = "An extremely long agent name that cannot possibly fit on one single line of a column header";
    renderCard(column({ agent_name: name }));
    expect(screen.getByText(name)).toHaveAttribute("title", name);
  });

  it("a done column with no findings says so", () => {
    renderCard(column({ findings: [] }));
    expect(screen.getByText("No findings.")).toBeInTheDocument();
    expect(screen.getByText("0 findings")).toBeInTheDocument();
  });
});
