## Hand-back 1

## Test-writing report: SPEC-12 server tests (plan step 14)

Hermetic suite is green, but two real defects in the implementation surface as 7 red tests (6 integration, 1 `it.fails` hermetic). Scope was server only; I changed no production file. Skills applied (routing.json, `server/test` and `src/**/*.test.ts`): bucket `backend` — onion-architecture, fastify-best-practices, zod, security, typescript-expert.

### Bugs found (not fixed)
1. **HIGH/CRITICAL: `POST /ci/refresh` answers 500 after ingesting the rows** (EC-28, AC-54, AC-60, AC-62).
   - `server/src/modules/ci/repository.ts:518` (`failStaleRunning`) passes a `Date` into a raw `sql` template: `` sql`coalesce(...) < ${olderThan}` ``. On postgres-js this throws `TypeError: The "string" argument must be of type string or an instance of Buffer…`.
   - `service.ts:455` calls it on every refresh that ends without a failure, so the throw lands before `markActiveOnFirstRun` (:456) and `touchLastRefreshed` (:457).
   - Effect: ci_runs and agent_runs rows are stored, but the installation never becomes `active`, `last_refreshed_at` stays null, the debounce never applies, and the client gets a 500.
   - The hermetic service tests miss it because the repository is faked. Only the Docker tests catch it.
   - Likely fix: `.toISOString()` with a `::timestamptz` cast, or `or(lt(ranAt, d), and(isNull(ranAt), lt(ingestedAt, d)))`.
   - Proof: with `failStaleRunning` stubbed out in a scratch copy, my refresh-route and isolation tests passed. Only the two EC-28 tests, which exercise `failStaleRunning` itself, stayed red. The scratch copies are deleted.
2. **HIGH: the EC-9 retry cannot open the PR.**
   - `octokit.ts:401-412` takes the existing `devdigest/ci` branch as the parent, and `:429` reports `changed:false` when the tree equals the parent's.
   - After a failed `openPullRequest`, the retry therefore commits an identical tree, finds no open PR, and `service.ts:770-771` throws `ci_no_changes` instead of opening the PR.
   - The hermetic test `EC-9: the retry after a failed PR reuses the same branch and opens the PR` is marked `it.fails`; flip it to `it` once fixed. The spy models the real adapter's parent/tree rule.

### Tests added
- `server/src/modules/ci/service.test.ts`: 76 tests, hermetic. It uses an in-memory fake `CiRepository` injected as the second constructor arg, and a `SpyGitHub` built on `MockGitHubClient` with a call log, gates, injectable failures and the real adapter's `changed` semantics. The container is a plain object (secrets, `agentRunnerDist` → temp dir, an `llm` spy).
- `server/test/ci.it.test.ts`: 19 tests. Migration 0026 is proven on a database with pre-0026 data (journal truncated, templated DBs), schema invariants, the NFR-2 unique index and races, tenancy, EC-18, and the export routes.
- `server/test/ci-runs.it.test.ts`: 20 tests (5 red, see bugs). The atomic save, `countRunsByAgents`, stale runs, listing, and a refresh driven through the HTTP routes.
- `server/test/ci-pr-isolation.it.test.ts`: 3 tests (1 red). It snapshots the PR list, timeline, cost and reviews before and after CI writes, once via the repository and once via a real refresh.
- `server/test/ci-contract-parity.test.ts`: 6 tests. It compares the SPEC-12 region of both `eval-ci.ts` copies. The only allowed differences are server `.default()` read as client `.optional()` and the server-only `AgentManifest`.
- `server/test/helpers/ci.ts`: shared fixtures (runner dist, row inserters, run/artifact builders, `CiMockGitHub` with per-repo open-PR tracking).

I did not rename the W2a/W2b tests. Most already carry spec IDs, and you allowed renaming only where one is missing.

