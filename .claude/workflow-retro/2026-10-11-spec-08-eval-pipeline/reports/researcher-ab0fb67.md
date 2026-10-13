## Hand-back 1

## Repository Research: what is `pnpm verify:l06`?

### Conclusion
`verify:l06` is NOT defined in this branch (L06-homework), in your `origin` fork, or in `upstream/main` / `upstream/l06-evals`. It exists only on the course-org remote branch `upstream/full-functionality` (author: viktormashyka), as a plain `vitest run` over six test files in `server/package.json`. It is not a course-wide checker. It was defined by that author's own SPEC-12 (D21 / AC-57), and the checks are whatever those six test files assert. It does not require a path like `specs/eval-pipeline.md`. It does check the schema, but only indirectly, through DB-backed tests.

### Where it is defined
- `upstream/full-functionality:server/package.json:14`:
  `"verify:l06": "vitest run src/modules/eval/scoring.test.ts src/modules/eval/frozen-input.test.ts src/modules/eval/executor.test.ts test/eval-contract-parity.test.ts test/contracts.test.ts test/eval.it.test.ts"`
- It sits beside `verify:l03` (`:13`) and `verify:l07` (`:15`). Run it as `cd server && pnpm verify:l06`. There is no root package.json.
- First added in `af1cef4` "feat(eval-pipeline): implement Phase A server per plans/12-eval-pipeline.md" (viktormashyka, 2026-08-19). The `executor.test.ts` file was added to the script later. The spec and plan came first: `ab47b7e` "spec(eval-pipeline): add SPEC-12" and `cbe425c` "plan(eval-pipeline)".
- The ref is `upstream/full-functionality`, tip `3ac8179` (2026-09-10). Commits `b782c2d`, `5acec55` and `dad3033` also carry the string, and `upstream/fix/numbered-diff-line-citations` contains them too.
- Searched with no hits for `verify:l0*` in `server/package.json` or `package.json`: `upstream/main`, `origin/main`, `upstream/l06-evals`, `upstream/reference/full-build`, `upstream/integration/all-features`, `upstream/evals-example`, `upstream/Lesson-06-lab-finish`, `upstream/lesson-5-lab/sdd-finish`. A `git grep` of the whole tree on `upstream/main`, `upstream/l06-evals`, `upstream/lesson-5-lab/sdd-finish`, `origin/main`, `L06-lab` and `L06-homework` also found nothing.
- Local `specs/lessons/` is empty. `specs/` holds only `01-run-cost` through `07-pr-context`.
- I did not run `git fetch` and made no web lookup. The remotes were already present locally, and the SSH URLs are not web-readable.

