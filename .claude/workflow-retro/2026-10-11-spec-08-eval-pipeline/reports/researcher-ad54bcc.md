## Hand-back 1

## Repository Research: previous product eval pipeline in git history

### Conclusion
Yes. Two earlier implementations exist, both only on `upstream/*` remote refs and not on any local branch or `main`. The first is a simple per-case design from the original import (`2ba3303`, `71176cf`). The second is the SPEC-12 / SPEC-15 suite-run design with `must_find`/`must_not_flag`, built in `af1cef4` (server), `8d55603` (client) and `b782c2d` (skill-owned two-arm eval). In the SPEC-12 design, precision is `1 - FP/total`. Only findings on `must_not_flag` cases that overlap the forbidden range count as false positives, and unmatched findings do not.

### Where it lives
- Local branches and `origin/*`: no eval module. `git ls-tree -r --name-only HEAD` and `main` show only `evals/` (the Claude Code harness evals), `.claude/**/evals`, `client/messages/en/eval.json` and a placeholder skills `EvalsTab.tsx`.
- `git branch -a --contains 8d55603` (Phase B client, SPEC-12): `remotes/upstream/full-functionality` and `remotes/upstream/fix/numbered-diff-line-citations`.
- `git branch -a --contains b782c2d` (skill-owned two-arm eval): the same two branches.
- Original implementation: `2ba3303` ("initial commit", 2026-06-03, burnjohn) is contained in `upstream/demo/security-review-fixture`, `upstream/fix/review-inline-line-422` and `upstream/reference/full-build`, and possibly more because I cut the list at 5. `71176cf` is only in `upstream/reference/full-build`. `587c46a` ("squashed snapshot") has no eval module.
- The SPEC-12 / SPEC-15 history ends in `c6af1e4` / `3f716c2` "revert: restore main to the starter state, homework belongs in forks". `main` was deliberately trimmed.
- The newest branch tip I checked, `upstream/full-functionality` at `3ac8179` (2026-09-10), still contains the whole eval stack.

### Findings

**Search-term hits**
- `eval-runs` appears only as a React Query key in `client/src/lib/hooks/eval.ts` (`runs: (ownerId) => ["eval-runs", ownerId]`, first added in `8d55603`). It was never an HTTP route.
- `must_find`/`must_not_flag` first appear in `ab47b7e` (spec), then `af1cef4` (server). `EvalsTab` and `EvalDashboardView` first appear in `8d55603`.
- `citation_accuracy` has been in the code since `2ba3303`.

**Design 1 (original, `71176cf`; also `2ba3303`)**
- Data model:
  - A run is one case execution. `eval_runs` has `case_id NOT NULL`, with `pass`, `recall`, `precision`, `citation_accuracy`, `duration_ms`, `cost_usd` and `actual_output`.
  - There is no grouping identity and no version column. This is the same schema as current `server/src/db/schema/eval.ts`.
  - `runAllForAgent` runs `Promise.all` over the agent's cases and merges them with `aggregate()`. The merged `EvalRun` is not persisted as a group.
- Expectations: `expected_output` is an array of partial findings (or `{findings: []}`). There is no `must_find`/`must_not_flag`.
- Metrics (`server/src/modules/eval/scoring.ts` at `71176cf`):
  - An expected finding is matched when the file is the same and the lines overlap, or the title is a case-insensitive substring match, or severity/category agree when no line or title is given. Each actual finding can be used once.
  - `recall = matched / expected.length`.
  - `precision = matched / actual.length`. This is textbook TP/(TP+FP), so every unmatched finding is a false positive.
  - `citation = actual.length / rawCount`, where `actual` is the grounded findings and `rawCount` is the findings before grounding.
  - If both lists are empty, the result is 1/1/1.
  - A case passes when `recall === 1 && precision === 1` (`service.ts`).
  - Per-case run-all results are aggregated by taking the mean of each metric, which is mean-of-means.
