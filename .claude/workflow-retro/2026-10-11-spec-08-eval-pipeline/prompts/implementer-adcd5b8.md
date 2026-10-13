Execute `.claude/sdd/SPEC-08/plan.md` (repo root /Users/harlock/Downloads/Sites/devdigest). Spec: `specs/08-eval-pipeline.md`.

You are workstream W2 of a multi-agent run. Steps 5–13 only. Files owned: `server/src/modules/eval/**` (excluding `*.test.ts` — test-writer W5 owns those), `server/src/modules/_shared/skill-render.ts`, `server/src/modules/reviews/run-executor.ts`, `server/src/modules/agents/{service,repository}.ts`, `server/src/modules/index.ts`, `server/src/platform/container.ts`, `server/src/app.ts`, `server/package.json` (scripts line only; no lockfile). Run only the inner loop.

W1 is DONE (contracts, schema, migrations exist; do not edit them). Read the real shipped files, not the plan's description of them:
- `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts` (case shapes in knowledge.ts, run/overview/compare shapes in eval-ci.ts — deviation from the plan, both re-exported via `@devdigest/shared`)
- `server/src/db/schema/eval.ts`, `server/src/db/rows.ts` (`EvalCaseRow`, `EvalRunRow`; `eval_runs.metric_parts` stores the full `EvalMetrics`; contract field `expectation` ↔ column `expected_output`; `eval_runs.ran_at` is the start time).
- Do NOT run `pnpm db:migrate`; the orchestrator asks the user. Your DB-backed code can't be exercised here, so rely on typecheck/lint/arch and hermetic tests you may write only if trivial — W5 writes the real tests.

Constraints to honour (from the plan's Constraints section and module docs): onion layering (routes→service→repository→helpers/constants), eval module must not import `reviews/*` or `agents/*` (only `_shared/*`, db, container); every handler begins with `getContext`; Zod schemas on routes; no `process.env`; no LLM call in read/CRUD/scoring; eval run writes nothing to reviews/findings/agent_runs/agent_run_skills/run_traces/pull_requests. Read `server/CLAUDE.md`, `server/docs/db-schema.md` and the INSIGHTS.md Decisions first. Use skills per routing.json for the paths you touch. Upstream reference (read-only, via `git show upstream/full-functionality:<path>`): `server/src/modules/eval/{scoring,frozen-input,executor,service,routes}.ts` — borrow shapes where sound, but implement SPEC-08 (our routes, 409 on duplicate case, `partial` status, labeled TP/FP/unlabeled counts, EvalCompare shape).

Gates for you: `./scripts/check.sh server typecheck`, `./scripts/check.sh server lint`, `./scripts/check.sh server arch`, and the existing hermetic tests that cover what you touched (e.g. `run-executor-*` and agents tests) — `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` if it is fast enough. Also verify manually that no adapter imports `modules/`.

Return concise: files created/changed, route list as registered, gate results, deviations from the plan, anything W5 (test-writer) must know (exported function names for scoring/frozen-input/executor, constants such as error codes).

---
## Resume 1

Note for W2 from the orchestrator: the client hooks (W1b, done) read ids from the error `details` of 409 responses. Put the existing case id under `details.case_id` for `eval_case_exists`, and the running run id under `details.run_id` for `eval_run_in_progress`. Other 4xx codes the client branches on: 422 finding_undecided / agent_missing / no_patch / range_outside_diff / no_eval_cases / run_not_finished. Keep the route list as in the plan.