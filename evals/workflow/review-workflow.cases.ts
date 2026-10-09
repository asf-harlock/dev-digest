import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — the cases that CANNOT be folded into one session with others.
 * Every foldable doc-routing check lives in claude-md.cases.ts.
 *
 * Budget: 6 Claude sessions.
 *   - 1 × activation pair (positive + near-miss negative) = 2 — a positive in the same session
 *     would contaminate the negative, so they never share a session;
 *   - 2 × dispatch                                        = 2 — stops the moment the subagent is
 *     launched; folding it with a knowledge probe would disable that early stop;
 *   - 1 × contrast (treatment + control)                  = 2 — the control run IS the second
 *     session, so it cannot share one.
 *
 * Evidence is the trace, never the answer text: dispatch is read from the Agent/Task tool_use's
 * `subagent_type`, reads from Read calls. "I asked the reviewer" in the text proves nothing.
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

  // --- dispatch (1 session): an architecture-review task launches architecture-reviewer -----------
  // Read-only tools (no Bash) mean the session cannot run `pnpm arch` itself — the review has to be
  // delegated. `architecture-reviewer-lite` does not count: the assert is an exact name match.
  {
    kind: "dispatch",
    name: "an architecture review of the server dispatches the architecture-reviewer subagent",
    prompt:
      "Перевір поточні зміни в server/ на порушення архітектурних меж: чи не тягне сервіс щось з " +
      "інфраструктури напряму і чи не імпортують модулі конкретні адаптери. Зроби це так, як у цьому репо " +
      "заведено робити архітектурне рев'ю.",
    expectSubagent: "architecture-reviewer",
    maxTurns: 6,
  },

  // --- contrast (2 sessions): root CLAUDE.md "Adding or changing an API route" ----------------------
  // Treatment runs on the real repo with CLAUDE.md loaded and must read server/README.md (route
  // contracts live there — this repo has no api-contracts.md). Control runs the same prompt in an
  // empty tmpdir with no project context and must NOT read it — that isolates CLAUDE.md's
  // contribution. The prompt never names the doc.
  {
    kind: "contrast",
    name: "CLAUDE.md routes an API-route task to server/README.md (treatment vs control)",
    prompt:
      "Я збираюся додати новий API-роут на сервері: POST /reviews/:id/rerun. Перш ніж торкатися коду — " +
      "звірся з настановами цього репо щодо контрактів роутів і прочитай відповідну документацію.",
    expectFileRead: "server/README.md",
    maxTurns: 8,
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
