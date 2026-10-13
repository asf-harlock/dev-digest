## Hand-back 1

## W1 report (steps 1–3): contracts, DB schema and migration, `yaml` dependency

Workstream size: 3 steps, 0 new component folders. Steps 1–3 are done and all inner-loop gates pass.

### Files changed
- `server/src/vendor/shared/contracts/eval-ci.ts`
- `client/src/vendor/shared/contracts/eval-ci.ts`
  - The only differences from the server copy are the `.default()` to `.optional()` swaps, the known `AgentManifest` and `Provider` drift, and the `CiFailOn` import.
  - The client copy now also imports `CiFailOn` from `knowledge.js`, which already exports it.
- `server/src/db/schema/ci.ts`
- `server/src/db/migrations/0026_reflective_secret_warriors.sql` (new, hand-edited), `meta/0026_snapshot.json` (new), `meta/_journal.json`
- `server/package.json` and `server/pnpm-lock.yaml`, via `pnpm add`

### Gates (inner loop; all `check.sh` output)
- `PASS server:typecheck`
- `PASS client:typecheck`
- `PASS server:lint` on `src/db/schema/ci.ts`
- `PASS server:arch`
- `PASS server:related` (554 tests passed)
- `PASS client:related` (45 tests passed)
- `pnpm db:generate` after the final edits prints "No schema changes", so schema, snapshot and migration agree.

### Migration: `server/src/db/migrations/0026_reflective_secret_warriors.sql`
It is not applied to the main database; the orchestrator should ask the user before running `pnpm db:migrate`.
- **Added columns:** every new column is added nullable first, then backfilled, then set NOT NULL.
- **Legacy `ci_installations` rows** get:
  - workspace, `agent_version` and `ci_fail_on` copied from the agent
  - `status='active'`, `workflow_version=0` (so the UI shows "Update available")
  - `post_as='github_review'` and the three default triggers
  - `manifest_slug` as a slug of the agent name (fallback `agent`, at most 64 characters)
- **Legacy `ci_runs`:**
  - Rows with no installation are deleted.
  - The rest take workspace, repo and agent name from their installation.
  - `github_run_id` is a unique synthetic negative id. Real GitHub run ids are positive, so they cannot clash.
  - `run_attempt` is 1.
  - `status` is mapped into the enum: `failure` or `error` become `failed`; null or other values become `no_findings` when there are 0 findings, otherwise `succeeded`.
- **Duplicates:** a `DO` block raises an exception if two installations in one workspace share a repo (compared lowercase). It runs before the unique index is created.
- **Indexes:** the two `ran_at` indexes are `DESC NULLS LAST`, matching drizzle's `.desc()` and the convention in `eval.ts`.

### Scratch-database verification
I used a throwaway database `devdigest_w1_scratch` on the `devdigest-postgres` container and dropped it afterwards. The main `devdigest` database was not touched.
- **Setup:** I applied 0000–0025, then inserted legacy data: 2 agents, 2 installations (one agent name made only of `!`), and 5 `ci_runs` (valid, `failure`, null status, unknown status, and one with no installation).
- **0026 with data:** it applied in a single transaction. Both installations survived with the backfilled values above. 4 of the 5 runs survived; only the one with no installation was deleted. All NOT NULL constraints and all five new indexes were created.
- **Duplicates:** with installations for `Acme/Web` and `acme/web` in one workspace, the migration aborted with "Cannot add the unique index … duplicate repositories … acme/web (2 installations)". The transaction rolled back and `ci_installations` kept its legacy columns.
- **Final file:** I re-ran the final migration file on a fresh scratch database after renaming it. It succeeded.

### Dependency
- `pnpm add yaml@^2.6.1` resolved to 2.9.0, and pnpm wrote `"yaml": "^2.9.0"` in `package.json`. That satisfies the plan's lower bound.
- The lockfile gained 3 lines.
- pnpm printed a `cpu-features` `node-gyp` install failure. It is an existing optional transitive dependency and unrelated to `yaml`.

### Exported names for W2a, W2b, W2c, W3, W4a and W4b
Both copies export these through the existing barrel `./contracts/eval-ci.js`, which `index.ts` already re-exports. Each name is both a Zod schema and a type.

