## Hand-back 1

## W2 backend (steps 5-13): done, inner loop only

### Files
All paths are under `/Users/harlock/Downloads/Sites/devdigest/server/`.

**Created:**
- `src/modules/_shared/skill-render.ts` — `renderSkillBlock({name, body})` returns `### {name}\n{body}`. Also exports `RenderableSkill`.
- `src/modules/eval/constants.ts`, `types.ts`, `helpers.ts`, `scoring.ts`, `frozen-input.ts`, `prompt-diff.ts`, `skills-diff.ts`, `repository.ts`, `executor.ts`, `service.ts`, `routes.ts`

**Changed:**
- `src/modules/reviews/run-executor.ts` — now uses `renderSkillBlock` (behaviour unchanged).
- `src/modules/agents/repository.ts` — `deleteById(ws, id, beforeDelete?: (tx: DbTx) => Promise<void>)` runs in `db.transaction`, with `beforeDelete` first. Exports a `DbTx` type.
- `src/modules/agents/service.ts` — `delete` passes `tx => container.evalRepo.deleteByAgent(ws, id, tx)`.
- `src/platform/container.ts` — new `evalRepo` getter.
- `src/modules/index.ts` — registers `eval: evalModule`.
- `src/app.ts` — awaited `EvalService(container).reapStaleRuns()` after the review reap, with the same non-fatal try/catch.
- `package.json` — only the scripts line (`verify:l06`, exactly as in the plan). No lockfile touched.

### Routes as registered
- `POST /findings/:id/eval-case` → 201 `EvalCase`
- `GET /pulls/:id/eval-case-links` → `EvalCaseLinks`
- `GET /agents/:id/eval-cases` → `EvalCaseListItem[]`
- `GET /eval-cases/:id` → `EvalCaseDetail`
- `PATCH /eval-cases/:id` (body `EvalCaseRename`) → `EvalCase`
- `DELETE /eval-cases/:id` → 204
- `POST /agents/:id/eval-runs` → 202 `EvalRunStart`
- `GET /agents/:id/eval-overview` → `EvalOverview`
- `GET /eval-runs/compare?a&b` → `EvalCompare` (registered before `/eval-runs/:id`)
- `GET /eval-runs/:id` → `EvalRunDetail`
- `GET /eval-dashboard` → `EvalDashboard`

Every handler starts with `getContext`. Ids are validated with `IdParams` (422), and every route has a response schema.

### Gates
- `./scripts/check.sh server typecheck` — PASS
- `./scripts/check.sh server lint` — PASS
- `./scripts/check.sh server arch` — PASS
- `./scripts/check.sh server test` — PASS, 608 passed. This includes the existing `run-executor-*` and agents tests.
- I did not run `*.it.test.ts`, and I did not run `db:migrate` or `verify:l06`.
- Manual check that adapters do not import `modules/`:
  - There are two existing imports, and I did not add either: `src/adapters/astgrep/index.ts` → `modules/repo-intel/constants.js`, and `src/adapters/git/simple-git.test.ts` → `modules/_shared/context-paths.js`.
  - `modules/eval` has no `process.env` and no imports from `reviews/*` or `agents/*`.
- I also ran a throwaway smoke script outside the repo. `freezeFileDiff`, `scoreCase`/`scoreRun` (including zero denominators), `diffLines`, `diffSkills` and `slugify` behave as intended.

### Deviations from plan
- Per-case results are persisted by rewriting the whole `case_results` array after each case, through `saveProgress`. It returns false when the run row is gone or no longer `running`, and the executor then stops quietly. This covers the agent deleted mid-run case (EC-33, NQ-4).
- `GET /agents/:id/eval-cases` and `GET /eval-cases/:id` read one `case_results` jsonb: the agent's latest finished run. Overview and dashboard read scalar columns only. `cases_total` and `cases_done` are computed with `jsonb_array_length` in SQL.
- The dashboard runs one query per agent, in `Promise.all`, for the last 10 finished runs. I avoided a window-function subquery because I could not exercise it without Docker. The cost is bounded by the number of agents.
- `modules/eval/types.ts` is an extra kebab-case file holding the `EvalRunSummary`, `FindingCaseContext` and `FrozenCase` types. It lets `helpers.ts` and `repository.ts` share them without a cycle.
- There is no rate limit on `POST /agents/:id/eval-runs`; single-flight covers it. `DELETE /eval-cases/:id` returns 204 with an empty body, whereas the other deletes return `{ok:true}`.
- `compare` check order is 404 (either run missing in the workspace), then 422 `runs_not_comparable`, then 422 `run_not_finished` (details `{run_id}`). Comparing a run with itself is allowed.
- `skills_diff.changed` means the body differs, or the position among the skills common to both lists differs. A single reorder can flag several skills.
- Unverified without Docker: the unique-violation → 409 translation (checks `err.code` and `err.cause.code`), the partial unique index race, the `jsonb_array_length` selects, the transaction in `deleteById`, and the `rawDiffFromPrFiles` fallback against a real DB.

