import { describe, it, expect } from "vitest";
import { Onboarding, OnboardingTourGenerateRequest } from "@devdigest/shared";

describe("Onboarding tour contract (client copy)", () => {
  it("parses an old document with no meta", () => {
    const r = Onboarding.parse({ sections: [] });
    expect(r.meta).toBeUndefined();
  });

  it("parses a partial meta and accepts null nullish fields", () => {
    const r = Onboarding.parse({
      sections: [],
      meta: { source: "llm", last_error: null, window_days: null },
    });
    expect(r.meta?.source).toBe("llm");
    expect(r.meta?.last_error).toBeNull();
    expect(r.meta?.dropped_count).toBeUndefined();
  });

  it("round-trips a typed section", () => {
    const doc = {
      sections: [{ kind: "critical_paths", items: [{ path: "a.ts", reason: "hub", hotness: 0.5 }] }],
    };
    expect(Onboarding.parse(doc)).toEqual(doc);
  });

  it.each([6, 731, 7.5])("rejects window_days %s", (w) => {
    expect(
      OnboardingTourGenerateRequest.safeParse({ mode: "activity", window_days: w }).success,
    ).toBe(false);
  });

  it("accepts the 7..730 bounds", () => {
    for (const w of [7, 730]) {
      expect(
        OnboardingTourGenerateRequest.safeParse({ mode: "activity", window_days: w }).success,
      ).toBe(true);
    }
  });
});
