import { describe, expect, it } from "vitest";
import { planEvals, type EvalInventory } from "./eval-plan.js";

const inv: EvalInventory = {
  skillEvals: ["dependency-checker", "onion-architecture"],
  agentEvals: [
    { dir: "architecture-reviewer", imports: [] },
    { dir: "architecture-reviewer-lite", imports: ["architecture-reviewer"] },
  ],
  workflowCasesSource: `
    { skill: "engineering-insights", shouldActivate: true },
    { expectSubagent: "spec-creator" },
    { expectFilesRead: ["server/docs/db-schema.md"] },
  `,
};

describe("planEvals", () => {
  it("runs only the changed skill's eval", () => {
    const plan = planEvals([".claude/skills/dependency-checker/SKILL.md"], inv);
    expect(plan).toMatchObject({ skills: ["dependency-checker"], agents: [], workflow: false });
  });

  it("skips a changed skill with no eval file and says so", () => {
    const plan = planEvals([".claude/skills/zod/SKILL.md"], inv);
    expect(plan.skills).toEqual([]);
    expect(plan.log).toContain("skip skill zod: no evals/skills/zod/zod.eval.ts");
  });

  it("runs a skill eval when only its cases change", () => {
    expect(planEvals(["evals/skills/onion-architecture/fixtures/a.diff"], inv).skills).toEqual(["onion-architecture"]);
  });

  it("runs the changed agent's eval, not its lite variant", () => {
    const plan = planEvals([".claude/agents/architecture-reviewer.md"], inv);
    expect(plan.agents).toEqual(["architecture-reviewer"]);
  });

  it("reruns an eval that imports the changed cases", () => {
    const plan = planEvals(["evals/agents/architecture-reviewer/architecture-reviewer.cases.ts"], inv);
    expect(plan.agents).toEqual(["architecture-reviewer", "architecture-reviewer-lite"]);
  });

  it("triggers workflow evals on any CLAUDE.md", () => {
    expect(planEvals(["CLAUDE.md"], inv).workflow).toBe(true);
    expect(planEvals(["server/CLAUDE.md"], inv).workflow).toBe(true);
  });

  it("triggers workflow evals on a skill, agent or doc a workflow case names", () => {
    expect(planEvals([".claude/skills/engineering-insights/SKILL.md"], inv).workflow).toBe(true);
    expect(planEvals([".claude/agents/spec-creator.md"], inv).workflow).toBe(true);
    expect(planEvals(["server/docs/db-schema.md"], inv).workflow).toBe(true);
  });

  it("does not trigger workflow evals on an unrelated doc or skill", () => {
    expect(planEvals(["server/docs/repo-intel-notes.md", ".claude/skills/zod/SKILL.md"], inv).workflow).toBe(false);
  });

  it("runs no model evals for an engine-only change", () => {
    const plan = planEvals(["evals/src/config.ts", "evals/package.json"], inv);
    expect(plan).toMatchObject({ skills: [], agents: [], workflow: false });
  });

  it("scope=all runs everything", () => {
    expect(planEvals([], inv, "all")).toMatchObject({
      skills: ["dependency-checker", "onion-architecture"],
      agents: ["architecture-reviewer", "architecture-reviewer-lite"],
      workflow: true,
    });
  });
});
