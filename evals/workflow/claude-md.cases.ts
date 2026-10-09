import type { WorkflowCase } from "../src/index.js";

/**
 * CLAUDE.md routing — every live "Read when" row of the root and module CLAUDE.md files, folded
 * into as few sessions as the routing allows.
 *
 * Budget: 7 Claude sessions — 6 routing traces (2 leaf docs each, 12 in total) + 1 INSIGHTS trace.
 *
 * Folding rule: one session = one coherent task whose parts each route to a DIFFERENT doc. A
 * prompt that reads like a checklist of unrelated jobs turns the case into instruction-following,
 * so every prompt below is phrased as a single piece of work.
 *
 * Folding limit: TWO anchors per session. Per-anchor read rates multiply, so a 4-anchor fold
 * failed 3 runs out of 3 — each time on a DIFFERENT doc, i.e. the fold itself was the failure,
 * not any one route. When one anchor starts flaking, split it back out into its own trace.
 *
 * Routing is TWO-HOP: the root CLAUDE.md says "working inside a module → read that module's
 * CLAUDE.md first", and the module CLAUDE.md's "Read when" rows point at the doc. The traces
 * therefore assert the LEAF doc, never the module CLAUDE.md itself: Claude Code auto-loads a nested
 * CLAUDE.md when a file under that directory is touched, which is not a `Read` call and so would
 * not appear in `filesRead` — asserting it would be a false negative.
 *
 * `expectText` is the knowledge probe: a fact the question never mentions. Setting it disables
 * early stop, so those sessions run to the end — size maxTurns accordingly. A probe must NOT be
 * answerable from a file one hop short of the anchor: when the closing question's answer sat in
 * the module CLAUDE.md (`invalidateSecretCaches`, `degraded`, mcp's `stderr`), the model answered
 * from it and stopped without opening the leaf doc. Many leaf docs are still 10-line stubs
 * (architecture, db-schema, di-container, repo-intel, data-fetching, grounding) — a read can be
 * anchored there, a doc-only fact cannot.
 *
 * Not foldable, kept in review-workflow.cases.ts on purpose:
 *   - near-miss negatives (activation shouldActivate:false) — a positive in the same session would
 *     contaminate the negative;
 *   - contrast cases — the control run IS the second session;
 *   - dispatch of a subagent — `expectText` disables early stop, so a fold would pay for the
 *     nested subagent's full run.
 *
 * Dead links, not anchored: `specs/lessons/` and `<module>/specs/` are empty on this branch.
 *
 * Prompts never name the doc, or the case degrades from a routing check into an
 * instruction-following check. Earlier phrasings that asked for an overview ("розберись, як усе
 * влаштовано") sent the model straight into source files and it never opened the routed doc —
 * keep every prompt on "consult the guidance first".
 */
