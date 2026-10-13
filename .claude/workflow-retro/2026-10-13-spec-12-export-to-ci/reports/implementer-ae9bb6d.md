## Hand-back 1

## W2c report: service, routes, wiring (SPEC-12 step 9)

Workstream size: 1 step, 0 component folders. Gates are green (see Gates), but the service SQL and refresh paths have not been exercised against a DB.

### Files created (all in `server/src/modules/ci/`)
- `service.ts` is `CiService`, constructed from `container` and its own `CiRepository(container.db)`. It has no SQL, HTTP or `process.env`. Methods: `preview`, `previewFile`, `exportToPr`, `exportArchive`, `listInstallations`, `listRuns`, `refresh`.
- `routes.ts` has 8 routes. Each handler starts with `getContext`; schemas are `schema.params/body/querystring` plus response schemas.
- Small helper files for this workstream:
  - `errors.ts`: `ciError(code, details?)`, `githubFailure(err, [token])` (non-AppError becomes a 502 with the text scrubbed and truncated), `resetAtOf`.
  - `mappers.ts`: `toCiInstallation`, `toCiRun`, `toManifestAgent`, `toMemoryExportRow`, `trustedPrUrl`.
  - `zip.ts`: `buildZip` (fflate, fixed mtime, so the same files give the same bytes) and `archiveFilename`.
  - `pr-body.ts`: PR body text, fixed wording plus repo name and file count only.

### Files changed
- `server/src/modules/index.ts`: registered `ci`.
- `server/src/platform/config.ts`: added `AGENT_RUNNER_DIST` and `agentRunnerDist`. It is absolute; the default resolves `../agent-runner/dist` from `process.cwd()`, which is `server/`, the same way `cloneDir` does.
- `server/README.md`: new "Export to CI (SPEC-12)" section with the route table and ingest rules, plus an `AGENT_RUNNER_DIST` row in the Environment table.

### Route table
| Method path | Success | Errors |
|---|---|---|
| `POST /agents/:id/ci/preview` | 200 `CiPreview` | 404 agent/repo, 409 `runner_bundle_missing`, 422 `unsupported_target` / bad `workflow_yaml` / validation |
| `GET /agents/:id/ci/preview/file` | 200 `CiPreviewFileContent` | same, plus 404 for a path not in the export |
| `POST /agents/:id/export-ci` | 201 new installation / 200 republish `CiExport` | 409 `github_token_missing`, `runner_bundle_missing`, `ci_repo_taken`, `ci_export_running`, `ci_no_changes`; 502 `ci_pr_failed {branch}`; 403 `github_permission`; 429 `rate_limited`; 422; 404 |
| `POST /agents/:id/export-ci/archive` | 200 `application/zip`, `Content-Disposition`, `no-store` | as above, but no token or GitHub call |
| `GET /agents/:id/ci/installations` | 200 `CiInstallation[]` | 404 agent |
| `GET /ci/installations` | 200 `CiInstallation[]` | none |
| `POST /ci/refresh` | 200 `CiRefreshResult[]` | 404 installation, 409 `github_token_missing`, 409 `ci_refresh_running`, 403 `github_permission`, 429 `rate_limited {reset_at}`, 504 `refresh_timeout` |
| `GET /ci/runs` | 200 `CiRun[]` | none |

`preview/file` takes `triggers` as a csv. A missing `triggers` falls back to the contract default (all three); an invalid value gives 422.

### Behaviour worth knowing
- **Check order in export:** export lock on `ws:lower(repo)` (taken first), then agent/repo 404, then the `ci_repo_taken` pre-check (before any GitHub call), `workflow_yaml` 422, runner bundle 409, token 409. Then `commitFiles` from `default_branch` onto `devdigest/ci`.
- **PR phase:**
  - If `changed:false` and no open PR, `ci_no_changes` is thrown and the installation is not written.
  - A `findOpenPr` or `openPullRequest` failure after the commit becomes `ci_pr_failed {branch}`.
  - The returned PR URL is kept only if it is a github.com `/<repo>/pull/` URL; otherwise `pr_url` is null.
- **Status on write:**
  - Export (PR) keeps `active` or `manual` and otherwise writes `pending_pr`; the repository itself only protects `active`, so the service passes `manual` through.
  - Archive writes `manual`, or keeps `active`, and preserves the existing `pr_url`.
