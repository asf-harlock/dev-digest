import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

describe("Project Context nav", () => {
  it("AC-10: 'Project Context' is in the WORKSPACE group and is active on /repos/:id/context", () => {
    const workspace = NAV.find((g) => g.section === "WORKSPACE");
    const item = workspace?.items.find((i) => i.label === "Project Context");
    expect(item).toMatchObject({ key: "context", href: "/repos/:repoId/context" });
    expect(activeKeyFor("/repos/r1/context")).toBe(item?.key);
    expect(activeKeyFor("/repos/r1/pulls")).toBe("pulls");
  });
});

describe("Onboarding Tour nav (SPEC-05)", () => {
  it("AC-1: sits in WORKSPACE between Pull Requests and Project Context", () => {
    const keys = NAV.find((g) => g.section === "WORKSPACE")?.items.map((i) => i.key);
    expect(keys).toEqual(["pulls", "onboarding-tour", "context"]);
    const item = NAV.flatMap((g) => g.items).find((i) => i.key === "onboarding-tour");
    expect(item?.href).toBe("/repos/:repoId/onboarding-tour");
  });

  it("AC-2: active on the tour route, including a hash-free subpath", () => {
    expect(activeKeyFor("/repos/r1/onboarding-tour")).toBe("onboarding-tour");
    expect(activeKeyFor("/repos/r1/onboarding-tour/")).toBe("onboarding-tour");
  });

  it("AC-2: not active on /onboarding (Add repository)", () => {
    expect(activeKeyFor("/onboarding")).toBe("");
  });
});
