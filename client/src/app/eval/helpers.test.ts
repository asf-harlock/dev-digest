/* helpers.test.ts — SPEC-08 Eval Dashboard pure helpers (EC-19, EC-27, EC-34). */
import { describe, it, expect } from "vitest";
import { metrics, runRecord } from "../../test/eval-fixtures";
import { agentHref, formatRanAt, isComparableStatus, metricValue, passParts } from "./helpers";

describe("eval dashboard helpers (SPEC-08)", () => {
  it("EC-27/EC-34: only completed and partial runs are comparable", () => {
    expect(isComparableStatus("completed")).toBe(true);
    expect(isComparableStatus("partial")).toBe(true);
    expect(isComparableStatus("running")).toBe(false);
    expect(isComparableStatus("errored")).toBe(false);
  });

  it("EC-19: a missing run, a missing metrics block or a null ratio is null, never 0", () => {
    expect(metricValue(null, "recall")).toBeNull();
    expect(metricValue(runRecord({ metrics: null }), "precision")).toBeNull();
    expect(
      metricValue(runRecord({ metrics: metrics({ recall: { value: null, num: 0, den: 0 } }) }), "recall"),
    ).toBeNull();
    expect(metricValue(runRecord(), "citation_accuracy")).toBe(0.9);
  });

  it("passParts shows the traces ratio parts, or em dashes without metrics", () => {
    expect(passParts(runRecord())).toEqual({ passed: "3", total: "4" });
    expect(passParts(runRecord({ metrics: null }))).toEqual({ passed: "—", total: "—" });
    expect(passParts(null)).toEqual({ passed: "—", total: "—" });
  });

  it("formats the run time in local time and passes an unparseable value through", () => {
    expect(formatRanAt("2026-05-29T09:14:00")).toBe("2026-05-29 09:14");
    expect(formatRanAt("not a date")).toBe("not a date");
  });

  it("builds the agent detail href with an encoded id", () => {
    expect(agentHref("ag1")).toBe("/eval/agents/ag1");
    expect(agentHref("a/b")).toBe("/eval/agents/a%2Fb");
  });
});
