## Hand-back 1

## W1 report: contracts + db (steps 1-4), SPEC-08

Steps 1-4 are done and all three gates pass. I ran only the inner loop and did not run `db:migrate`.

### Files changed
- `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts`: the `// ---- Eval ----` region is replaced. The region is byte-identical in both copies (checked with diff).
- `server/src/vendor/shared/contracts/eval-ci.ts` and `client/src/vendor/shared/contracts/eval-ci.ts`: the Eval block is replaced and the imports are updated.
- `server/test/contracts.test.ts`: the old `EvalRun` parse is removed and a new `describe('Eval contracts (SPEC-08)')` block is added.
- `server/src/db/schema/eval.ts`: schema for `eval_cases` and `eval_runs`.
- `server/src/db/rows.ts`: adds `EvalCaseRow` and `EvalRunRow`.
- No `index.ts` edit was needed. Both barrels use `export *`, and no file outside `vendor/shared` and the contracts test referenced the removed symbols.

### Generated migrations (generator only, never hand-edited)
- `server/src/db/migrations/0020_eager_cassandra_nova.sql` (pass 1, additions only), plus `meta/0020_snapshot.json`.
- `server/src/db/migrations/0021_strong_psynapse.sql` (pass 2, deletions only), plus `meta/0021_snapshot.json`.
- `meta/_journal.json` was updated by the generator.
- Neither pass prompted about a rename.
- Pass 1 SQL:
  - It adds the new columns to `eval_cases` and `eval_runs`, with the NOT NULL tightening on `input_diff`, `input_meta` and `expected_output`.
  - It creates `eval_cases_owner_idx`, `eval_cases_source_finding_uq`, `eval_runs_agent_ran_idx` and the partial unique `eval_runs_one_running_uq` (`WHERE status = 'running'`).
  - It adds an FK `eval_runs.workspace_id` → `workspaces` (cascade).
  - It adds `eval_runs` NOT NULL columns with no default (`workspace_id`, `agent_id`, `agent_version`, `snapshot`, `case_set`). This is safe only while `eval_runs` is empty, as the plan's Migration risk says.
- Pass 2 SQL: drops the `eval_runs_case_id_eval_cases_id_fk` constraint and the `case_id`, `actual_output` and `pass` columns.

