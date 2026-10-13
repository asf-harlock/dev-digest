## Hand-back 1

## Implementation report: SPEC-11 W2b (steps 7-8, GitHub port + Octokit adapter + mocks + ci/repository + skills source filter)

Workstream size: 2 steps, 1 new folder. All inner-loop gates pass. The new SQL in `ci/repository.ts` has not been run against Postgres (see Handoff).

### Files changed
- `server/src/vendor/shared/adapters.ts` (server copy only, as permitted)
- `server/src/adapters/github/octokit.ts`
- `server/src/adapters/github/octokit.test.ts` (existing 2 tests kept, 14 new)
- `server/src/adapters/mocks.ts`
- `server/src/modules/ci/repository.ts` (new)
- `server/src/modules/skills/repository.ts` (one line: `eq(t.agentRuns.source, 'local')` in `countRunsByAgents`, AC-64)

Skills applied: onion-architecture, fastify-best-practices, zod, security, typescript-expert, drizzle-orm-patterns (the plan's routing for these files).

### Port signatures W2c consumes (exported from `@devdigest/shared`)
- `CommitFilesResult { branch: string; changed: boolean }`
- `commitFiles(repo, payload): Promise<CommitFilesResult>`
  - If the new tree sha equals the parent tree, no commit or ref is made and it returns `changed: false`.
  - Timeout is 120 s.
- `WorkflowRun { id, run_attempt, status, conclusion|null, head_sha, event, path, head_repository_full_name|null, html_url, created_at, run_started_at|null, updated_at, pull_requests: number[] }`
- `RunArtifact { id, name, size_in_bytes, expired }`
- `ListWorkflowRunsOptions { workflowPath, event, perPage }`
- `listWorkflowRuns(repo, opts): Promise<WorkflowRun[]>`
- `listRunArtifacts(repo: RepoRef, runId: number): Promise<RunArtifact[]>`
- `downloadArtifact(repo: RepoRef, artifactId: number): Promise<Uint8Array>`
  - It follows the 302 by hand and fetches the Location URL with no Authorization header. The target must be https.
  - Content-Length is checked against 16 MiB, and the stream is capped at 16 MiB while reading.

### Classified errors the adapter throws
There are no new error classes. These are plain `AppError` from `platform/errors.ts`; the service should match on `code`. Every message is fixed text of at most 200 characters, with no upstream text and no token.

| code | status | details | thrown when |
|---|---|---|---|
| `github_permission` | 403 | `{operation}` | GitHub answers 403 or 404 for `commit_files`, `list_workflow_runs` or `list_run_artifacts` |
| `rate_limited` | 429 | `{reset_at}` ISO string, omitted if unknown | 429, or 403 with `x-ratelimit-remaining: 0`. It is raised on the first attempt, with no retry. |
| `artifact_expired` | 410 | none | `downloadArtifact` gets 410 or 404, from the API or from the storage host |
| `artifact_rejected` | 422 or 502 | none | `downloadArtifact`: over the size cap, a non-https or missing redirect target, or a failed download |

- Only 5xx and network errors are retried.
- `listWorkflowRuns` 404 also becomes `github_permission`. The service has to apply the plan's rule for 404 (0 runs for `pending_pr`/`manual`, `github_permission` for `active`).
- `downloadArtifact` 404 becomes `artifact_expired`, not `github_permission`. A deleted artifact therefore doesn't abort a whole refresh.

### Mock (`MockGitHubClient`)
New options: `commitChanged` (default true), `workflowRuns`, `artifacts` (by run id) and `artifactBytes` (by artifact id).
- `commitFiles` pushes to `committed` only when `changed` is true.
- `downloadArtifact` rejects with `artifact_expired` when no bytes are configured for that id.

### `CiRepository` (class, `new CiRepository(db)`)
Every method takes `workspaceId` first. The service gets it from `getContext()`, as `SkillsRepository` does. It is SQL only; Octokit is not used anywhere in it.
- Export inputs:
  - `findRepoByFullName(ws, fullName)`, matched on `lower(full_name)`, returns `CiRepoRow | undefined`
  - `getAgent(ws, agentId)`, returns `AgentRow | undefined`
  - `enabledSkillsInLinkOrder(ws, agentId)`, returns `CiSkillRow[]` (`id, name, body, version`)
  - `repoMemoryRows(ws, repoId, limit)`, newest first with an id tiebreak, returns `CiMemoryRow[]`
  - `countRepoMemory(ws, repoId)`
- Installations:
  - `listInstallationsByAgent(ws, agentId)`, `listInstallations(ws)`, `getInstallation(ws, id)` and `findInstallationByRepo(ws, repo)` (case-insensitive)
  - All four return `CiInstallationWithAgent { installation: CiInstallationRow; agentName; agentVersion /* agent's current version */ }`.
  - `upsertInstallation(UpsertInstallationInput)` returns `{kind:'saved', installation} | {kind:'repo_taken', installation, agentName}`.
    - It updates in place when the same agent owns the repo, and returns `repo_taken` when a different agent does.
    - It never demotes an `active` installation.
    - It handles a 23505 insert race itself, so the service gets no exception.
  - `touchLastRefreshed(ws, id, at)`
  - `markActiveOnFirstRun(ws, id)`, which only moves `pending_pr` and `manual` to `active`
- Runs:
  - `findRunByGithubId(ws, runId, attempt)`
  - `upsertRunning(UpsertRunInput)` and `saveCompletedRun(UpsertRunInput)` both return `CiRunRow | undefined`.
    - The upsert is `ON CONFLICT (workspace_id, github_run_id, run_attempt) DO UPDATE ... WHERE status='running'`.
    - A row that is already completed is left untouched and `undefined` is returned, which gives the AC-61 skip.
    - `ci_runs.source` is written as `'github_actions'`.
  - `insertAgentRunAndLink(InsertAgentRunInput): Promise<string>` returns the agent run id.
    - One transaction: insert `agent_runs` with `source='ci'` and `pr_id` null, then set `ci_runs.agent_run_id`.
  - `failStaleRunning(ws, olderThan: Date): Promise<number>` marks `running` rows `failed` / `stale` using `coalesce(ran_at, ingested_at)`.
  - `listRuns(ws, {repo?, agentId?, status?, installationId?, limit?})`
    - Ordered by `ran_at DESC NULLS LAST`, limit clamped to 1..200.
    - The `agentId` filter goes through `ci_installations.agent_id`, because `ci_runs` has no agent id.
  - `lastRunPerInstallation(ws, ids[]): CiLastRun[]` (`{installationId, status, ranAt}`); installations without runs are absent.

### Gates (inner loop only; the caller runs the outer loop)
- `./scripts/check.sh server typecheck` — PASS (3s)
- `./scripts/check.sh server lint <6 files>` — PASS (1s)
- `./scripts/check.sh server arch` — PASS (1s)
- `./scripts/check.sh server related <6 files>` — PASS (550 passed); `octokit.test.ts` alone: 16 passed

### Self-check
- Diff matches the plan: yes. Only my owned files were touched. `agent-runner/` was not touched, and the client `adapters.ts` copy was not touched, as instructed.
- Naming and "Do not touch" rules respected: yes. The only edit under `vendor/` is the permitted server `adapters.ts`.
- i18n: n/a, no client work.

### Deviations from plan
1. In the Octokit constructor I set `throttle: { onRateLimit: () => false, onSecondaryRateLimit: () => false }`.
   - Why: octokit's default handlers sleep until the reset and retry once, which would make `rate_limited` (EC-26) unreachable.
   - Effect: this applies to every method of the client, so rate-limited requests elsewhere now fail fast instead of waiting.
2. In `commitFiles`, a `getRef` failure on the branch now falls back to the base only on a 404. Previously any error was swallowed. Other errors now propagate and are classified.
3. `downloadArtifact` makes one fewer API call than the prior-art version. It no longer calls `getArtifact`; the size check is done on Content-Length and while streaming. `listRunArtifacts` still exposes `size_in_bytes` if the service wants an early check.
4. The mock's `committed` array no longer records a commit when `commitChanged: false`.

### Handoff note
- `ci/repository.ts` has no DB-backed test. It was not in my file list, and Docker `.it.test.ts` and the `migration apply` step are pending in `state.json`. These parts are the riskiest and have only been typechecked, linted and arch-checked; they should get an `.it.test.ts` when migration 0026 is applied:
  - `ON CONFLICT ... setWhere`
  - `selectDistinctOn`
  - the agent-id subquery in `listRuns`
  - the 23505 handling in `upsertInstallation`
- `countRunsByAgents` already has `.it` coverage (`skills-stats.it`) that is in the pre-existing baseline failures. The `source` filter is the one-line change in `skills/repository.ts`.
- `mocks.ts` now imports `platform/errors.ts`. `arch` passes with that import.
- For architecture review: the adapter throws `AppError` with CI-specific codes (`github_permission`, `rate_limited`, `artifact_expired`, `artifact_rejected`). That puts the CI error contract in the adapter layer rather than in a port-level error type.