export const cases: WorkflowCase[] = [
  // --- root CLAUDE.md "Read when": pipeline end to end + writing tests --------------------------
  {
    kind: "trace",
    name: "root: tracing the pipeline and testing it routes to architecture.md + TESTING.md",
    prompt:
      "Хочу зрозуміти, як ревʼю проходить увесь шлях від diff до findings, а потім покрити цей шлях тестами. " +
      "Перш ніж торкатися коду — звірся з настановами цього репо щодо архітектури та тестів і прочитай відповідну документацію.",
    expectFilesRead: ["docs/architecture.md", "TESTING.md"],
    maxTurns: 10,
  },

  // --- server: DB column + repo-intel ----------------------------------------------------------
  {
    kind: "trace",
    name: "server: column + indexer route to db-schema.md + repo-intel.md",
    prompt:
      "Планую фічу на сервері: нова колонка в існуючій таблиці (з урахуванням workspace-скоупінгу), яку " +
      "заповнює індексер repo map під час ранжування файлів. Перш ніж торкатися коду — звірся з настановами " +
      "цього репо для сервера щодо схеми БД та індексера і прочитай відповідну документацію.",
    expectFilesRead: ["server/docs/db-schema.md", "server/docs/repo-intel.md"],
    maxTurns: 10,
  },

  // --- server → reviewer-core: adapter feeding a new prompt slot --------------------------------
  // Cross-module: di-container.md is reachable only via server/CLAUDE.md, prompt-assembly.md only
  // via reviewer-core/CLAUDE.md. Probe: `ReviewInput` (the ZERO-I/O invariant) — never named.
  {
    kind: "trace",
    name: "server+reviewer-core: adapter + prompt slot route to di-container.md + prompt-assembly.md",
    prompt:
      "Планую фічу: на сервері новий адаптер, який тягне з GitHub опис PR, і цей опис має потрапити окремим " +
      "блоком у промпт ревʼю в reviewer-core. Перш ніж торкатися коду — звірся з настановами цього репо для " +
      "обох частин і прочитай відповідну документацію. Наприкінці коротко скажи, як опис має потрапити в " +
      "reviewer-core і чи можна прочитати його там напряму.",
    expectFilesRead: ["server/docs/di-container.md", "reviewer-core/docs/prompt-assembly.md"],
    expectText: ["ReviewInput"],
    maxTurns: 14,
  },

  // --- server → reviewer-core: endpoint exposing citation-gate results --------------------------
  // Cross-module: server/README.md ("adding an API route") + reviewer-core/docs/grounding.md.
  {
    kind: "trace",
    name: "server+reviewer-core: endpoint + citation gate route to server/README.md + grounding.md",
    prompt:
      "Планую фічу: новий ендпоінт на сервері, який повертає, скільки findings відсіяв citation gate у " +
      "reviewer-core і чому. Перш ніж торкатися коду — звірся з настановами цього репо для обох частин і " +
      "прочитай відповідну документацію.",
    expectFilesRead: ["server/README.md", "reviewer-core/docs/grounding.md"],
    maxTurns: 10,
  },

  // --- client: component that calls the API ----------------------------------------------------
  // No knowledge probe: the former `ApiError` probe is answered by client/CLAUDE.md itself, so the
  // model answered from it and skipped both leaf docs (0/2) — the one-hop-short trap above.
  {
    kind: "trace",
    name: "client: component calling the API routes to component-conventions.md + data-fetching.md",
    prompt:
      "Планую новий React-компонент у клієнті, який викликає API і по-різному показує помилку 404 та 500. " +
      "Перш ніж торкатися коду — звірся з настановами цього репо щодо структури компонентів і роботи з API " +
      "і прочитай відповідну документацію.",
    expectFilesRead: ["client/docs/component-conventions.md", "client/docs/data-fetching.md"],
    maxTurns: 12,
  },

  // --- e2e + mcp: browser flow + MCP tool -------------------------------------------------------
  {
    kind: "trace",
    name: "e2e+mcp: browser flow + MCP tool route to e2e/README.md + mcp/README.md",
    prompt:
      "Планую фічу: browser flow в e2e, який перевіряє список агентів, і MCP-інструмент, що віддає ті самі " +
      "дані. Перш ніж торкатися коду — звірся з настановами цього репо для обох частин і прочитай відповідну " +
      "документацію.",
    expectFilesRead: ["e2e/README.md", "mcp/README.md"],
    maxTurns: 10,
  },

  // --- root "Session Context": module INSIGHTS.md before working in the module -------------------
  // Kept OUT of the routing traces: folded in, it was the most frequently missed anchor (the model
  // often reads only the root INSIGHTS.md, or none), so it masked routing results. A failure here is
  // a signal about the root CLAUDE.md "Insights loop" rule, not about doc routing.
  {
    kind: "trace",
    name: "session context: server+client task reads both module INSIGHTS.md",
    prompt:
      "Починаю задачу: новий ендпоінт на сервері і екран у клієнті, який його показує. Перш ніж торкатися " +
      "коду — підготуйся так, як цього вимагають настанови репо для роботи в цих модулях.",
    expectFilesRead: ["server/INSIGHTS.md", "client/INSIGHTS.md"],
    maxTurns: 10,
  },
];