### Final eval_runs columns
- `id`, `workspace_id`, `agent_id`, `status`, `agent_version`, `snapshot`, `case_set`, `case_results`, `metric_parts`, `traces_passed`, `traces_total`, `cases_errored`, `finished_at`, `error_reason`
- Kept from before: `ran_at` (the run's start time), `recall`, `precision`, `citation_accuracy`, `duration_ms`, `cost_usd`
- Drizzle keys are camelCase: `workspaceId`, `agentId`, `agentVersion`, `caseSet`, `caseResults`, `metricParts`, `tracesPassed`, `tracesTotal`, `casesErrored`, `finishedAt`, `errorReason`, `ranAt`, `citationAccuracy`, `durationMs`, `costUsd`.
- `metric_parts` is typed `EvalMetrics | null`, so it stores the full metrics object including tp/fp/unlabeled and num/den.
- `agent_id` has no FK.

### Final eval_cases columns
- `id`, `workspace_id`, `owner_kind`, `owner_id`, `name`, `input_diff` (NOT NULL), `input_files` (nullable jsonb), `input_meta` (NOT NULL, typed `EvalCaseMeta`), `expected_output` (NOT NULL, typed `EvalExpectation`), `notes`, `source_finding_id` (uuid, no FK, unique index), `created_at`, `updated_at`.
- Drizzle keys: `sourceFindingId`, `createdAt`, `updatedAt`, `inputFiles`, `inputMeta`, `expectedOutput`.
- Note the contract field is `expectation`, while the column is `expected_output`.

### Contract fields, exactly as shipped
All ids are `z.string()` except `EvalCompareQuery`. There are no `.default()` or `.optional()` calls anywhere, so the two copies are identical. The `severity`, `category` and `title` fields on `EvalExpectation` use `.nullish()`, which is a minor difference from the plan's `?:string|null`.

**In `knowledge.ts`**
- `EvalOwnerKind`: `'skill'|'agent'`.
- `EvalExpectationType`: `'must_find'|'must_not_flag'`.
- `EvalExpectation`: `{type, file, start_line:int, end_line:int, severity?:string|null, category?:string|null, title?:string|null}`.
- `EvalCaseMeta`: `{pr_number:int, repo_full_name, title, body:string|null}`.
- `EvalCaseSource`: `{repo_id, pr_number:int}`.
- `EvalCase`: `{id, owner_kind, owner_id, name, input_diff, input_meta:EvalCaseMeta, expectation:EvalExpectation, source_finding_id:string|null, notes:string|null, created_at, updated_at}`.
- `EvalCaseLatestResult`: `{run_id, state:'passed'|'failed'|'errored', expected_count:int|null, got_count:int|null, duration_ms:int|null, cost_usd:number|null, error_reason:string|null}`.
- `EvalCaseListItem`: `{id, name, expectation, created_at, latest_result:EvalCaseLatestResult|null}`.
- `EvalCaseDetail`: `EvalCase.extend({source:EvalCaseSource|null, latest_result:EvalCaseLatestResult|null})`.
- `EvalCaseRename`: `{name: string.min(1).max(80)}`.
- `EvalCaseLinks`: `{links:[{finding_id, case_id, agent_id}]}`.
- `EvalFindingLabel`: `'tp'|'fp'|'unlabeled'`.
- `EvalActualFinding`: `{file, start_line:int, end_line:int, title, severity:string, category:string, label}`.
- `EvalCaseOutcome`: `{case_id, name, expectation_type, status:'scored'|'errored', pass:boolean|null, error_reason:string|null, expected_count:int|null, got_count:int|null, findings:EvalActualFinding[], grounding_kept:int, grounding_total:int, duration_ms:int, cost_usd:number|null}`.

**In `eval-ci.ts`** (this is where the run shapes had to go; `Provider` is declared later in `knowledge.ts`, so using it in the `knowledge.ts` eval region would hit a TDZ error). Both are re-exported from `@devdigest/shared`, so import paths are unchanged.
- `EvalRunStatus`: `'running'|'completed'|'partial'|'errored'`.
- `EvalRunSnapshot`: `{provider:Provider, model, strategy:'auto'|'single-pass'|'map-reduce', system_prompt, skills:[{name, body}]}`.
- `EvalCaseRef`: `{id, name}`.
- `EvalRatio`: `{value:number|null, num:int, den:int}`.
- `EvalMetrics`: `{recall, precision, citation_accuracy: EvalRatio, tp, fp, unlabeled, traces_passed, traces_total, cases_errored: int}`.
- `EvalRunRecord`: `{id, agent_id, agent_name:string|null, status, started_at, finished_at:string|null, agent_version:int, cases_total:int, cases_done:int, metrics:EvalMetrics|null, duration_ms:int|null, cost_usd:number|null, error_reason:string|null}`.
- `EvalRunDetail`: `EvalRunRecord.extend({snapshot, case_set:EvalCaseRef[], case_results:EvalCaseOutcome[]})`.
- `EvalRunStart`: `{id, status: z.literal('running')}`.
- `EvalTrendPoint`: `{run_id, ran_at, agent_version:int, recall|precision|citation_accuracy: number|null}`.
- `EvalOverview`: `{agent:{id, name, model, enabled:boolean}, cases_total:int, finished_runs:int, running_run_id:string|null, latest:EvalRunRecord|null, previous:EvalRunRecord|null, trend:EvalTrendPoint[], runs:EvalRunRecord[]}`.
- `EvalAgentSummary`: `{agent_id, agent_name, model, enabled:boolean, cases_total:int, latest:EvalRunRecord|null, sparkline:(number|null)[]}`.
- `EvalDashboard`: `{agents:EvalAgentSummary[], recent_runs:EvalRunRecord[]}`.
- `EvalCompareQuery`: `{a: uuid, b: uuid}`.
- `EvalCompareRatios`: `{recall, precision, citation_accuracy: number|null}`.
- `EvalCompare`: `{old:EvalRunRecord, new:EvalRunRecord, common_cases:int, only_old:int, only_new:int, common:{old:EvalCompareRatios, new:EvalCompareRatios}, prompt_diff:[{kind:'added'|'removed'|'context', text}], prompt_changed:boolean, skills_diff:{added:string[], removed:string[], changed:string[]}, model_change:{from,to}|null, strategy_change:{from,to}|null}`.

**Removed symbols**
- `EvalRun`, `EvalPerTrace`, `EvalCaseInput` and `EvalRunResult` are gone. `EvalRunResult` is the one the old `eval-ci.ts` defined as `{run_id, case_id, result: EvalRun}`.
- `EvalRunRecord`, `EvalDashboard` and `EvalTrendPoint` are re-defined with the new shapes.
- Nothing else referenced the removed symbols.

### Gates
- `./scripts/check.sh server typecheck`: PASS server:typecheck 2s
- `./scripts/check.sh client typecheck`: PASS client:typecheck 1s
- `cd server && pnpm exec vitest run test/contracts.test.ts`: 14 tests passed. `check.sh server related server/test/contracts.test.ts` also printed PASS (14 passed).

### Deviations from plan
- The split of the Eval shapes between `knowledge.ts` and `eval-ci.ts` is the one change from the plan, forced by the `Provider` TDZ issue described above. As a result, `EvalCaseOutcome` is imported into `eval-ci.ts`. Nothing is lost for consumers.
- The client `eval-ci.ts` now imports `Provider` from `./knowledge.js`. It was already exported there and the client copy already declared it, so this is only an import change.
- Pre-existing drift in the rest of the two `vendor/shared` copies (tour, `AgentManifest`, the provider enum) is untouched.

### Handoff note
- The orchestrator still needs to ask the user to run `cd server && pnpm db:migrate`. Without it, the W5 DB-backed tests will not see the new columns.
- `eval_runs.agent_id` has no FK, so only the programmatic cascade (plan step 11) cleans it up.
- `pnpm lint` and `pnpm arch` were not run, since this is an inner loop on contracts and schema only.