- **Refresh error policy (my decision):**
  - A request with `installation_id`, or a workspace-wide refresh where every installation failed, throws the first error as an HTTP error. This matches the client's `useAutoRefreshCi`, which catches rejections.
  - A partly failed workspace-wide refresh returns 200 with `status:'failed'` and `failure:{code, reset_at?}` per installation.
  - A refresh already running for an installation (`ci_refresh_running`) and a missed deadline (`refresh_timeout`) follow the same rule.
  - Rows stored before a failure stay, and `last_refreshed_at` is not advanced.
  - The ~50 s deadline is shared across the whole request.
- **Per-run ingest:**
  - A completed row already stored is skipped (AC-61).
  - `cancelled` and `timed_out` skip the artifact entirely and store `failed` with that reason.
  - `success` and `failure` list and download the artifact, then run `checkIngestArtifact`.
  - A valid artifact with `conclusion=failure` is stored as `failed` with counts and verdict (AC-59) but no `failure_reason`, and its `agent_runs` row is `done`.
  - `listWorkflowRuns` `github_permission` means 0 runs for `pending_pr`/`manual` and an error for `active`.
  - `failStaleRunning` runs after a successful refresh of an installation, and `markActiveOnFirstRun` fires if any completed run was seen.

### Deviations
- **New files beyond the plan:** the four small helper files above. I could not edit W2a's `constants.ts`/`helpers.ts`, so a few literals live in `service.ts` and `pr-body.ts` (`GITHUB_TOKEN`, not-found messages, the artifact-expired code, PR body text).
- **`prUrl()` not used:** `CiRun` has no PR-URL field and the client builds it itself (UI-12). `isTrustedJobUrl` is used both at ingest and in `toCiRun`.
- **`action` ignored:** `export-ci` and `export-ci/archive` do not read the `action` body field.
- **No W2a/W2b bugs found or edited.**

### Gates
- `./scripts/check.sh server typecheck`: PASS
- `./scripts/check.sh server lint <my files>`: PASS
- `./scripts/check.sh server arch`: PASS
- `./scripts/check.sh server related <service/routes/mappers/config>`: PASS (107 passed)
- `./scripts/check.sh server test` (extra): PASS (966 passed)
- A throwaway no-DB `app.inject` smoke test confirmed route registration and 422 handling. It covered `unsupported_target`, a bad `triggers` value and a bad refresh body; the file is deleted.

### For W5 (test-writer)
- **Hermetic `service.test.ts`:** needs a stub for `CiRepository`. The `CiService` constructor takes an optional second argument `repo`, so inject a fake there. Overrides for `secrets` (`secrets.get('GITHUB_TOKEN')`) and `github` (MockGitHubClient) go through the container. `config.agentRunnerDist` must point at a temp dir containing `index.js` and `package.json`.
- **Not yet exercised against a DB:**
  - `upsertRun` `onConflictDoUpdate` with `setWhere running`: confirm a completed row is untouched and returns undefined (the code relies on it), and that a running row becomes completed.
  - `upsertInstallation`: the 23505 race fallback, and that `active` is not demoted.
  - `selectDistinctOn` in `lastRunPerInstallation`.
  - `listRuns` `agent_id` subquery filter and `desc nulls last` ordering.
  - `failStaleRunning` `coalesce(ran_at, ingested_at)`.
  - `insertAgentRunAndLink` transaction.
  - `repoMemoryRows` / `countRepoMemory`.
  - `findRepoByFullName` case-insensitive match.
- **Gap (not fixed):** a crash between `saveCompletedRun` and `insertAgentRunAndLink` leaves a completed `ci_runs` row with `agent_run_id` NULL. Refresh never re-ingests it, because completed rows are skipped.
- **Locks are in-memory** (`exportLocks`, `refreshLocks`). To test concurrency, hold a deferred `commitFiles` or `listWorkflowRuns` promise and fire a second call.
- **GitHub call budget:** NFR-9 is 1 + 30×2 = 61 calls per installation.
- **No LLM and no token in any output:** check responses, commit files, PR body and error text.
- **`AGENT_RUNNER_DIST`:** the real `agent-runner/dist` does not exist in this tree (not built), so a real export returns 409 `runner_bundle_missing` until it is built.

---

## Hand-back 2

The completed `ci_runs` row and its `agent_runs` row are now written in one transaction, so a crash can no longer leave a completed row without its agent run (AC-60). The gates pass; I did not run it against a DB.

- **`ci/repository.ts`:** I added `saveCompletedRunWithAgentRun(run, agentRun)`. In one `db.transaction` it does the existing upsert, then, only if the upsert returned a row, inserts the `agent_runs` row (`source='ci'`, `pr_id` NULL) and sets `ci_runs.agent_run_id`.
  - `upsertRun` takes an optional executor, defaulting to `this.db`.
  - The agent-run insert and link are extracted into a private `insertAgentRunAndLinkIn(tx, …)`.
  - The public `insertAgentRunAndLink` and `saveCompletedRun` are unchanged, and nothing else calls them.
