import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@/lib/types";
import { parsePatch } from "./helpers";
import { anchorFindings, hasActiveFindings, highestSeverity } from "./findings";

const PATCH = "@@ -8,3 +8,4 @@\n export const config = {\n   port: 3001,\n+  secret: 'x',\n };";

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "t",
    file: "src/config.ts",
    start_line: 10,
    end_line: 10,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    scope: null,
    review_id: "rev1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

describe("hasActiveFindings", () => {
  it("is false for undefined/empty/all-dismissed lists", () => {
    expect(hasActiveFindings(undefined)).toBe(false);
    expect(hasActiveFindings([])).toBe(false);
    expect(hasActiveFindings([finding({ dismissed_at: "2026-01-01T00:00:00Z" })])).toBe(false);
  });

  it("is true when at least one finding is not dismissed", () => {
    expect(
      hasActiveFindings([finding({ dismissed_at: "2026-01-01T00:00:00Z" }), finding({ id: "f2" })]),
    ).toBe(true);
  });
});

describe("highestSeverity", () => {
  it("returns null for an empty list", () => {
    expect(highestSeverity([])).toBeNull();
  });

  it("picks CRITICAL over WARNING/SUGGESTION regardless of order", () => {
    const findings = [
      finding({ id: "f1", severity: "SUGGESTION" }),
      finding({ id: "f2", severity: "CRITICAL" }),
      finding({ id: "f3", severity: "WARNING" }),
    ];
    expect(highestSeverity(findings)).toBe("CRITICAL");
  });
});

describe("anchorFindings", () => {
  const lines = parsePatch(PATCH);

  it("anchors a finding whose start_line matches a rendered RIGHT (new) line number", () => {
    // The added line `secret: 'x'` is new-file line 10 (newStart=8, ctx x2, add).
    const f = finding({ start_line: 10 });
    const { matched, unanchored } = anchorFindings(lines, [f]);
    expect(unanchored).toEqual([]);
    expect(matched.get("RIGHT:10")).toEqual([f]);
  });

  it("a shifted hunk does not misanchor a new-side line to an unrelated deleted (old-side) row", () => {
    // `@@ -8,4 +8,2 @@`: old side has 4 lines (8..11: ctx, del, del, ctx),
    // new side has 2 (8, 9). Old line 10 ("removed: true,") is deleted, so
    // `LEFT:10` is a rendered key here — but a finding whose (new-file)
    // start/end_line is 10 refers to a line OUTSIDE this hunk entirely; there
    // is no `RIGHT:10` anywhere. Dropping the LEFT fallback means it must NOT
    // be misanchored to the deleted "removed: true," row.
    const shiftedPatch =
      "@@ -8,4 +8,2 @@\n export const config = {\n-  port: 3001,\n-  removed: true,\n };";
    const shiftedLines = parsePatch(shiftedPatch);
    const f = finding({ start_line: 10, end_line: 10 });
    const { matched, unanchored } = anchorFindings(shiftedLines, [f]);
    expect(matched.get("LEFT:10")).toBeUndefined();
    expect(unanchored).toEqual([f]);
  });

  it("a range whose start_line is before the hunk and end_line is inside it anchors at the first rendered line in range", () => {
    // Rendered RIGHT keys in `lines` are 8 (ctx), 9 (ctx), 10 (add). A finding
    // ranging [5, 9] has no rendered line at 5, 6 or 7, but line 8 IS
    // rendered and is the first hit scanning start_line..end_line ascending.
    const f = finding({ start_line: 5, end_line: 9 });
    const { matched, unanchored } = anchorFindings(lines, [f]);
    expect(unanchored).toEqual([]);
    expect(matched.get("RIGHT:8")).toEqual([f]);
  });

  it("puts a finding whose line is not in any rendered hunk into `unanchored`", () => {
    const f = finding({ start_line: 999 });
    const { matched, unanchored } = anchorFindings(lines, [f]);
    expect(matched.size).toBe(0);
    expect(unanchored).toEqual([f]);
  });

  it("does not filter dismissed findings out — they still anchor/render", () => {
    const f = finding({ start_line: 10, dismissed_at: "2026-01-01T00:00:00Z" });
    const { matched } = anchorFindings(lines, [f]);
    expect(matched.get("RIGHT:10")).toEqual([f]);
  });

  it("groups multiple findings anchored to the same line", () => {
    const f1 = finding({ id: "f1", start_line: 10 });
    const f2 = finding({ id: "f2", start_line: 10, severity: "WARNING" });
    const { matched } = anchorFindings(lines, [f1, f2]);
    expect(matched.get("RIGHT:10")).toEqual([f1, f2]);
  });
});
