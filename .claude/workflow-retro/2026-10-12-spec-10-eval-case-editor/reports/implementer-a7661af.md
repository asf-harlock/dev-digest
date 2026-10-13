## Hand-back 1

## W1-B (B1–B3) report: contracts, schema and migration are done. The contract change breaks 5 server and client typecheck errors (counted below), the client typecheck, and 7 existing contract tests.

### What I changed
- **Contracts, identical in both copies.** I edited `server/src/vendor/shared/contracts/eval-ci.ts` and `client/src/vendor/shared/contracts/eval-ci.ts`, only inside the SPEC-08 region. The added lines are the same in both copies (diffed). No `.default()`.
  - New `EvalRunScope = z.enum(['set','case'])`, plus its type.
  - `scope: EvalRunScope` added to `EvalRunRecord` and `EvalSkillRunRecord`. `EvalAgentRunDetail` and `EvalSkillRunDetail` extend those records, so they inherit it once. `EvalRunDetail` is a discriminated union of the two details, so it picks it up too.
  - New `EvalRunningCaseRun = z.object({ run_id, case_id })`, plus its type.
  - `running_case_run: EvalRunningCaseRun.nullable()` added to `EvalOverview` and `EvalSkillOverview`. `running_run_id` is unchanged.
  - I did not touch `EvalDashboard` or `EvalCompare`. They carry run records and only pick up `scope` through them.
- **Schema.** `server/src/db/schema/eval.ts` now has `scope: text('scope', { enum: ['set','case'] }).notNull().default('set')` on `evalRuns`. The two partial unique indexes are unchanged.
- **`server/src/db/rows.ts`.** I left it alone. `EvalRunRow` is `$inferSelect`, so it gets `scope` automatically.

### Migration
Generated only via `cd server && pnpm db:generate`. Nothing was hand-edited and I did not run `db:migrate`.
- `server/src/db/migrations/0025_lovely_jamie_braddock.sql`
- `server/src/db/migrations/meta/0025_snapshot.json`
- `server/src/db/migrations/meta/_journal.json`: one entry appended, idx 25, tag `0025_lovely_jamie_braddock`.

The SQL is exactly:
```
ALTER TABLE "eval_runs" ADD COLUMN "scope" text DEFAULT 'set' NOT NULL;
```
drizzle-kit emitted nothing else, so I did not need to stop.

### Gates
- `./scripts/check.sh core typecheck`: PASS.
- `./scripts/check.sh server typecheck`: FAIL, 4 errors (log `.claude/implementer/logs/server-typecheck.log`).
- `./scripts/check.sh client typecheck`: FAIL, 5 errors (log `.claude/implementer/logs/client-typecheck.log`).
- `cd server && pnpm exec vitest run eval-contract-parity contracts`: 23 passed, 7 failed. `eval-contract-parity` passes. The 7 failures are all in `server/test/contracts.test.ts`, in "Eval contracts (SPEC-08)". Its run-record and overview fixtures lack `scope` and `running_case_run`.
  - `EvalRunRecord: all four statuses...`
  - `EvalRunDetail / EvalRunStart`
  - `EvalSkillRunRecord: running run has null arms...`
  - `EvalRunDetail discriminates a skill run...`
  - `EvalSkillOverview / EvalSkillTrendPoint`
  - `EvalOverview / EvalDashboard allow null metrics...`
  - `EvalCompare / EvalCompareQuery`
  
  Before my change that file passed (25 of 25 across both files), so these are expected breakages from the new required fields.

### Broken downstream files, for W2-B and W3-B (not touched by me)
All are TS2741 or TS2322 "missing `scope` / `running_case_run`".

Server (W2-B):
- `server/src/modules/eval/helpers.ts:192`: the agent run-record mapper is missing `scope`.
- `server/src/modules/eval/helpers.ts:301`: the skill run-record mapper is missing `scope`.
- `server/src/modules/eval/service.ts:807`: the skill overview is missing `running_case_run`.
- `server/src/modules/eval/service.ts:849`: the agent overview is missing `running_case_run`.
- `server/test/contracts.test.ts`: the 7 failing tests listed above (B9 fixtures).

Client (W3-B):
- `client/src/test/eval-fixtures.ts:29`: the run fixture is missing `scope`.
- `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.test.tsx:40`: the overview is missing `running_case_run`.
- `client/src/app/eval/agents/[agentId]/_components/EvalAgentDetailView/EvalAgentDetailView.test.tsx:33`: the overview is missing `running_case_run`.
- `client/src/app/skills/_components/SkillEditor/_components/EvalsTab/EvalsTab.test.tsx:87`: the skill run fixture is missing `scope`.
- `client/src/app/skills/_components/SkillEditor/_components/EvalsTab/EvalsTab.test.tsx:110`: the skill overview is missing `running_case_run`.

### Ambiguities
- The two vendor copies of `eval-ci.ts` already differed before my edit: `AgentManifest`/`CiFailOn` exist only in the server copy, and the `provider` enum differs near line 450. I did not touch those.
- I put `EvalRunningCaseRun` just before `EvalSkillOverview`, since both overviews use it. The plan did not name it, but the new type name starts with `Eval` as required.

### Notes
- The migration is not applied. The orchestrator needs to run `cd server && pnpm db:migrate` before any DB-backed work.
- Untracked files for the commit: the `0025_lovely_jamie_braddock.sql` file and `meta/0025_snapshot.json`.