| Name | Shape |
|---|---|
| `CiExportInput` / `CiExportInputBody` | `repo`, `target`, `action` (`open_pr` or `files`), `post_as`, `triggers` (enum array, min 1), `workflow_yaml?`. `base` is removed. |
| `CiInstallationStatus` | `pending_pr`, `manual`, `active` |
| `CiRunStatus` | `succeeded`, `failed`, `no_findings`, `running` |
| `CiFailureReason` | `artifact_rejected`, `no_artifact`, `artifact_expired`, `cancelled`, `timed_out`, `stale` |
| `CiInstallation` | `id`, `agent_id`, `agent_name`, `repo`, `target_type`, `status`, `pr_url`, `workflow_version`, `agent_version`, `post_as`, `triggers`, `ci_fail_on`, `installed_at`, `last_refreshed_at`, `update_available`, `last_run: {status, ran_at}\|null` |
| `CiExport` | `{installation, pr_url, file_count}`. `files` is removed. |
| `CiRun` | `id`, `installation_id`, `repo`, `agent_name`, `pr_number`, `status`, `verdict`, `failure_reason`, `findings_count`, `critical`, `warning`, `suggestion`, `cost_usd`, `duration_ms`, `ran_at`, `job_url` |
| `CiPreviewFile` | `path`, `kind` (`manifest`, `skill`, `memory`, `workflow`, `runner`), `editable`, `contents` (null for runner files), `size_bytes`, `note` |
| `CiPreviewWarningCode`, `CiPreviewWarning` | code is `provider_not_openrouter`, `memory_truncated` or `memory_empty`; warning is `{code, count?}`. These are my additions, since the plan only sketched `{code, ...}`. |
| `CiPreview` | `{files, file_count, workflow_version, warnings}` |
| `CiPreviewFileContent` | `{path, contents, size_bytes}`. The plan did not specify this shape; I chose it. |
| `CiRunsQuery` / `CiRunsQueryInput` | `repo?`, `agent_id?`, `status?`, `installation_id?`, `limit` (coerced int, 1–200). Server default is 50; the client copy is `.optional()`. |
| `CiRefreshInput` / `CiRefreshInputBody` | `force` (server default false), `installation_id?` |
| `CiRefreshResult` | `installation_id`, `status` (`refreshed`, `skipped`, `failed`), `added`, `updated`, `skipped`, `failure: {code: string, reset_at?: string}\|null` |
| `CiErrorCode` | the 11 codes from the plan; the `details` keys are documented in its JSDoc |
| `CiRunMeta` | `{commit_sha, repository, pr_number}` |

- `CiFile`, `CiTarget`, `CiResultArtifact` and `AgentManifest` are unchanged. `CiFile` is now unused by `CiExport`.
- The server schema exports `ciInstallations` and `ciRuns` from `server/src/db/schema/ci.ts`, and `schema.ts` already re-exports them.
- `ciInstallations` columns:
  - `workspaceId`, `agentId`, `repo`, `targetType`, `status`, `prUrl`
  - `workflowVersion`, `agentVersion`, `postAs`
  - `triggers` (`jsonb` typed `string[]`), `ciFailOn`, `manifestSlug`
  - `installedAt`, `lastRefreshedAt`
- `ciRuns` columns:
  - `workspaceId`, `ciInstallationId`, `repo`, `agentName`, `prNumber`, `ranAt`
  - `githubRunId` (bigint, number mode), `runAttempt`, `headSha`, `status`, `verdict`, `failureReason`
  - `findingsCount`, `critical`, `warning`, `suggestion`, `costUsd`, `durationMs`
  - `githubUrl` (= `job_url`), `source`, `agentRunId`, `ingestedAt`
- Unique indexes are `(workspaceId, lower(repo))` on installations and `(workspaceId, githubRunId, runAttempt)` on runs.

### Self-check
- **Matches the plan:** yes. Additions beyond it are `CiPreviewWarning.count`, the `CiPreviewFileContent` shape, and `CiRunsQueryInput`.
- **Rules:** the only vendor files edited were the two `eval-ci.ts` copies. I did not edit `agent-runner/`, older migrations or any lockfile by hand.
- **Migration regeneration:** I regenerated my own unapplied 0026 once. The first attempt used array-form indexes, which produced `DESC` instead of `DESC NULLS LAST`, so `db:generate` made an extra 0027. I deleted 0026, 0027 and their snapshots, restored `_journal.json` from `HEAD` with `git show HEAD:… > file`, and regenerated. No `git checkout`, `reset` or `stash` was used.
- **i18n:** n/a.

### Deviations and handoff
- **Deviation:** `triggers` is stored as `jsonb` typed `string[]` in the schema, because the plan says only "jsonb".
- **Server consumers still to write:** the service (W2c) maps `CiRun.job_url` to `ci_runs.github_url`, and any legacy rows with negative `github_run_id` have no real run id.
- **Update behaviour:** a legacy installation with `workflow_version=0` shows `update_available=true` until it is re-exported.
- **Hand off to the orchestrator:**
  - Applying 0026 to the main database needs user approval.
  - `server/INSIGHTS.md` could record that `.desc()` generates `DESC NULLS LAST` and that the hand-edited NOT NULL backfill pattern was used in 0026.