### ID → test (`it('ID: …')`)
| ID | Where |
|---|---|
| AC-12, AC-13, AC-15, AC-16, AC-17 | `service.test.ts` exportToPr; AC-12/13/15 also in `ci.it.test.ts` (route) |
| AC-18, AC-19 (zip, manual) | `service.test.ts` exportArchive; `ci.it.test.ts` zip route |
| AC-32, AC-33, NFR-2 (409 `ci_repo_taken` with details, case-insensitive) | `service.test.ts`; `ci.it.test.ts` route with different letter case |
| NFR-2 unique index, 23505 race, other workspace free | `ci.it.test.ts` (6 concurrent installs → 1 saved, 5 `repo_taken`) |
| AC-34 (update not duplicate, slug kept, active not demoted) | `service.test.ts`; `ci.it.test.ts` (concurrent same-agent) |
| AC-54 debounce / force | `service.test.ts`; `ci-runs.it` (red) |
| AC-55 | `service.test.ts` |
| AC-56 running → completed | `service.test.ts`; `ci-runs.it` repository tests |
| AC-57..AC-59 mapping, active flip | `service.test.ts`; `ci-runs.it` |
| AC-60 incl. atomic `saveCompletedRunWithAgentRun` | `ci-runs.it`: one agent_run (source `ci`, `pr_id` NULL) linked; FK-failing agent run rolls back the new row and leaves a running row running; concurrency |
| AC-61 idempotent re-ingest, unique key | `ci-runs.it`: twice → one + one, 5 concurrent saves → one agent_run; `service.test.ts` (no re-download) |
| AC-62, AC-63 | `service.test.ts`; `ci-runs.it` route (red) |
| AC-64 | `ci-runs.it`: `countRunsByAgents` returns 2 of 2 local + 3 ci; ci-only agent → 0 |
| AC-65, NFR-16 | `ci-pr-isolation.it`: repository-write variant passes; real-refresh variant red (bug 1) |
| EC-1 | `service.test.ts`; `ci.it` route |
| EC-2, EC-25 | `service.test.ts` (404 → 0 runs for pending_pr/manual, `github_permission` for active, rows unchanged) |
| EC-3 | `service.test.ts` (preview, export, zip; no GitHub call) |
| EC-4 | `service.test.ts`; `ci.it` route |
| EC-5, EC-6, EC-11, UI-3, UI-4, UI-6 | `service.test.ts`; `ci.it` (422/404) |
| EC-8 | `service.test.ts` (lock, case-insensitive, per workspace) |
| EC-9 | `service.test.ts` (`ci_pr_failed` with branch passes; retry is `it.fails`, bug 2) |
| EC-10 | `service.test.ts` |
| EC-18 | `ci.it`: installations cascade-deleted, runs keep repo and agent name, agent_run `agent_id` null |
| EC-20..EC-24, EC-36 | `service.test.ts` |
| EC-26, AC-62 | `service.test.ts` (reset_at, workspace-wide partial) |
| EC-27 | `service.test.ts` (deferred `listWorkflowRuns` → `ci_refresh_running`, lock released after) |
| EC-28 | `service.test.ts` passes; `ci-runs.it` ×2 red (bug 1) |
| EC-34, NFR-3 | `ci.it`: installations kept (workspace from agent, status active, `workflow_version` 0), legacy runs kept with synthetic negative ids, orphan runs dropped, duplicate repo aborts with its message and loses nothing |
| NFR-1 | `service.test.ts`; `ci.it` (all repository reads and writes from a second workspace) |
| NFR-4 | `ci-contract-parity.test.ts` |
| NFR-8 | `ci.it` (10 skills, under 2 s, runner contents null) |
| NFR-9 | `service.test.ts` (exactly 61 calls, at most 5 concurrent downloads, 1 call on a re-run) |
| NFR-10 | `service.test.ts` (50 s deadline → `refresh_timeout`) |
| NFR-11 | `service.test.ts` (llm spy never called) |
| NFR-12 | `service.test.ts` (token scrubbed and capped at 200 characters in export and refresh errors; no token or key in files, PR body, zip or responses); `ci.it` responses |
| UI-8..UI-10 | `service.test.ts` (origin path, `@ref`, case-insensitive repo, event; artifact "agent" text ignored); bounds are in `ingest.test.ts` |
| UI-11 | `service.test.ts` |

Not testable here: the full 61-call budget against real GitHub, and NFR-13/14 (client).

### Gate results
- `./scripts/check.sh server test`: PASS, 1048 passed (was 848 before the feature).
- `./scripts/check.sh server typecheck`: PASS.
- `./scripts/check.sh server lint`: PASS.
- `./scripts/check.sh server arch`: PASS.
- `cd server && pnpm exec vitest run test/ci.it.test.ts test/ci-runs.it.test.ts test/ci-pr-isolation.it.test.ts`:
  - `ci.it`: 19/19 pass.
  - `ci-runs.it`: 15 pass, 5 red (all from bug 1).
  - `ci-pr-isolation.it`: 2 pass, 1 red (bug 1).
- Full `pnpm exec vitest run .it.test`: 12 failed, 335 passed. My 6 red tests are bug 1; the other 6 are `skills.it` 404, 4 × `skills-stats.it`, and `context-run.it` EC-14. All 6 are outside my scope and not in `baseline_failures` except `context-run.it`, which passed when re-run alone and is flaky under the full run. Rows already in the baseline are `skills.it` 404 and the `skills-stats.it` ones.

### Out of scope
`reviewer-core/`, `e2e/`, `client/` and `agent-runner/` were not touched. Nothing was run against live GitHub.