/* eval-format.test.ts — SPEC-08 display formatters (NFR-8, EC-19..EC-21). */
import { describe, it, expect } from "vitest";
import {
  deltaDirection,
  deltaPoints,
  evalCaseState,
  formatCostDeltaUsd,
  formatCostUsd,
  formatDeltaPoints,
  formatDuration,
  formatLiftPoints,
  formatLineRange,
  formatPassRatio,
  formatPercent,
  formatRanAt,
} from "./eval-format";

describe("eval-format (SPEC-08)", () => {
  it("EC-19: ratios are integer percentages and a null metric is an em dash, never 0%", () => {
    expect(formatPercent(0.756)).toBe("76%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
  });

  it("NFR-8: a delta is round(new·100) − round(old·100), not round of the raw difference", () => {
    // 0.754 → 75, 0.746 → 75: raw diff 0.8 pt would round to 1, the rule gives 0.
    expect(deltaPoints(0.754, 0.746)).toBe(0);
    expect(deltaPoints(0.8, 0.76)).toBe(4);
    expect(deltaPoints(0.5, 0.52)).toBe(-2);
    expect(formatDeltaPoints(0.8, 0.76)).toBe("▲ 4 pt");
    expect(formatDeltaPoints(0.5, 0.52)).toBe("▼ 2 pt");
    expect(formatDeltaPoints(0.5, 0.5)).toBe("0 pt");
    expect(formatDeltaPoints(0.8, 0.76, "pts")).toBe("▲ 4 pts");
  });

  it("EC-20: a delta with a missing side is null / an em dash", () => {
    expect(deltaPoints(null, 0.5)).toBeNull();
    expect(deltaPoints(0.5, null)).toBeNull();
    expect(deltaPoints(undefined, undefined)).toBeNull();
    expect(formatDeltaPoints(null, 0.5)).toBe("—");
    expect(formatDeltaPoints(0.5, null)).toBe("—");
    expect(deltaDirection(null)).toBe("none");
    expect(deltaDirection(3)).toBe("up");
    expect(deltaDirection(-1)).toBe("down");
    expect(deltaDirection(0)).toBe("flat");
  });

  it("EC-21: cost has two decimals, a null cost is an em dash never $0.00, and its delta compares cents", () => {
    expect(formatCostUsd(0.1234)).toBe("$0.12");
    expect(formatCostUsd(0)).toBe("$0.00");
    expect(formatCostUsd(null)).toBe("—");
    expect(formatCostDeltaUsd(0.5, 0.38)).toBe("▲ $0.12");
    expect(formatCostDeltaUsd(0.1, 0.13)).toBe("▼ $0.03");
    expect(formatCostDeltaUsd(0.101, 0.099)).toBe("$0.00");
    expect(formatCostDeltaUsd(null, 0.1)).toBe("—");
    expect(formatCostDeltaUsd(0.1, null)).toBe("—");
  });

  it("formats durations, pass ratios, line ranges and case states", () => {
    expect(formatDuration(420)).toBe("420ms");
    expect(formatDuration(1800)).toBe("1.8s");
    expect(formatDuration(125_000)).toBe("2m 5s");
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
    expect(formatPassRatio(3, 5)).toBe("3/5");
    expect(formatPassRatio(null, 5)).toBe("—");
    expect(formatLineRange("src/a.ts", 4, 9)).toBe("src/a.ts:4-9");
    expect(evalCaseState(null)).toBe("never_run");
    expect(evalCaseState({ state: "failed" })).toBe("failed");
  });
});

describe("eval-format (SPEC-09 trend tooltip)", () => {
  it("NFR-9: a lift is round(with·100) − round(without·100), rebuilt from the raw lift", () => {
    // with 0.54, without 0.50 (raw lift 0.04) → 54 − 50 = 4.
    expect(formatLiftPoints(0.54, 0.04)).toBe("▲ 4 pt");
    // raw difference 0.8 pt would round to 1; the rule gives 75 − 75 = 0.
    expect(formatLiftPoints(0.754, 0.754 - 0.746)).toBe("0 pt");
    expect(formatLiftPoints(0.5, -0.02)).toBe("▼ 2 pt");
    // a without value of exactly .125 rounds half up (13) despite float noise.
    expect(formatLiftPoints(0.5, 0.5 - 0.125)).toBe("▲ 37 pt");
  });

  it("EC-26: a lift with a missing side is an em dash", () => {
    expect(formatLiftPoints(null, 0.1)).toBe("—");
    expect(formatLiftPoints(0.5, null)).toBe("—");
  });

  it("formatRanAt: local 'YYYY-MM-DD HH:mm', the raw string when not a date", () => {
    expect(formatRanAt("2026-05-29T09:14:00")).toBe("2026-05-29 09:14");
    expect(formatRanAt("not a date")).toBe("not a date");
  });
});
