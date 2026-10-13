/* ColumnsView.test.tsx — SPEC-11 Columns mode: one column per agent in the order given, and each
   column's View trace reports its own run id (AC-23, AC-40). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runs from "../../../../../../../../messages/en/runs.json";
import { column } from "../../../../../../../test/multi-agent-fixtures";
import { ColumnsView } from "./ColumnsView";

afterEach(cleanup);

describe("ColumnsView", () => {
  it("AC-23/40: renders every column side by side (done, running, failed, deleted agent) and routes View trace by run id", () => {
    const onOpenTrace = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ runs }}>
        <ColumnsView
          onOpenTrace={onOpenTrace}
          columns={[
            column({ run_id: "r1", agent_name: "Alpha" }),
            column({ run_id: "r2", agent_name: "Beta", status: "running", score: null }),
            column({ run_id: "r3", agent_name: "Gamma", status: "failed", error: "boom", score: null }),
            column({ run_id: "r4", agent_id: null, agent_name: null }),
          ]}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getAllByRole("region").map((r) => r.getAttribute("data-run-id"))).toEqual(["r1", "r2", "r3", "r4"]);
    expect(screen.getByText("Deleted agent")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View trace of Beta" }));
    fireEvent.click(screen.getByRole("button", { name: "View trace of Deleted agent" }));
    expect(onOpenTrace.mock.calls).toEqual([["r2"], ["r4"]]);
  });
});