### For W5 (test-writer)
- **`scoring.ts`:**
  - Exports `matches(finding, expectation)`, `labelFinding`, `scoreCase(ScoreCaseInput)`, `errorCaseOutcome(caseId, name, type, reason, durationMs)`, `ratio(num, den)`, `scoreRun(outcomes)`, `scoreCommon(oldOutcomes, newOutcomes, commonIdSet)` and `runCost(outcomes)`.
  - `scoreRun(outcomes)` takes only the outcomes (no `durationMs` argument) and returns `EvalMetrics`. `precision` is {num: kept−fp, den: kept}.
  - `runCost` returns null if any scored case has a null cost, and null when nothing was scored.
- **`frozen-input.ts`:**
  - Exports `rawDiffFromPrFiles(files)`, `extractFileDiff(rawDiff, path)` and `freezeFileDiff(rawDiff, {file, start_line, end_line, kind?})`.
  - `freezeFileDiff` returns `{ok:true, diff}` or `{ok:false, reason:'no_patch'|'range_outside_diff'}`.
  - The splitter matches on exact path, and a section with no `@@` gives `no_patch`. The returned diff has no trailing newline.
- **`executor.ts`:**
  - `reviewFrozenCase(snapshot: EvalRunSnapshot, {inputDiff, inputMeta:{title, body}}, llm)` returns `{findings, groundingKept, groundingTotal, costUsd, durationMs, assembly}`.
  - A diff that parses to zero files throws `Error('frozen diff has no files')`.
- **`prompt-diff.ts`:** `diffLines(old, new)` returns `{kind, text}[]`; identical input gives all `context`.
- **`skills-diff.ts`:** `diffSkills(old, new)`.
- **`helpers.ts`:**
  - Exports `slugify`, `uniqueCaseName`, `expectationTypeFor`, `evalTaskLine`, `isUniqueViolation`, `toErrorReason`, `evalError`, the `to*` mappers, `finalStatus`, `firstErrorReason` and `buildCaseMeta`.
  - `slugify('!!!')` returns `eval-case`; the slug is cut to 60 characters, and the suffix is added after the cut.
- **`constants.ts`:**
  - Error codes live in `EVAL_ERROR`: `finding_undecided`, `agent_missing`, `eval_case_exists`, `no_patch`, `range_outside_diff`, `no_eval_cases`, `eval_run_in_progress`, `runs_not_comparable`, `run_not_finished`.
  - Also exports `INTERRUPTED_REASON='interrupted'`, `EVAL_TASK_LINE`, the limits `CASE_SLUG_MAX=60`, `TREND_LIMIT=30`, `RUNS_LIMIT=50`, `DASHBOARD_RECENT_RUNS_LIMIT=20`, `SPARKLINE_LIMIT=10`, and `CASE_ERROR_FROZEN_DIFF_EMPTY`.
- **Error details:** 409 `eval_case_exists` has `error.details = {case_id}`, and 409 `eval_run_in_progress` has `{run_id}` (this was the orchestrator's note). 422 `run_not_finished` has `{run_id}`. Other 4xx codes carry no details.
- **Service and repository:**
  - `EvalService(container)` has `createFromFinding`, `listCases`, `getCase`, `renameCase`, `deleteCase`, `caseLinks`, `startRun(ws, agentId, logger?)`, `getRun`, `overview`, `dashboard`, `compare` and `reapStaleRuns`.
  - `container.evalRepo` (`EvalRepository`) has `deleteByAgent(ws, agentId, tx?)` and `reapRunning()`.
  - `startRun` runs the cases in a detached promise, so an it-test must poll `GET /eval-runs/:id`.
- **Prompt-identity test:** use `reviewFrozenCase` with a mock `LLMProvider` and compare `assembly`, or inspect the messages the mock received. The task line is `Review pull request "<title>". <EVAL_TASK_LINE>`.
- **Existing agents tests:** none mock `deleteById`; `agents-*.it.test.ts` exercise the new transaction and need Docker.
- **`verify:l06` file names:** `src/modules/eval/{scoring,frozen-input,executor}.test.ts`, `test/eval-contract-parity.test.ts`, `test/contracts.test.ts`, `test/eval.it.test.ts`.

### Handoff for architecture and security review
- `agents/repository.ts` still has the known `agents/helpers.ts` cycle; I did not touch it.
- `deleteByAgent` is workspace-scoped, but `eval_runs.agent_id` has no FK, so deleting an agent outside `AgentsService.delete` orphans runs and cases (as the plan already notes).
- `toErrorReason` stores provider error text (single line, capped at 300 chars) in `case_results.error_reason`. Security review should confirm that is acceptable, given that structured-output failures could echo model output.
- The detached run promise has no process-level cancel and no per-instance scoping; the boot reap is single-instance only, like the review reaper.