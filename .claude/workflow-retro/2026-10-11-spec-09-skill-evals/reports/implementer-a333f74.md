## Hand-back 1

## W1 / B1 (contracts) report

### Files changed
- `/Users/harlock/Downloads/Sites/devdigest/server/src/vendor/shared/contracts/eval-ci.ts` and `/Users/harlock/Downloads/Sites/devdigest/client/src/vendor/shared/contracts/eval-ci.ts`. The two copies are identical inside the eval region. The only edits are in that region, plus one import line, which is outside it.
- `/Users/harlock/Downloads/Sites/devdigest/server/test/contracts.test.ts`.
- The knowledge.ts files are untouched by me, and `eval-contract-parity.test.ts` is unchanged. The `knowledge.ts` entries in `git status` are Phase A's.

### Contracts added in eval-ci.ts
- `EvalAgentRunDetail`: today's `EvalRunRecord.extend` with `owner_kind: z.literal('agent')`, plus snapshot, case_set and case_results.
- `EvalLift`: `{recall, precision, citation_accuracy}`, each a number or null (raw fraction).
- `EvalSkillRunCarrier`: `{agent_id, name, version, model}`.
- `EvalSkillRunRecord`: the spec shape, with `owner_kind: 'skill'` and keys `with` / `without` as `EvalMetrics|null`.
- `EvalSkillRunSnapshot`:
  - `carrier` holds `{agent_id, name, version, provider, model, strategy, system_prompt}`.
  - `skill` holds `{name, body, version}`.
  - `with_skills` and `without_skills` are `[{name, body}]`.
- `EvalSkillCaseResult`: `{case_id, case_name, with, without: EvalCaseOutcome, effect: EvalCaseEffect}`.
- `EvalSkillRunDetail`: `EvalSkillRunRecord.extend({snapshot, case_set, case_results})`.
- `EvalRunDetail`: now `z.discriminatedUnion('owner_kind', [EvalAgentRunDetail, EvalSkillRunDetail])`.
- `SkillEvalRunRequest`: `{carrier_agent_id: uuid}`, plus `EvalSkillRunRequest` as an alias for it (see mismatches).
- `EvalSkillTrendPoint`: the spec shape.
- `EvalSkillCarrier`: `{agent_id, name, version, model, enabled, link_enabled}`.
- `EvalSkillOverview`: the spec shape.
- The import now also pulls `EvalCaseEffect` from `knowledge.js`.
- No `.default()` and no `.nullable()` on persisted-jsonb-only fields. Everything is a response shape, so `.nullable()` matches the spec.

### Gates
- `check.sh server related` (eval-ci.ts, contracts.test.ts, eval-contract-parity.test.ts): PASS, 467 passed. This covers the parity test and `contracts.test.ts`.
- `check.sh server lint server/test/contracts.test.ts`: PASS.
- `check.sh core typecheck`: PASS.
- `check.sh server typecheck`: FAIL, 1 expected error, listed under broken call sites. Log: `.claude/implementer/logs/server-typecheck.log`.
- `check.sh client typecheck`: FAIL, 14 expected errors, listed under broken call sites. Log: `.claude/implementer/logs/client-typecheck.log`.

### Tests touched in `server/test/contracts.test.ts`
- Added the new imports.
- The existing `EvalRunDetail / EvalRunStart` test now passes `owner_kind: 'agent'`. I also added assertions that an agent body without `owner_kind` is rejected and that `EvalAgentRunDetail` rejects `owner_kind: 'skill'`.
- Added a `skill eval runs (SPEC-09)` describe block covering `EvalSkillRunRecord`, `EvalLift`, the discriminated union both ways, `EvalSkillOverview`, `EvalSkillTrendPoint`, `EvalSkillCaseListItem.latest_result` and `SkillEvalRunRequest`.
- No other server test asserts agent run bodies without `owner_kind`. `eval.it.test.ts` is DB-backed and I did not run it. The plan already says its exact-equality bodies may need `owner_kind: 'agent'` (W2).

### Broken call sites (for W2/W3; I edited none)
**Server (1 typecheck error):**
- `server/src/modules/eval/helpers.ts:202-208`, `toRunDetail` returns an `EvalRunDetail` without `owner_kind`. Fix by adding `owner_kind: 'agent'` and returning `EvalAgentRunDetail`.
- `server/src/modules/eval/routes.ts:206` uses `response: { 200: EvalRunDetail }`. It typechecks, but agent rows will fail serialization until `toRunDetail` emits `owner_kind`.
- `server/src/modules/eval/service.ts:512`, `getRun(): Promise<EvalRunDetail>` is a union now. It returns the agent branch until B5 adds the skill branch.

**Client (14 errors; the union has no `metrics`, `agent_id`, `agent_version` or `snapshot.{model,strategy,skills}` on the skill arm):**
- `client/src/lib/hooks/eval.ts:362-365` (`useEvalRunDetail`), `:379` (`onFinished`) and `:413` (`api.get<EvalRunDetail>`). The type errors are at `:464-465`, which read `.agent_id`. Narrow these to `EvalAgentRunDetail`, per plan B6.
- `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/RunAllEvals/RunAllEvals.tsx:38` and `RunAllEvals.test.tsx:100` (`.metrics`).
- `client/src/app/eval/agents/[agentId]/_components/DetailHeader/DetailHeader.tsx:38` (`.metrics`).
- `client/src/app/eval/agents/[agentId]/_components/RunDetailModal/RunDetailModal.tsx:21,47,54,56,59,61,68`.
- `client/src/test/eval-fixtures.ts:47-60` (`runDetail()`) casts `as EvalRunDetail`, so it still typechecks. It has no `owner_kind`, so it should add `owner_kind: 'agent'` for runtime parity.
- Also check `client/src/lib/hooks/skill-eval.ts`, `client/src/app/eval/helpers.ts` and `RecentRunsTable.tsx`. They did not error, because they use `EvalRunRecord`.

### Spec / plan mismatches
1. **Request name.** The spec Contracts block says `SkillEvalRunRequest`. The plan and your brief say `EvalSkillRunRequest`. The spec wins, so `SkillEvalRunRequest` is the primary schema and `EvalSkillRunRequest` is an alias (`export const EvalSkillRunRequest = SkillEvalRunRequest`, plus a type alias). Either name works for W2/W3. Drop the alias later if you prefer one.
2. **`latest_result` on `EvalSkillCaseListItem`.** Phase A already filled it exactly per the spec and AC-40: `{run_id, with_state, without_state, effect, expected_count, got_count, cost_usd, error_reason}`. Your brief also listed a duration. The spec block and AC-40 have none, so I did not add one. I made no knowledge.ts change. `EvalCaseDetail.latest_result` already uses `EvalCaseLatestResult`, which has `duration_ms` and `cost_usd`, so AC-59's summed duration and cost fit there.
3. **`EvalTrendPoint.cost_usd`.** The spec lists `EvalTrendPoint += cost_usd: number|null`. The plan puts it in C1, not B1, so I did not add it.
4. **`EvalSkillCaseResult` field names.** The spec uses `case_name` alongside `with` / `without: EvalCaseOutcome`. `EvalCaseOutcome` already carries its own `name`. I followed the spec literally.