/* helpers.test.ts — MetricTrend geometry (EC-36). */
import { describe, it, expect } from "vitest";
import { CHART, MAX_X_LABELS } from "./constants";
import { labelIndexes, seriesGeometry, xFor, xPercent, yFor } from "./helpers";

describe("MetricTrend geometry (SPEC-08)", () => {
  it("EC-36: a null run leaves a gap in the series; it is not plotted at 0", () => {
    const geo = seriesGeometry([0.8, null, 0.6]);
    expect(geo.points).toHaveLength(2);
    expect(geo.path.match(/M/g)).toHaveLength(2);
    expect(geo.path).not.toContain("L");
    // y of a real 0 would be the baseline; nothing was drawn there.
    expect(geo.points.some((p) => p.y === yFor(0))).toBe(false);
  });

  it("x-axis labels never exceed the cap, whatever the number of runs", () => {
    expect(labelIndexes(3)).toEqual([0, 1, 2]);
    expect(labelIndexes(30).length).toBeLessThanOrEqual(MAX_X_LABELS);
    expect(labelIndexes(30)[0]).toBe(0);
  });
});

describe("MetricTrend overlay alignment (SPEC-09 NFR-8)", () => {
  it("xPercent matches xFor on the SVG canvas, so the HTML targets sit over the points", () => {
    expect(xPercent(0, 3)).toBeCloseTo((xFor(0, 3) / CHART.width) * 100);
    expect(xPercent(2, 3)).toBeCloseTo(((CHART.width - CHART.right) / CHART.width) * 100);
    expect(xPercent(0, 1)).toBeGreaterThan(0);
  });
});
