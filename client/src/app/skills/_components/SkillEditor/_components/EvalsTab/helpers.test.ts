import { describe, it, expect } from "vitest";
import type { EvalMetrics, EvalSkillRunRecord } from "@devdigest/shared";
import { liftParts, passingCounts } from "./helpers";

/** Only the ratios and trace counts these helpers read. */
const metrics = (recall: number | null, precision: number | null, citation: number | null, passed = 1, total = 2): EvalMetrics =>
  ({
    recall: { value: recall, num: 0, den: 0 },
    precision: { value: precision, num: 0, den: 0 },
    citation_accuracy: { value: citation, num: 0, den: 0 },
    traces_passed: passed,
    traces_total: total,
  }) as EvalMetrics;

const run = (w: EvalMetrics | null, wo: EvalMetrics | null) => ({ with: w, without: wo }) as EvalSkillRunRecord;

describe("liftParts (AC-35, NFR-9, EC-26)", () => {
  it("NFR-9: signed integer points, round(with·100) − round(without·100), with direction arrows", () => {
    expect(liftParts(run(metrics(0.8, 0.5, 0.9), metrics(0.76, 0.52, 0.9)))).toEqual({
      recall: "▲ 4 pt",
      precision: "▼ 2 pt",
      citation: "0 pt",
    });
  });

  it("NFR-9: the points come from the rounded arms, not from rounding the raw difference", () => {
    // 0.504 → 50, 0.496 → 50: the raw difference 0.008 would round to 1 pt, the rounded arms give 0
    expect(liftParts(run(metrics(0.504, 0.5, 0.5), metrics(0.496, 0.5, 0.5))).recall).toBe("0 pt");
  });

  it("EC-26: a null on either side is an em dash for that metric only, never 0", () => {
    expect(liftParts(run(metrics(null, 0.5, 0.5), metrics(0.4, 0.5, null)))).toEqual({
      recall: "—",
      precision: "0 pt",
      citation: "—",
    });
  });

  it("EC-30/EC-17: no run, or an errored run without arms, is dashes", () => {
    const dashes = { recall: "—", precision: "—", citation: "—" };
    expect(liftParts(null)).toEqual(dashes);
    expect(liftParts(undefined)).toEqual(dashes);
    expect(liftParts(run(null, null))).toEqual(dashes);
  });
});

describe("passingCounts (AC-2)", () => {
  it("AC-2: the with-skill arm's passed traces over the cases scored in both arms", () => {
    expect(passingCounts(run(metrics(1, 1, 1, 3, 5), metrics(0, 0, 0, 1, 5)))).toEqual({ passed: 3, scored: 5 });
  });

  it("EC-30/EC-17: nothing to count without a finished run", () => {
    expect(passingCounts(null)).toBeNull();
    expect(passingCounts(run(null, null))).toBeNull();
  });
});
