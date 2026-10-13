## Hand-back 1

## W1 / C1 report: EvalTrendPoint.cost_usd

**Files changed**
- /Users/harlock/Downloads/Sites/devdigest/server/src/vendor/shared/contracts/eval-ci.ts: added `cost_usd: z.number().nullable()` as the last field of `EvalTrendPoint`.
- /Users/harlock/Downloads/Sites/devdigest/client/src/vendor/shared/contracts/eval-ci.ts: the same edit, identical text. It sits inside the eval region the parity test compares.
- /Users/harlock/Downloads/Sites/devdigest/server/test/contracts.test.ts: added `cost_usd: null` to the one trend-point fixture, in the "EvalOverview / EvalDashboard allow null metrics" test (~l.570). That test failed without it.

No migrations and nothing else were edited.

**Gates**
- `check.sh server related` on eval-ci.ts, eval-contract-parity.test.ts and contracts.test.ts: PASS (485 passed).
- `check.sh core typecheck`: PASS.
- `check.sh server typecheck`: FAIL, one error caused by the new required field (see below). This is expected.
- `check.sh client typecheck`: FAIL, two errors caused by the new required field (see below). This is expected.

**Broken call sites (left for W2/W3, not edited)**
- W2, server: `server/src/modules/eval/helpers.ts:253`, `toTrendPoint`, returns a trend point without `cost_usd` (TS2741). The plan's C2 covers this. Also check `server/src/modules/eval/helpers.test.ts`, which references `agent_version`. It is not flagged by typecheck, but any exact-equality assertion on `toTrendPoint` output will need `cost_usd`.
- W3, client: `client/src/app/eval/agents/[agentId]/_components/EvalAgentDetailView/EvalAgentDetailView.test.tsx` lines 41 and 42, two trend-point fixtures missing `cost_usd` (TS2741).
- W3, client, not flagged by typecheck: `client/src/test/eval-fixtures.ts` and `EvalDashboardView.test.tsx` contain `agent_version`. They may hold trend fixtures typed loosely, so check them.

**Mismatches with the spec's Contracts block**
- None. `EvalSkillTrendPoint` from Phase B already carries `cost_usd: z.number().nullable()`, as the spec requires. The spec line `EvalTrendPoint += cost_usd: number|null` matches the new field. The nullable-number convention matches the file's existing `recall`, `precision` and `citation_accuracy` fields.