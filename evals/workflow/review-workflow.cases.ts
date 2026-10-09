import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — the cases that CANNOT be folded into one session with others.
 * Every foldable doc-routing check lives in claude-md.cases.ts.
 *
 * Budget: 3 Claude sessions.
 *   - 1 × activation pair (positive + near-miss negative) = 2 — a positive in the same session
 *     would contaminate the negative, so they never share a session;
 *   - 1 × dispatch                                        = 1 — stops the moment the subagent is
 *     launched; folding it with a knowledge probe would disable that early stop.
 *
 * Prompts describe the TASK; they must never name the skill or agent, or the case degrades from a
 * routing check into an instruction-following check.
 */
export const cases: WorkflowCase[] = [
  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },

  // --- dispatch (1 session): root CLAUDE.md "Writing or revising a feature spec" -----------------
  {
    kind: "dispatch",
    name: "writing a feature spec dispatches the spec-creator subagent",
    prompt:
      "Хочу оформити специфікацію нової фічі: користувач може повторно запустити ревʼю PR з іншою моделлю. " +
      "Підготуй її так, як у цьому репо заведено писати специфікації фіч.",
    expectSubagent: "spec-creator",
    maxTurns: 6,
  },
];
