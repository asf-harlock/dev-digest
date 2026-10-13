/* helpers.test.ts — SPEC-11 estimate formatting (AC-6, EC-6) and the selection aggregate (AC-7, EC-7). */
import { describe, it, expect } from "vitest";
import { estimate } from "../../test/multi-agent-fixtures";
import {
  aggregateEstimates,
  formatAgentEstimate,
  formatEstimateDuration,
  indexEstimates,
} from "./helpers";

describe("agent estimate formatting", () => {
  it("AC-6: seconds with one decimal and the run-cost formatter", () => {
    expect(formatEstimateDuration(8200)).toBe("8.2s");
    expect(formatEstimateDuration(950)).toBe("0.9s");
    expect(formatAgentEstimate(estimate({ duration_ms: 8200, cost_usd: 0.06 }))).toBe("8.2s · $0.06");
  });

  it("EC-6: no completed run shows an em dash — never 0.0s or $0.00", () => {
    expect(formatEstimateDuration(null)).toBe("—");
    expect(formatAgentEstimate(undefined)).toBe("—");
    expect(formatAgentEstimate(estimate({ duration_ms: null, cost_usd: null, runs_used: 0 }))).toBe("—");
    // a known duration with an unknown cost keeps the dash only for the cost
    expect(formatAgentEstimate(estimate({ duration_ms: 3000, cost_usd: null }))).toBe("3.0s · —");
  });
});

describe("aggregateEstimates", () => {
  const by = indexEstimates([
    estimate({ agent_id: "a", duration_ms: 8000, cost_usd: 0.1 }),
    estimate({ agent_id: "b", duration_ms: 12000, cost_usd: 0.25 }),
    estimate({ agent_id: "c", duration_ms: null, cost_usd: null, runs_used: 0 }),
  ]);

  it("AC-7: the longest duration (parallel) and the sum of the costs", () => {
    const agg = aggregateEstimates(["a", "b"], by);
    expect(agg.durationMs).toBe(12000);
    expect(agg.costUsd).toBeCloseTo(0.35);
    expect(agg.partial).toBe(false);
  });

  it("EC-7: a checked agent with an unknown cost is partial; the total covers the known ones", () => {
    const agg = aggregateEstimates(["a", "c"], by);
    expect(agg).toMatchObject({ durationMs: 8000, costUsd: 0.1, partial: true });
  });

  it("no known estimate at all gives null duration and null cost", () => {
    expect(aggregateEstimates(["c"], by)).toMatchObject({ durationMs: null, costUsd: null, partial: true });
  });
});
