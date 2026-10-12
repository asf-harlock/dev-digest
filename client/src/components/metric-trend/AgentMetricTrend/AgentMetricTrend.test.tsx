/* AgentMetricTrend.test.tsx — the agent trend at its full window (SPEC-09 AC-55, AC-57, AC-58,
   EC-27, EC-28): 100 finished runs stay reachable and readable, a missing metric is a gap, a
   missing cost reads "—". The wiring on the tab/page is in their own tests. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalTrendPoint } from "@devdigest/shared";
import evalMessages from "../../../../messages/en/eval.json";
import { AgentMetricTrend } from "./AgentMetricTrend";

afterEach(cleanup);

const NO_RECALL = 41;
const NO_COST = 60;

const trend: EvalTrendPoint[] = Array.from({ length: 100 }, (_, i) => ({
  run_id: `r${i}`,
  ran_at: "2026-09-20T10:00:00",
  agent_version: 1 + Math.floor(i / 10),
  recall: i === NO_RECALL ? null : 0.5,
  precision: 0.6,
  citation_accuracy: 0.7,
  cost_usd: i === NO_COST ? null : 0.12,
}));

describe("AgentMetricTrend", () => {
  it("AC-55/AC-58/EC-27/EC-28: 100 runs give 100 focusable targets and a bounded axis; a null recall leaves a gap and a null cost reads '—', never 0", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <AgentMetricTrend trend={trend} />
      </NextIntlClientProvider>,
    );

    const chart = screen.getByRole("img", { name: "Recall, precision and citation accuracy over the last 100 runs" });
    const targets = screen.getAllByRole("button", { name: /^v\d+ · / });
    expect(targets).toHaveLength(100);
    expect(targets.every((el) => el.tabIndex === 0)).toBe(true);

    // The x-axis never crowds: at most 10 version labels, starting at the oldest run.
    const labels = [...chart.querySelectorAll("text")].filter((n) => /^v\d+$/.test(n.textContent ?? ""));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(10);
    expect(labels[0]!.textContent).toBe("v1");

    // EC-28: recall has 99 dots (one run missing), precision and citation have 100 each.
    expect(chart.querySelectorAll("circle")).toHaveLength(99 + 100 + 100);
    expect(chart.querySelectorAll("path")[0]!.getAttribute("d")?.match(/M/g)).toHaveLength(2);

    // EC-27 / AC-56: a missing metric or cost is "—" in the name and the tooltip.
    expect(targets[NO_RECALL]).toHaveAccessibleName(expect.stringContaining("Recall — · Precision 60%"));
    expect(targets[NO_COST]).toHaveAccessibleName(expect.stringMatching(/Cost —$/));
    expect(targets[0]).toHaveAccessibleName(expect.stringMatching(/Cost \$0\.12$/));
    act(() => targets[NO_COST]!.focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent(/Cost —$/);
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("$0.00");
  });
});