- Dashboard (`dashboard.ts`):
  - `current` is the mean of the latest run per case.
  - `trend` has one point per run.
  - `delta` is the last trend point minus the previous one.
  - `alert` is a hard-coded English string, set when `delta.precision` or `delta.recall` is below `REGRESSION_THRESHOLD = -0.01`. The wording is "Precision dropped Npts on the latest run — review for new false positives." or the recall equivalent.
  - `RECENT_RUNS_LIMIT = 10`.
- Routes (`routes.ts` at `71176cf`):
  - `GET/POST /eval-cases`
  - `GET/PUT/DELETE /eval-cases/:id`
  - `POST /eval-cases/:id/run`
  - `POST /agents/:id/eval/run-all`
  - `GET /eval/dashboard?owner_kind&owner_id`
- Contracts: `EvalCaseInput` (`owner_kind`, `owner_id`, `name`, `input_diff`, `expected_output`, and so on), `EvalRunRecord` (per case), `EvalRunResult {run_id, case_id, result: EvalRun}`, and `EvalDashboard {owner_kind, owner_id, cases_total, current, delta, trend, recent_runs, alert}`. These match the current `eval-ci.ts`.
- Client: `AgentEvalsTab`, `EvalCaseEditor`, `EvalDashboard`, `MiniBar` and `hooks/eval.ts`, using the `/eval-cases` URLs.
- Skill-owned cases: they resolve a runnable agent that links the skill, or else any enabled agent (`resolveAgent` in `service.ts`).

**Design 2 (SPEC-12 and SPEC-15; `upstream/full-functionality`)**
- Specs and plans: `specs/12-eval-pipeline.md`, `specs/15-skill-eval-cases.md`, `plans/12-eval-pipeline.md`.
- Data model (`server/src/db/schema/eval.ts` on that branch):
  - A run is a suite run (spec D2): one agent against its whole case set. Grouping is a widened `eval_runs` row, not a separate group table.
  - `eval_runs` columns: `ownerKind`, `ownerId`, `status` (`running|completed|errored`), `agentVersion`, `caseIds` (jsonb), `perCase` (jsonb `EvalCaseOutcome[]`), `casesErrored`, `tracesPassed`, `tracesTotal`, `finishedAt`, `errorReason`, plus the metric columns.
  - Skill runs add `skillVersion`, `carrierAgentId`, `gatesBypassed` and `armWithout` (the full without-arm `EvalRun`).
  - Versioning: `agentVersion` is `agent.version` at run start (`service.ts:723`), and the carrier's version for skill runs (`:1016`). `caseIds` records the covered case set so comparison is apples-to-apples (spec D4, D5).
  - Compare restricts both runs to the common case ids and lists `only_in_old` and `only_in_new` (`service.ts:1299-1307`). It also builds a line-based `prompt_diff` from the two `agent_versions` snapshots (`service.ts:1315-1318`).
  - `eval_cases` gains `sourceFindingId` (unique with owner, for idempotent creation from a finding), `createdAt`, `updatedAt`. The case stores a frozen `inputDiff`, `inputFiles`, `inputMeta` and `expectedOutput`, where `expectedOutput` is a single `EvalExpectation {type: must_find|must_not_flag, file, start_line, end_line, severity?, category?, title?}`.
  - There is no run-group id even for run-all. `runAll` loops over agents calling `startRun` and returns per-agent `started[]` with `run_id` or `refused_reason`.
