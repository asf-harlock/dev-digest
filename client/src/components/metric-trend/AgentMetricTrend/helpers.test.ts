/* helpers.test.ts — the agent trend tooltip values (SPEC-09 AC-56, EC-27). */
import { describe, it, expect } from "vitest";
import type { EvalTrendPoint } from "@devdigest/shared";
import { agentTooltipValues } from "./helpers";

const POINT: EvalTrendPoint = {
  run_id: "r1",
  ran_at: "2026-09-20T10:00:00",
  agent_version: 4,
  recall: 0.756,
  precision: null,
  citation_accuracy: 0.9,
  cost_usd: 0.1234,
};

describe("agentTooltipValues", () => {
  it("AC-56: version, run date, integer percentages and the run's cost", () => {
    expect(agentTooltipValues(POINT)).toEqual({
      version: "v4",
      date: "2026-09-20 10:00",
      recall: "76%",
      precision: "—",
      citation: "90%",
      cost: "$0.12",
    });
  });

  it("EC-27: a null cost is an em dash, never $0.00", () => {
    expect(agentTooltipValues({ ...POINT, cost_usd: null }).cost).toBe("—");
  });
});
