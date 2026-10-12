/* AgentRunsTable.test.tsx — SPEC-08 Recent runs table (AC-43, AC-44, EC-27). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import evalMessages from "../../../../../../../messages/en/eval.json";
import { runRecord } from "../../../../../../test/eval-fixtures";
import { AgentRunsTable } from "./AgentRunsTable";
import { toggleSelection } from "./helpers";

afterEach(cleanup);

const RUNS = [
  runRecord({ id: "r3", agent_version: 3, status: "running", metrics: null, cost_usd: null }),
  runRecord({ id: "r2", agent_version: 2, status: "completed" }),
  runRecord({ id: "r1", agent_version: 1, status: "partial" }),
  runRecord({ id: "r0", agent_version: 0, status: "completed", cost_usd: null }),
];

function renderTable(onOpenRun = vi.fn(), onCompare = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <AgentRunsTable runs={RUNS} onOpenRun={onOpenRun} onCompare={onCompare} />
    </NextIntlClientProvider>,
  );
  return { onOpenRun, onCompare };
}

describe("toggleSelection (SPEC-08)", () => {
  it("toggles a run and keeps only the two most recent picks", () => {
    expect(toggleSelection([], "a")).toEqual(["a"]);
    expect(toggleSelection(["a"], "a")).toEqual([]);
    expect(toggleSelection(["a", "b"], "c")).toEqual(["b", "c"]);
  });
});

describe("AgentRunsTable (SPEC-08)", () => {
  it("EC-27: an unfinished run's checkbox is disabled", () => {
    renderTable();
    const unfinished = screen.getByRole("checkbox", { name: "Select run v3 for comparison" });
    expect(unfinished).toBeDisabled();
    expect(unfinished.closest("label")).toHaveAttribute("title", "Only finished runs can be compared");
    expect(screen.getByRole("checkbox", { name: "Select run v2 for comparison" })).toBeEnabled();
    // a partial run is finished (AC-38)
    expect(screen.getByRole("checkbox", { name: "Select run v1 for comparison" })).toBeEnabled();
  });

  it("AC-44: Compare is enabled only with exactly two runs selected and then hands both ids over", () => {
    const { onCompare } = renderTable();
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select run v2 for comparison" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(compare).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select run v1 for comparison" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(compare).toBeEnabled();
    fireEvent.click(compare);
    expect(onCompare).toHaveBeenCalledWith("r2", "r1");

    // a third pick replaces the oldest one; still exactly two
    fireEvent.click(screen.getByRole("checkbox", { name: "Select run v0 for comparison" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select run v2 for comparison" })).not.toBeChecked();

    // unchecking leaves one → disabled again
    fireEvent.click(screen.getByRole("checkbox", { name: "Select run v1 for comparison" }));
    expect(screen.getByRole("button", { name: "Compare" })).toBeDisabled();
  });

  it("AC-43/EC-19/EC-21: shows metric percents, pass ratio and cost, with em dashes for missing values", () => {
    renderTable();
    const running = screen.getByRole("button", { name: "Open results of run v3" }).closest("tr")!;
    expect(running).toHaveTextContent("—"); // no metrics, null cost
    expect(running).not.toHaveTextContent("0%");
    expect(running).not.toHaveTextContent("$0.00");
    const done = screen.getByRole("button", { name: "Open results of run v2" }).closest("tr")!;
    expect(done).toHaveTextContent("75%");
    expect(done).toHaveTextContent("3/4");
    expect(done).toHaveTextContent("$0.12");
  });

  it("opening a run (row or version button) reports its id; ticking a box does not open it", () => {
    const { onOpenRun } = renderTable();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select run v2 for comparison" }));
    expect(onOpenRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open results of run v2" }));
    expect(onOpenRun).toHaveBeenCalledWith("r2");
  });

  it("NFR-7: the select checkbox hit area and the version button are at least 24x24", () => {
    renderTable();
    const hit = screen.getByRole("checkbox", { name: "Select run v2 for comparison" }).closest("label")!;
    expect(parseFloat(hit.style.width)).toBeGreaterThanOrEqual(24);
    expect(parseFloat(hit.style.height)).toBeGreaterThanOrEqual(24);
    const version = screen.getByRole("button", { name: "Open results of run v2" });
    expect(parseFloat(version.style.minWidth)).toBeGreaterThanOrEqual(24);
    expect(parseFloat(version.style.minHeight)).toBeGreaterThanOrEqual(24);
  });
});
