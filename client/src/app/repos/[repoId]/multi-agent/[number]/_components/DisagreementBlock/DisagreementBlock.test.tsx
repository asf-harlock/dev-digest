/* DisagreementBlock.test.tsx — SPEC-11 "Where agents disagree" (AC-37, AC-38, AC-39, EC-12, EC-17,
   EC-18, EC-24). The conflicts are server-computed; this block lays them out and filters. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runs from "../../../../../../../../messages/en/runs.json";
import { column, conflict, take } from "../../../../../../../test/multi-agent-fixtures";
import { DisagreementBlock } from "./DisagreementBlock";

afterEach(cleanup);

const COLS = [
  column({ run_id: "ra", agent_id: "ag1", agent_name: "Security Reviewer" }),
  column({ run_id: "rb", agent_id: "ag2", agent_name: "Style Reviewer" }),
];

function renderBlock(conflicts: Parameters<typeof DisagreementBlock>[0]["conflicts"], columns = COLS) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <DisagreementBlock conflicts={conflicts} columns={columns} />
    </NextIntlClientProvider>,
  );
}

const contended = conflict({
  file: "src/api/users.ts",
  line: 45,
  title: "Unvalidated input",
  contended: true,
  takes: [
    take({ run_id: "ra", verdict: "CRITICAL", note: "Body is trusted **as is** <b>x</b>" }),
    take({ run_id: "rb", agent_id: "ag2", persona: "Style Reviewer", verdict: "ignored", note: "" }),
  ],
});
const agreed = conflict({
  file: "src/db.ts",
  line: 9,
  title: "Missing index",
  contended: false,
  takes: [
    take({ run_id: "ra", verdict: "WARNING", note: "Add an index." }),
    take({ run_id: "rb", agent_id: "ag2", persona: "Style Reviewer", verdict: "WARNING", note: "Slow query.", dismissed: true }),
  ],
});

describe("DisagreementBlock", () => {
  it("AC-37, EC-24: a row per group with file:line and title, a cell per done agent with severity or 'did not flag', the note as plain text, a dismissed take muted", () => {
    renderBlock([contended, agreed]);

    expect(screen.getByRole("heading", { name: "Where agents disagree" })).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:45")).toBeInTheDocument();
    expect(screen.getByText("Unvalidated input")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    const first = within(rows[0]!);
    expect(first.getByText("Critical")).toBeInTheDocument();
    expect(first.getByText("did not flag")).toBeInTheDocument();
    // markdown and html in a note are shown literally, never rendered
    expect(first.getByText("Body is trusted **as is** <b>x</b>")).toBeInTheDocument();
    expect(rows[0]!.querySelector("b")).toBeNull();

    const second = within(rows[1]!);
    expect(second.getByText("dismissed")).toBeInTheDocument();
    const mutedOpacity = Number(getComputedStyle(second.getByText("Style Reviewer").parentElement as HTMLElement).opacity);
    const liveOpacity = Number(getComputedStyle(second.getByText("Security Reviewer").parentElement as HTMLElement).opacity);
    expect(mutedOpacity).toBeLessThan(liveOpacity);
  });

  it("EC-18: a deleted agent's cell reads 'Deleted agent' (its take is keyed by run id)", () => {
    renderBlock(
      [conflict({ takes: [take({ run_id: "ra" }), take({ run_id: "rb", agent_id: null, persona: null, verdict: "ignored" })] })],
      [COLS[0]!, column({ run_id: "rb", agent_id: null, agent_name: null })],
    );
    expect(screen.getByText("Deleted agent")).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
  });

  it("AC-38: 'Show only conflicts' keeps the contended groups; with none it says the agents agree", () => {
    renderBlock([contended, agreed]);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("src/api/users.ts:45")).toBeInTheDocument();
    expect(screen.queryByText("src/db.ts:9")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    cleanup();

    renderBlock([agreed]);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("No conflicts — the agents agree on every flagged location.")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("EC-12: fewer than 2 done agents replaces the rows with the needs-two note and hides the toggle", () => {
    renderBlock(
      [contended],
      [COLS[0]!, column({ run_id: "rb", status: "failed", error: "boom", score: null })],
    );
    expect(screen.getByText("Comparison needs at least 2 completed agents")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("AC-39: while any column runs the block says 'Comparing N of M agents' (rows still shown with 2+ done; no needs-two note below that)", () => {
    const running = column({ run_id: "rc", agent_name: "Docs Reviewer", status: "running", score: null });
    renderBlock([contended], [...COLS, running]);
    expect(screen.getByText("Comparing 2 of 3 agents")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:45")).toBeInTheDocument();
    cleanup();

    renderBlock([], [COLS[0]!, running]);
    expect(screen.getByText("Comparing 1 of 2 agents")).toBeInTheDocument();
    expect(screen.queryByText("Comparison needs at least 2 completed agents")).not.toBeInTheDocument();
  });
});
