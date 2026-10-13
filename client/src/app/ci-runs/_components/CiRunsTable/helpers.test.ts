import { describe, it, expect } from "vitest";
import { formatDuration, prUrl, severityTotals } from "./helpers";

describe("CiRunsTable helpers", () => {
  it("EC-29: formats a missing duration as a dash, never 0 s", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(65_000)).toBe("1m 5s");
  });

  it("UI-12: builds the PR link from repo and an integer only", () => {
    expect(prUrl({ repo: "acme/payments-api", pr_number: 7 })).toBe("https://github.com/acme/payments-api/pull/7");
    expect(prUrl({ repo: "acme/payments-api", pr_number: null })).toBeNull();
    expect(prUrl({ repo: "acme/payments-api", pr_number: 1.5 })).toBeNull();
    expect(prUrl({ repo: "javascript:alert(1)//x", pr_number: 7 })).toBeNull();
  });

  it("counts a null severity as 0", () => {
    expect(severityTotals({ critical: null, warning: 2, suggestion: null })).toEqual({ critical: 0, warning: 2, suggestion: 0 });
  });
});