- Metrics (`server/src/modules/eval/scoring.ts`, `scoreRun`):
  - A finding matches when the file is equal and the line ranges intersect. Only grounded (kept) findings are scored.
  - `must_find` passes with at least one match. `must_not_flag` passes with zero matches.
  - `recall = (must_find cases that passed) / (must_find cases)`, or `null` if there are none.
  - **`precision = 1 - FP/total`**, where `FP` is the sum of `findings_matched` over `must_not_flag` cases and `total` is all kept findings across scored cases. It is `null` if `total` is 0.
    - Unmatched findings on `must_find` cases are not false positives.
    - Findings outside every expectation are not false positives.
    - The spec says this is deliberate: AC-19, clarification 8 ("kept exactly as AC-19 states it ... not textbook TP/(TP+FP)"), and the edge case "findings only outside every expectation ... precision stays 1.0 while recall falls".
    - Worked example in AC-19: four findings on one `must_not_flag` case, one overlapping, gives 0.75.
  - `citation_accuracy = sum(grounding_kept) / sum(grounding_total)`. It reuses `groundFindings` and `groundingSummary` from `reviewer-core` and is `null` if the denominator is 0 (AC-21).
  - Errored cases are excluded from every numerator and denominator, with `pass: null`. All ratios are `null` rather than 0 or 1 when their denominator is 0 (AC-20).
  - Scoring makes zero LLM calls (AC-16).
  - SPEC-15 adds `pairArms`, `computeLift` (with-arm minus without-arm, `null` if either side is `null`) and `classifyEffects` (`helped|hurt|no_effect_pass|no_effect_fail`).
- Routes (`server/src/modules/eval/routes.ts` on that branch). `startRun` and `runAll` are rate-limited to 5 per minute (`RUN_RATE_LIMIT`).
  - Cases:
    - `POST /findings/:id/eval-case` (201, or 200 if it already exists)
    - `GET/POST /agents/:id/eval/cases`
    - `GET/PATCH/DELETE /eval/cases/:id`
  - Agent runs:
    - `GET /agents/:id/eval/estimate`
    - `POST /agents/:id/eval/runs` (202)
    - `GET /agents/:id/eval/runs`
    - `GET /eval/runs/:id` (client polls, no SSE)
    - `POST /eval/runs/all` (body `{confirm: true}`)
  - Comparison and dashboards:
    - `GET /eval/compare?a=&b=`
    - `GET /eval/dashboard`
    - `GET /eval/agents/:id`
  - Skills:
    - `GET /findings/:id/eval-skills`
    - `POST /findings/:id/skill-eval-case`
    - `GET/POST /skills/:id/eval/cases`
    - `GET /skills/:id/eval/carriers`
    - `GET /skills/:id/eval/estimate`
    - `POST/GET /skills/:id/eval/runs`
    - `POST /eval/skills/runs/all`
    - `GET /eval/skills/compare`
- Contracts (`server/src/vendor/shared/contracts/eval-ci.ts` and `knowledge.ts` on that branch). Note that `EvalDashboard` changed shape, and the single `alert` string became a structured `EvalCallout`.
  - `EvalRunRecord`: `id, owner_kind, owner_id, agent_name, status, started_at, finished_at, agent_version, case_ids, metrics: EvalRun|null, duration_ms, cost_usd, error_reason`.
  - `EvalRun`: now nullable ratios, `traces_passed`, `traces_total`, `cases_errored`, and `per_case: EvalCaseOutcome[]`. `EvalPerTrace` was renamed to `EvalCaseOutcome`, which carries `case_id, name, expectation_type, status, pass, findings_total, findings_matched, grounding_kept, grounding_total, actual[]`.
  - `EvalDashboard = {agents: EvalAgentSummary[], recent_runs, skills: EvalSkillSummary[]}`.
  - `EvalAgentDetail` has `delta` and `callout`, both `null` when there are fewer than two completed runs.
  - `EvalCallout = {metric, direction, magnitude, agent_version, case_transitions[]}` is rendered from `eval.json`, so it is not model-authored.
  - Also `EvalRunResult`, `EvalRunAllResult`, `EvalTrendPoint` (adds `run_id` and `agent_version`), `EvalCompare` and `EvalSkillRunRecord`, which extends `EvalRunRecord` with lift, effects and `arm_without`.
