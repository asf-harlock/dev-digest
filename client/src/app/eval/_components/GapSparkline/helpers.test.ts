/* helpers.test.ts — GapSparkline geometry (EC-36): a null leaves a gap, not a 0. */
import { describe, it, expect } from "vitest";
import { hasGap, sparkGeometry } from "./helpers";

describe("sparkGeometry / hasGap (SPEC-08)", () => {
  it("EC-36: a null value breaks the line into separate runs instead of drawing 0", () => {
    const data = [0.5, null, 0.7, 0.9];
    expect(hasGap(data)).toBe(true);
    const geo = sparkGeometry(data, 100, 20);
    // Two `M` moves: [0.5] on its own, then [0.7 → 0.9] connected.
    expect(geo.path.match(/M/g)).toHaveLength(2);
    expect(geo.path.match(/L/g)).toHaveLength(1);
    expect(geo.points).toHaveLength(3);
    // The lone first point needs its own dot; the null contributed none.
    expect(geo.points.map((p) => p.isolated)).toEqual([true, false, false]);
    // Scaled over the values that exist: the lowest present value (0.5) sits at the bottom, not at 0.
    expect(Math.max(...geo.points.map((p) => p.y))).toBeCloseTo(geo.points[0]!.y);
  });

  it("a series without gaps is one continuous path and an all-null series draws nothing", () => {
    expect(hasGap([0.1, 0.2])).toBe(false);
    expect(sparkGeometry([0.1, 0.2, 0.3], 60, 20).path.match(/M/g)).toHaveLength(1);
    expect(sparkGeometry([null, null], 60, 20)).toEqual({ path: "", points: [], last: null });
    expect(sparkGeometry([], 60, 20).points).toEqual([]);
  });
});
