/* helpers.test.ts — the skill trend tooltip values (SPEC-09 AC-37, NFR-9, EC-26, EC-27). */
import { describe, it, expect } from "vitest";
import type { EvalSkillTrendPoint } from "@devdigest/shared";
import { skillTooltipValues } from "./helpers";

const POINT: EvalSkillTrendPoint = {
  run_id: "r1",
  ran_at: "2026-10-01T10:05:00",
  skill_version: 2,
  carrier_agent_id: "a2",
  carrier_name: "Beta",
  carrier_version: 3,
  model: "gpt-4.1",
  recall: 0.54,
  precision: 0.5,
  citation_accuracy: null,
  lift: { recall: 0.04, precision: -0.02, citation_accuracy: null },
  cost_usd: 0.2,
};

describe("skillTooltipValues", () => {
  it("AC-37: date, skill and carrier versions, model, with-skill percentages, signed lifts and total cost", () => {
    expect(skillTooltipValues(POINT)).toEqual({
      version: "v2",
      date: "2026-10-01 10:05",
      carrier: "Beta",
      carrierVersion: "v3",
      model: "gpt-4.1",
      recall: "54%",
      precision: "50%",
      citation: "—",
      liftRecall: "▲ 4 pt",
      liftPrecision: "▼ 2 pt",
      liftCitation: "—",
      cost: "$0.20",
    });
  });

  it("EC-27: a null total cost is an em dash, never $0.00", () => {
    expect(skillTooltipValues({ ...POINT, cost_usd: null }).cost).toBe("—");
  });
});
