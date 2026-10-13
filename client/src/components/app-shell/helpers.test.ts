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

describe("Eval Dashboard nav (SPEC-08)", () => {
  it("AC-51: the item sits in Skills Lab after Conventions and is active on /eval and agent detail pages", () => {
    const group = NAV.find((g) => g.items.some((i) => i.key === "eval"));
    const keys = group?.items.map((i) => i.key) ?? [];
    expect(keys.indexOf("eval")).toBeGreaterThan(keys.indexOf("conventions"));
    expect(group?.items.find((i) => i.key === "eval")).toMatchObject({ label: "Eval Dashboard", href: "/eval" });
    expect(activeKeyFor("/eval")).toBe("eval");
    expect(activeKeyFor("/eval/agents/ag1")).toBe("eval");
  });
});

describe("Multi-Agent Review nav (SPEC-11)", () => {
  it("AC-8: the item is in the GLOBAL group, after Skills Lab, and is active on every /multi-agent path", () => {
    const sections = NAV.map((g) => g.section);
    expect(sections.indexOf("GLOBAL")).toBe(sections.indexOf("SKILLS LAB") + 1);
    const global = NAV.find((g) => g.section === "GLOBAL");
    expect(NAV.find((g) => g.section === "WORKSPACE")?.items.some((i) => i.key === "multi-agent")).toBe(false);
    expect(global?.items.find((i) => i.key === "multi-agent")).toMatchObject({
      label: "Multi-Agent Review",
      href: "/repos/:repoId/multi-agent",
    });
    expect(activeKeyFor("/repos/r1/multi-agent")).toBe("multi-agent");
    expect(activeKeyFor("/repos/r1/multi-agent/12")).toBe("multi-agent");
    expect(activeKeyFor("/repos/r1/pulls/12")).toBe("pulls");
  });
});
