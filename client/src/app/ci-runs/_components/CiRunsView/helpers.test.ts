import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { activeKeyFor } from "@/components/app-shell/helpers";
import { hasActiveFilter, refreshFailureKey, toRunsQuery } from "./helpers";

describe("CiRunsView helpers", () => {
  it("AC-50: sends only the filters that are set", () => {
    expect(toRunsQuery({ repo: "", agentId: "", status: "" })).toEqual({ limit: 200 });
    expect(toRunsQuery({ repo: "a/b", agentId: "ag1", status: "failed" })).toEqual({
      limit: 200,
      repo: "a/b",
      agent_id: "ag1",
      status: "failed",
    });
    expect(hasActiveFilter({ repo: "", agentId: "", status: "running" })).toBe(true);
  });

  it("EC-31: explains a failed refresh: request error first, then the first failed installation", () => {
    expect(refreshFailureKey(null, undefined)).toBeNull();
    expect(refreshFailureKey(new ApiError("x", 0, "network_error", { name: "TimeoutError" }), undefined)).toBe("timeout");
    expect(refreshFailureKey(new ApiError("x", 409, "github_token_missing"), undefined)).toBe("githubTokenMissing");
    const failed = { installation_id: "i1", status: "failed" as const, added: 0, updated: 0, skipped: 0, failure: { code: "rate_limited" } };
    expect(refreshFailureKey(null, [failed])).toBe("rateLimited");
    expect(refreshFailureKey(null, [{ ...failed, status: "refreshed", failure: null }])).toBeNull();
  });

  it("AC-45: GLOBAL sidebar section holds only CI Runs and /ci-runs activates it", () => {
    const group = NAV.find((g) => g.section === "GLOBAL");
    expect(group?.items).toEqual([expect.objectContaining({ key: "ci-runs", label: "CI Runs", href: "/ci-runs" })]);
    expect(activeKeyFor("/ci-runs")).toBe("ci-runs");
  });
});
