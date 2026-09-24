import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { groupFindingsByPath, latestFindingsPerAgent } from "./helpers";

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "t",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
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

function review(over: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr1",
    agent_id: "agent-a",
    run_id: null,
    agent_name: "Agent A",
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
    ...over,
  };
}

describe("latestFindingsPerAgent", () => {
  it("keeps only the newest kind==='review' row per agent_id and unions their findings", () => {
    // Newest-first, as the server hands them back.
    const reviews: ReviewRecord[] = [
      review({ id: "r3", agent_id: "agent-a", created_at: "2026-01-03", findings: [finding({ id: "newer-a" })] }),
      review({ id: "r2", agent_id: "agent-b", created_at: "2026-01-02", findings: [finding({ id: "newer-b" })] }),
      review({ id: "r1", agent_id: "agent-a", created_at: "2026-01-01", findings: [finding({ id: "older-a" })] }),
    ];
    const findings = latestFindingsPerAgent(reviews);
    expect(findings.map((f) => f.id).sort()).toEqual(["newer-a", "newer-b"]);
  });

  it("ignores kind==='summary' rows and treats a null agent_id as one shared bucket", () => {
    const reviews: ReviewRecord[] = [
      review({ id: "s1", kind: "summary", agent_id: null, findings: [finding({ id: "summary-finding" })] }),
      review({ id: "r2", agent_id: null, created_at: "2026-01-02", findings: [finding({ id: "newer-null" })] }),
      review({ id: "r1", agent_id: null, created_at: "2026-01-01", findings: [finding({ id: "older-null" })] }),
    ];
    const findings = latestFindingsPerAgent(reviews);
    expect(findings.map((f) => f.id)).toEqual(["newer-null"]);
  });
});

describe("groupFindingsByPath", () => {
  it("groups findings by their file path, preserving list order within a path", () => {
    const findings = [
      finding({ id: "a", file: "src/config.ts" }),
      finding({ id: "b", file: "src/api/users.ts" }),
      finding({ id: "c", file: "src/config.ts" }),
    ];
    const byPath = groupFindingsByPath(findings);
    expect(byPath.get("src/config.ts")?.map((f) => f.id)).toEqual(["a", "c"]);
    expect(byPath.get("src/api/users.ts")?.map((f) => f.id)).toEqual(["b"]);
    expect(byPath.has("does-not-exist.ts")).toBe(false);
  });
});