### What it checks (the six test files)
The spec text for the script is AC-57, `specs/12-eval-pipeline.md:664` on that branch. It says to check at least four things: migrations apply cleanly, both `vendor/shared` copies agree, the eval routes respond, and the scoring unit suite is green (AC-17..AC-22, including AC-20's zero denominators).

1. `src/modules/eval/scoring.test.ts` is a pure unit test. It covers:
   - `matches`: same file, intersecting line range.
   - `scoreCase` for `must_find` and `must_not_flag` (AC-17).
   - `errorCaseOutcome` (AC-11): errored cases are excluded from all counts.
   - `scoreRun`: recall = matched `must_find` / covered `must_find`; precision = 1 − FP/total; recall is `null` when there are no `must_find` cases (AC-20); `citation_accuracy` is computed from grounding numbers; `cost_usd` is summed, null-propagating.
   - `pairArms`, `computeLift` and `classifyEffects` (the two-arm skill ablation; this belongs to SPEC-15).
2. `src/modules/eval/frozen-input.test.ts` covers `synthesizeFrozenDiff` (round-trips through `parseUnifiedDiff`) and `isExpectationGrounded` (AC-6: refuses an expectation outside every hunk, and a null or empty patch).
3. `src/modules/eval/executor.test.ts` covers `EvalExecutor.runCase` (AC-8, AC-9, AC-10: the prompt is byte-identical for the same case and has no repo-map, callers or intent sections) and `buildArms` (AC-16, D8).
4. `test/eval-contract-parity.test.ts` covers AC-50:
   - The `// ---- Eval ----` region of `knowledge.ts` must be byte-identical in `server/src/vendor/shared/contracts` and `client/src/vendor/shared/contracts`.
   - `eval-ci.ts` must be identical after normalising three named, pre-existing drift hunks. A fourth divergence fails the test.
5. `test/contracts.test.ts` parses the `EvalRun` DTO shape. It is the reshaped `EvalRun` contract with `per_case`, not `per_trace`.
6. `test/eval.it.test.ts` is DB-backed via testcontainers (`startPg`) and self-skips when Docker is unavailable (D21). It applies the migrations, seeds, and builds the Fastify app with mock LLM and git clients. It asserts:
   - Seed (D22): exactly 7 agent-owned fixture cases for the seeded agent "Security Reviewer". Both `must_find` and `must_not_flag` expectation types are present, and the names equal `EVAL_FIXTURE_CASES` in `server/src/db/seed-eval-cases.ts`. The "≥8 cases" in AC-29 is met by 7 seeded plus one created live in the demo, so `verify:l06` itself asserts 7, not ≥8.
   - Routes used:
     - `GET /agents/:id/eval/cases`
     - `GET /agents/:id/eval/estimate`
     - `POST /agents/:id/eval/runs` (note `/eval/runs`, not `/eval-runs`)
     - `GET /agents/:id/eval/runs`
     - `GET /eval/runs/:id`
     - `GET /eval/dashboard`
     - `GET /eval/agents/:id`
     - `GET /eval/compare?a=&b=`
     - `DELETE /agents/:id` (D18: cascade-deletes the agent's cases and runs)
     - Skill-side routes: `/skills/:id/eval/{cases,carriers,estimate,runs}`, `/eval/skills/compare`, `/eval/skills/runs/all` and `GET /findings/:id/eval-skills`.
   - Single flight (AC-15): two rapid `POST` run triggers produce exactly one run.
   - Rate limit (AC-27), using a non-test `NODE_ENV` app.
   - Workspace scoping (AC-54, AC-53): other-workspace agent, case, run or carrier is refused.
   - Zero LLM calls on reads (AC-28): `/eval/dashboard`, `/eval/agents/:id`, case list, run list, run detail and compare all return 200, and `spyLlm.calls` has length 0 (`eval.it.test.ts:285-338`). This covers read routes only. Scoring itself is covered by the pure `scoring.test.ts`, where `scoreCase`/`scoreRun` are plain functions, but nothing explicitly asserts "no LLM import in scoring".
   - Unique constraint (D17): the DB constraint `eval_cases_source_finding_uq` refuses a second row for the same finding.
   - Skill stats (AC-45): `/skills/:id/stats` is byte-identical before and after an eval run.
   - Completed runs report cost and duration (AC-26).

### Constraints on naming, paths and schema (as implied by those tests)
- There is no check for a spec file path. `specs/12-eval-pipeline.md` and `plans/12-eval-pipeline.md` appear only in comments and docs. The tests never open them.
- There is no schema snapshot or "unchanged" check. The tests rely on a reshaped schema (`upstream/full-functionality:server/src/db/schema/eval.ts`). The columns the code and tests rely on are:
  - `eval_cases`: `workspace_id`, `owner_kind` ('skill'|'agent'), `owner_id`, `name`, `input_diff`, `input_files`, `input_meta`, `expected_output` (holds the `EvalExpectation`, with `type` of `must_find` or `must_not_flag`), `notes`, `source_finding_id`, `created_at`, `updated_at`.
  - `eval_runs`: `owner_kind`, `owner_id`, `ran_at`, `status` ('running'|'completed'|'errored'), `agent_version`, `case_ids`, `per_case`, `cases_errored`, `traces_passed`, `traces_total`, `finished_at`, `error_reason`, `recall`, `precision`, `citation_accuracy`, `duration_ms`, `cost_usd`, plus the SPEC-15 skill columns `skill_version`, `carrier_agent_id`, `gates_bypassed`, `arm_without`.
  - Unique index `eval_cases_source_finding_uq` on (`source_finding_id`, `owner_kind`, `owner_id`). Before SPEC-15 it was on `source_finding_id` alone.
- That schema differs from your branch: `git diff --stat L06-homework upstream/full-functionality -- server/src/db/schema/eval.ts` shows 128 insertions and 29 deletions.
- The tests assume these things exist: `server/src/modules/eval/{scoring,frozen-input,executor}.ts`, `server/src/db/seed-eval-cases.ts` exporting `EVAL_FIXTURE_CASES`, `modules/eval/constants.ts` exporting `RUN_RATE_LIMIT`, a seeded "Security Reviewer" agent and a skill named `secret-leakage-gate`. They also assume both `vendor/shared` copies contain a `// ---- Eval ----` marker in `knowledge.ts` and an `eval-ci.ts`.
- The spec says it "may skip DB-backed checks without Docker" (D21), so a green run without Docker proves only the unit and parity parts.

### Evidence
- `upstream/full-functionality:server/package.json:13-15` — the `verify:l03`, `verify:l06` and `verify:l07` scripts.
- `upstream/full-functionality:specs/12-eval-pipeline.md:109` (G9), `:276-286` (D21: lives in `server/package.json`, mirrors `verify:l03`, DB checks self-skip without Docker), `:288-294` (D22: 7 seeded cases), `:664-670` (AC-57).
- `upstream/full-functionality:server/test/eval.it.test.ts:20-24` (header comment), `:117-128` (7 cases), `:285-338` (zero provider calls on reads).
- `upstream/full-functionality:server/test/eval-contract-parity.test.ts:1-80` — parity check.
- `upstream/full-functionality:plans/12-eval-pipeline.md:629-632` — plan text for the script.
- git `af1cef4` "feat(eval-pipeline): implement Phase A server" (viktormashyka, 2026-08-19) — first commit adding the script.

### Could not determine
- Whether `upstream/full-functionality` is the instructors' official reference solution or one participant's work. The remote is `ai-agentic-engineering-neo/dev-digest`, and the commits are by viktormashyka. The `upstream/main` copy has no L06 verify script and no lesson specs.
- Whether your course or grader (outside this repo) expects `verify:l06` to exist in your branch, or what it would check there. Nothing in the repo or `upstream/main` defines such a contract. The claim that it is "course-defined" is unsupported. I found only this author-defined script.
- I did not fetch remotes or browse the web, so any remote branch newer than the local `upstream/*` refs was not seen.
- I ran no tests. I did not read the middle of `eval.it.test.ts` (L170-285 and L371-end) beyond the grep'd titles.