- **`ci/service.ts`:** `ingestRun` now makes that one call in place of `saveCompletedRun` followed by `insertAgentRunAndLink`. The tally logic is unchanged.
- **Idempotency:** an already-completed row still hits the upsert's `setWhere running` and returns `undefined`, so there is no second row and no second agent run (AC-61), and the unique key `(workspace_id, github_run_id, run_attempt)` still holds. Any failure inside the transaction rolls both writes back, so the run stays `running` or unstored and the next refresh retries it.
- **README:** the route table needs no change. It already says a completed run becomes one `ci_runs` row plus one `agent_runs` row.
- **Gates:** typecheck, lint on `service.ts` and `repository.ts`, arch and related (30 passed) all pass.

**For the test-writer** (DB-backed, in `server/test/ci.it.test.ts`):
1. Call `saveCompletedRunWithAgentRun` twice with the same `(workspace_id, github_run_id, run_attempt)`. Expect one `ci_runs` row, one `agent_runs` row with `source='ci'` and `pr_id` NULL, and `ci_runs.agent_run_id` set. The second call returns `undefined`.
2. Start from a `running` row for that key. Expect it to become completed with exactly one `agent_runs` row linked.
3. Atomicity: make the agent-run insert fail, for example with an invalid `agentId` (FK violation). Expect the whole call to throw and the `ci_runs` row to stay `running` (or absent if it was new) with no `agent_runs` row.

---

## Hand-back 3

Both bugs are fixed and every gate you listed is green. I only reproduced and re-tested them through the existing `service.test.ts` and IT suites, not as a standalone repro.

**Bug 1 (refresh 500)** is confirmed as you described. `failStaleRunning` interpolated a JS `Date` into a raw `sql` template, and postgres-js rejects that.
- **Fix:** `server/src/modules/ci/repository.ts` now builds the predicate with drizzle operators, `or(lt(ranAt, d), and(isNull(ranAt), lt(ingestedAt, d)))`, with the imports added.
- **Grep:** the other raw `sql` templates in `ci/repository.ts` (`lower()`, `count(*)`, `desc nulls last`, `now()`) interpolate only strings or columns. The `skills/repository.ts` templates (`count(distinct …)`, `count(*)`) are clean as well, so I changed nothing there.

**Bug 2 (EC-9 retry gets `ci_no_changes`)** is confirmed. With the branch present, the retry's tree equals the branch tip's tree, so `commitFiles` returned `changed:false`, and the service raised `ci_no_changes`.
- **Fix, in the adapter** (`server/src/adapters/github/octokit.ts`): when the tree is identical and the branch exists, it still makes no commit. It now compares the branch tip's tree with the default branch's tree and returns `changed = (they differ)`.
- **Resulting behaviour:** a branch that still differs from the default branch gives `changed:true`, so the service goes on to `findOpenPr` / `openPullRequest`. A branch equal to the default branch, or a missing branch whose parent is the base, gives `changed:false`, so `ci_no_changes` is raised (EC-10).
- **Cost:** this adds two reads (`getRef` and `getCommit` on the base) only on the identical-tree path. The service and the port signature are unchanged, and I did not touch the doc comment in `adapters.ts`. The meaning of `changed` shifts slightly in that one case ("the branch still differs from the base"). That is the only semantic change to the port.

**Tests**
- `octokit.test.ts`: `gitFake` takes a `baseTreeSha` option, and there are two new cases, EC-9 (branch differs from base, so `changed:true`, no commit, no `updateRef`) and EC-10 (branch equals base, so `changed:false`).
- `service.test.ts`: the `it.fails` EC-9 test is now a normal `it`. I changed the spy's `commitFiles` to model the adapter rule and added a `baseTree` field.
- The EC-10 test now sets `w.gh.baseTree` to the exported files, meaning the default branch already holds them, so it still expects `409 ci_no_changes`. As written before, it modelled only the branch holding the files, which under the new rule correctly opens a PR (the closed-without-merge case).

**Results** (from `server/` where noted)
- `./scripts/check.sh server typecheck`, `lint` on the 4 changed files and `arch`: PASS.
- `./scripts/check.sh server related <changed files>`: PASS (124 passed).
- `cd server && pnpm exec vitest run test/ci.it.test.ts test/ci-runs.it.test.ts test/ci-pr-isolation.it.test.ts test/ci-contract-parity.test.ts`: 4 files, 48 tests passed.

