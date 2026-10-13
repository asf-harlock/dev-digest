## Hand-back 1

## Test-writing report: SPEC-08 server tests (plan step 21, W5)

All 110 tests pass, `verify:l06` is green, and Docker was available so the integration file ran. Skills applied (routing bucket `backend`): onion-architecture, fastify-best-practices, zod, security, typescript-expert. Every test name carries its AC/EC/NFR/UI id.

### Tests added
| File | Tests | Covers |
|---|---|---|
| `server/src/modules/eval/scoring.test.ts` | 27 | AC-27..34, EC-12, EC-19, EC-21, EC-26 (see below) |
| `server/src/modules/eval/frozen-input.test.ts` | 16 | AC-4, EC-4/5/6 (see below) |
| `server/src/modules/eval/executor.test.ts` | 10 | AC-22, NFR-2, UI-1/2, EC-12 (see below) |
| `server/src/modules/eval/prompt-diff.test.ts` | 6 | AC-48/50, UI-8, size-cap degrade |
| `server/src/modules/eval/skills-diff.test.ts` | 6 | AC-49: added, removed, changed, reorder-as-changed |
| `server/src/modules/eval/helpers.test.ts` | 19 | slugify, uniqueCaseName, expectationTypeFor, error helpers, finalStatus, toLatestResult, toTrendPoint |
| `server/test/eval-contract-parity.test.ts` | 5 | NFR-9 (see below) |
| `server/test/eval.it.test.ts` | 38 | AC-2..9, 15..18, 55..61, EC-1..14, 17, 25..37, NFR-1/3/4/13, UI-10 |

- **scoring.test.ts**:
  - Matching and labelling: inclusive overlap with no ±N tolerance, TP/FP/unlabeled labels, a finding overlapping both a must_find and a must_not_flag region judged only against its own case.
  - Zero denominators (EC-19), errored cases excluded (EC-12), `scoreCommon` over common cases only, `runCost` null rules.
  - NFR-1 is checked by an import check: `scoring.ts` imports only `@devdigest/shared` type-only. I chose that over a throwing LLM spy because the module has no LLM parameter to spy on.
- **frozen-input.test.ts**:
  - Exact path splitter (`src/config.ts` does not match `src/config.tsx`, `lib/src/config.ts` or `config.ts`), range must intersect a hunk (two-hunk gap case), `no_patch`, full-file kinds secret_leak/lethal_trifecta/phantom/hook, and a deleted-file header.
  - Fixture secrets are only `sk_live_xxx`, with an NFR-14 regex guard.
- **executor.test.ts**: uses `MockLLMProvider` from `adapters/mocks.ts` (the `ScriptedLLM` subclass is in the IT file only). Covers:
  - Exactly one `completeStructured` call per case, with `maxRetries` at most 2.
  - Two runs send byte-identical messages.
  - No repo-skeleton, PR-context, project-context, intent, callers or memory sections.
  - Title only in the task line, body only as the wrapped PR description.
  - Skills rendered in order, grounding counts including dropped findings.
  - A diff with zero files throws before any LLM call.
- **eval-contract-parity.test.ts**:
  - The two vendor files differ elsewhere (tour `.default` vs `.optional`, `AgentManifest`, `AgentVersion*`, providers), so the test compares only the eval regions byte for byte rather than normalising drift.
  - Regions: `// ---- Eval ----` up to `// ---- Memory ----` in `knowledge.ts`, and the Eval banner up to the Compose banner in `eval-ci.ts`.
  - It also checks that no `Eval*` export lives outside the compared regions, that both copies export the same `Eval*` set, and that neither region uses `.default()` in code.
- **eval.it.test.ts** (self-skips without Docker, uses `startPg`/`dockerAvailable`):
  - Case creation: both types, frozen to the finding's own file, slug and `-2`/`-3` names, pr_files fallback when git has no diff, EC-8 source null after the finding is gone.
  - 409 `eval_case_exists`, including two simultaneous requests giving one 201 and one 409.
  - EC-35 check order, tested with several failing checks per finding.
  - Case CRUD, including past runs unchanged after a case delete (AC-18).
  - Runs: full run, errored run, partial run, EC-19 null metrics, EC-28, EC-33, EC-14 reap, and agent-delete cascade (EC-9).
  - Reads: overview, dashboard (EC-24, EC-36 sparkline gaps), compare with its check order, 404 for another workspace's ids, 422 for non-UUID ids.
  - Single-flight is held open with a gated LLM: two simultaneous POSTs give exactly one 202 and one 409 whose `details.run_id` matches the 202's id. The agent is edited mid-run and the run still finishes with its start-time snapshot (EC-17).
  - NFR-4: a full run leaves reviews, findings, agent_runs, agent_run_skills, run_traces and every `last_reviewed_sha` untouched.
  - NFR-1: create, list, get, rename, case-links, overview, dashboard, run detail, compare and delete never reach the provider (`entered === 0`).
  - NFR-13: runs in its own container with 10 agents × 50 runs × 50 cases; both routes answer under the 500 ms threshold after one warm-up request (whole test about 335 ms).

### Run results
- `cd server && pnpm exec vitest run src/modules/eval test/eval-contract-parity.test.ts` — pass (84 hermetic tests in the 6 `src` files plus 5 parity).
- `cd server && pnpm exec vitest run test/eval.it.test.ts` — pass, 38 tests (Docker available); run three times with no flakiness.
- `cd server && pnpm run verify:l06` — pass, 110 tests across the 6 files it names, including `test/contracts.test.ts`.
- `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` — pass, 58 files, 697 tests.
- `./scripts/check.sh server typecheck` — pass.
- `./scripts/check.sh server lint` — pass.
- The `tsconfig.json` include is `src/**` only, so I also type-checked `test/eval.it.test.ts` and `test/eval-contract-parity.test.ts` with a temporary tsconfig (since deleted): clean.

### Findings (not fixed, no source bugs)
- `server/test/routes-smoke.test.ts` has no route list, so I did not edit it.
- Spec wording differs from the implemented contract. The tests follow the implementation and the W1 contract tests:
  - AC-58 says the run has `progress: {done,total}`; the contract uses `cases_done` and `cases_total`.
  - AC-61 says "a map from finding id to case id"; `EvalCaseLinks` is `{links: [{finding_id, case_id, agent_id}]}`.
  - AC-60 says the compare response returns deltas; `service.ts` states "the server returns no deltas", and the client computes them.

### Out of scope
- `reviewer-core/` and `e2e/` (not covered by this agent), and client tests (W6).
- The route smoke file was left untouched, as above.