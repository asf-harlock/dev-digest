import { describe, it, expect } from "vitest";
import type { ConventionCandidate } from "@devdigest/shared";
import { acceptedIds, allEligibleAccepted, countAccepted, pendingIds } from "./helpers";

function candidate(id: string, status: ConventionCandidate["status"]): ConventionCandidate {
  return {
    id,
    scan_id: "scan1",
    category: "style",
    rule: `rule-${id}`,
    evidence: { path: "a.ts", start_line: 1, end_line: 1, snippet: "x" },
    confidence: 0.9,
    status,
    created_at: "2026-09-19T10:00:00.000Z",
  };
}

describe("countAccepted / pendingIds / acceptedIds", () => {
  const list = [candidate("a", "accepted"), candidate("b", "pending"), candidate("c", "rejected")];

  it("counts only accepted candidates", () => {
    expect(countAccepted(list)).toBe(1);
  });

  it("pendingIds returns only pending candidate ids", () => {
    expect(pendingIds(list)).toEqual(["b"]);
  });

  it("acceptedIds returns only accepted candidate ids", () => {
    expect(acceptedIds(list)).toEqual(["a"]);
  });
});

describe("allEligibleAccepted", () => {
  it("is false when nothing is accepted", () => {
    expect(allEligibleAccepted([candidate("a", "pending")])).toBe(false);
  });

  it("is true once every non-rejected candidate is accepted", () => {
    expect(allEligibleAccepted([candidate("a", "accepted"), candidate("b", "rejected")])).toBe(true);
  });

  it("is false when a candidate list is made up entirely of rejections", () => {
    expect(allEligibleAccepted([candidate("a", "rejected")])).toBe(false);
  });

  it("is false on an empty list", () => {
    expect(allEligibleAccepted([])).toBe(false);
  });
});