Files edited, all under `server/src/`: `modules/ci/repository.ts`, `adapters/github/octokit.ts`, `adapters/github/octokit.test.ts`, `modules/ci/service.test.ts`.

---

## Hand-back 4

S1, B2 and the C throttle decision are all fixed. typecheck, lint on the changed files, arch and related (151 passed) pass, and the four IT/parity files you named plus the new throttle test pass (5 files, 49 tests).

| id | status | evidence |
|---|---|---|
| S1 | fixed | `ingest.ts`: `validPrNumber` (1..2147483647, integer) is checked on both the artifact and the sidecar `pr_number` before the equality check. `service.ts`: `refreshInstallation` turns any unexpected error from `runRefresh` into a per-installation `failed` result with code `ingest_failed` (`errors.ts` `ingestFailed()`, fixed text). The ingest worker maps non-AppErrors the same way, so a poisoned run no longer aborts the workspace loop or bubbles a 500. |
| B2 | fixed | `octokit.ts` `classifyGitHubError`: details are now `{operation, status}`. `errors.ts` `isGithubNotFound` reads `details.status`. `service.ts` `runRefresh` swallows only a 404 on `pending_pr`/`manual` as "0 runs". A 403 is a failure for every status and does not advance `last_refreshed_at`; `active` is unchanged. |
| C | fixed | `octokit.ts`: `this.octokit` is the default `new Octokit({auth})`, with no throttle override. A second `this.ciOctokit` carries `onRateLimit` and `onSecondaryRateLimit` returning false. It is used only by `commitFiles`, `findOpenPr`, `openPullRequest`, `listWorkflowRuns`, `listRunArtifacts` and `downloadArtifact`. Those three pre-existing CI methods are called only from `modules/ci/service.ts`, so reviews, polling, issues and login are back to library defaults. |

Tests added:
- `ingest.test.ts`: forged `pr_number` values `99999999999`, `2147483648`, `0` and `-3` are rejected, and `2147483647` is accepted.
- `service.test.ts`:
  - A forged `pr_number` gives a stored row with `status failed` and reason `artifact_rejected`.
  - Workspace-wide refresh with one poisoned installation: the other refreshes (`failure: null`), the poisoned one reports `ingest_failed`, its token-like error text does not leak, and its `last_refreshed_at` stays null.
  - A 403 on `pending_pr` and on `manual` is `github_permission` with no rows stored and no clock advance.
  - An `active` installation gets `github_permission` on a 404.
  - Existing 403/404 fixtures now carry `details.status`.
- `octokit-throttle.test.ts` (new): mocks `octokit` to record constructor options and proves the default client has no `throttle` while the CI client has both handlers returning false.
- `octokit.test.ts`: `clientWith` fakes both clients, and the `commit_files` 403 test asserts `details.status` is 403.

One edit outside your file list: I corrected the 404/403 sentence in `server/README.md` to match the new rule and added a line about `ingest_failed`.

---

## Hand-back 5

A3 is fixed. Every gate you listed passes: server typecheck, lint on changed files, arch and related (717 passed); client typecheck, lint, arch and test (911 passed); and the four server IT/parity files (48 passed).

| id | status | evidence |
|---|---|---|
| A3 | fixed | `server/src/modules/ci/constants.ts`: `ingestFailed` added to `CI_ERROR`, `ingest_failed` to `CI_ERROR_STATUS` (500) and `CI_ERROR_MESSAGE` ("Ingesting the workflow runs failed."), plus `HTTP_NOT_FOUND = 404`. |
| A3 | fixed | `server/src/modules/ci/errors.ts:46` `ingestFailed()` now returns `ciError(CI_ERROR.ingestFailed)`; the local `NOT_FOUND_STATUS` is gone and `isGithubNotFound` uses `HTTP_NOT_FOUND`. |
| A3 | fixed | `ingest_failed` added to `CiErrorCode` in both `server/src/vendor/shared/contracts/eval-ci.ts` and `client/src/vendor/shared/contracts/eval-ci.ts`. The two copies are identical there. |

- **JSDoc:** documents "ingest_failed has no details". I also updated `github_permission {operation, status}` to match the earlier B2 fix.
- **Client mapping:** `REFRESH_REASON_KEY` in `CiRunsView/constants.ts` is not exhaustive and falls back to the `generic` key, so `ingest_failed` already gets a sensible message. I left `ci.json` untouched.
- **Parity test:** `ci-contract-parity.test.ts` stays green.