- Client on that branch:
  - Agent tab: `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/{EvalsTab,MetricTiles,RunHistory,NewAgentCaseModal}.tsx`.
  - Skill tab: `client/src/app/skills/.../SkillEditor/_components/EvalsTab/*`.
  - Dashboard: `client/src/app/eval/_components/EvalDashboardView/*` and `client/src/app/eval/agents/[agentId]/_components/EvalAgentDetailView/*`.
  - Other: `components/eval-case-editor/*`, `lib/hooks/eval.ts`, and `FindingCard/SkillEvalMenu.tsx`.

### What the current files imply (L06 starter, `HEAD`)
These files are the reserved shapes from Design 1. They point at that design's per-case behaviour, not at the later suite model. `spec 12` D2 says exactly this: the reserved `eval_runs` is "per case execution", and the reserved `EvalRun` already carried the set-level shape.
- `server/src/vendor/shared/contracts/knowledge.ts:168-186`:
  - `EvalPerTrace {name, pass, expected, actual}` is the per-case result.
  - `EvalRun` has `recall/precision/citation_accuracy` (0..1, not nullable), `traces_passed/traces_total` (a pass count over cases), `duration_ms`, `cost_usd` and `per_trace[]`. So an `EvalRun` is a set-level aggregate with one entry per case.
- `knowledge.ts:188-202`: `EvalOwnerKind = skill|agent`, and `EvalCase.expected_output` is `z.unknown()` with no expectation type.
- `server/src/vendor/shared/contracts/eval-ci.ts:33-46`: `EvalRunRecord` is one persisted run row for one case (`case_id`, `pass`, metrics, `actual_output`). There is no version, status or grouping field.
- `eval-ci.ts:56-89`:
  - `EvalTrendPoint` has `pass_rate`, so the trend is per run in chronological order.
  - `EvalDashboard` has `current` (including `traces_passed/total`), `delta` (current minus previous), `trend`, `recent_runs` and `alert: string|null`. `alert` is a regression banner; in Design 1 it is a precomputed string.
- `server/src/db/schema/eval.ts:22-35`: `eval_runs` has `case_id` as a cascade FK, `pass`, metrics and `actual_output`. There is no `owner`, `version` or `status`, so run grouping and versioning are absent from the starter schema.
- `client/messages/en/eval.json`:
  - Dashboard keys: `recall`, `precision`, `citationAccuracy`, a legend, `table.pass/cost`, `pass`/`fail`, and `runEval` ("Run eval ({count})").
  - Case editor keys: `resultSummary` ("recall % · precision % · citation % · s") and `lastRunPassed/Failed`.
  - `evalsTab` keys: `neverRun`, `passed`, `failed`, `recallSuffix`, "Run".
  - This is the per-case UI of Design 1. It has no callout, compare or version strings, and no skill/lift strings. The `page` crumbs mention "Skills Lab" and "Eval Dashboard".

### Could not determine
- Whether `2ba3303` itself, as opposed to `71176cf`, scores identically. I read `71176cf`'s `scoring.ts`, `service.ts` and `dashboard.ts`, but not `2ba3303`'s own copy of those files.
- The full list of branches containing `2ba3303`. I cut the list at 5.
- Whether the dashboard page at `upstream/full-functionality` still uses `EvalDashboardView` as its only entry. I did not read the page component bodies beyond the file list.
- The remaining `plans/12-eval-pipeline.md` content. I read only the spec, where `sed` with certain forms was blocked, so I read the spec via `sed -n 'N,Mp'` ranges around ACs 16-23 and clarification 8.
- `upstream/l06-evals` and `upstream/evals-example` are the harness-evals package. I did not inspect them for product eval code.

To read any of this, check out the file with `git show upstream/full-functionality:<path>`, for example `server/src/modules/eval/scoring.ts`, `server/src/modules/eval/service.ts`, `specs/12-eval-pipeline.md` and `specs/15-skill-eval-cases.md`.