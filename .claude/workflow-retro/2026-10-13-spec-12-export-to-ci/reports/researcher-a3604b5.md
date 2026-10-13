## Hand-back 1

## Repository Research: prior Export-to-CI / CI-run ingest in git history

### Conclusion
Yes. Two prior generations exist, none on `main`, `origin/main` or the current branch (which has only `agent-runner/src`, no `server/src/modules/ci/`, no `agent-runner/dist`). Gen 1 is the "Worktree B" implementation (`1980dea`/`0574487`, 2026-07-08, on `upstream/lesson-7-lab/multiagents-finish`). Gen 2 is the SPEC-14 rewrite on `upstream/full-functionality` (tip `3ac8179`, 2026-09-10). A multi-agent roster follow-up, `03a73ad` + `32f33a4` (2026-09-10), is only on `upstream/fix/numbered-diff-line-citations`. Gen 2 is the one to reuse.

### Gen 2 (`upstream/full-functionality`) — what it did
- **Ingest channel:** PULL only. `POST /ci/refresh {force}` makes the server poll GitHub Actions with the user's GitHub PAT via Octokit: `listWorkflowRuns({workflowPath})` (20 per page), `listRunArtifacts`, then `downloadArtifact`.
  - There is no inbound push endpoint. Gen 1's `routes.ts` says so: "no inbound push endpoint".
  - Auth is the normal `getContext` workspace scoping, and the artifact is then untrusted input. Evidence: `modules/ci/service.ts` (`refresh`, `ingestInstallation`, `ingestOneRun`) and `adapters/github/octokit.ts` (`listWorkflowRuns`, `listRunArtifacts`, `downloadArtifact`).
  - `GET /ci/runs` reads stored rows only, with no GitHub call. The client refetches every 30 s (`hooks/ci.ts`), and the server debounces each installation to 30 s unless `force` (`refresh.ts`, in-memory).
- **Artifact trust boundary** (`ingest.ts`): the zip is read with only 2 known entry names inflated, a 64-entry cap, 256 KiB per entry and an unsafe-path refusal. The 16 MiB compressed cap is checked in `downloadArtifact`.
  - It rejects secret-shaped values.
  - It validates `CiResultArtifact` and `CiRunMeta` against the shared schemas.
  - It requires the sidecar `commit_sha` to equal the run's `head_sha`.
  - It requires the sidecar `repository` to equal the installation's repo.
  - A failed check gives a `failed` row with `failure_reason`.
- **Generated file paths** (`constants.ts`):
  - `.github/workflows/devdigest.yml` (`WORKFLOW_PATH`).
  - `.devdigest/agents/agent.yaml` in the full-functionality version (fixed slug, because the runner demands exactly one manifest).
  - `.devdigest/skills/<skill>.md`.
  - `.devdigest/memory.jsonl`.
  - `.devdigest/runner/{index.js, 310.index.js, package.json}`.
  - Branch `devdigest/ci`, PR title "Add DevDigest CI review".
- **Runner shipping:** the `agent-runner/` ncc bundle (`agent-runner/dist`, committed in `488acfb`) is copied wholesale into the target repo under `.devdigest/runner/` (`bundle.ts`, dir from `CI_RUNNER_BUNDLE_DIR` via `platform/config.ts:103`).
  - The workflow runs `node .devdigest/runner/index.js`, with no marketplace action and no npm install.
  - `bundle.ts` throws a stated `ValidationError` if `dist` is missing ("Run `pnpm --dir agent-runner build`").
  - In the preview, runner file contents are `null` (~1.6 MB) and fetched on demand via `GET /agents/:id/ci/preview/file`.
- **Workflow** (`workflow.ts`): built with `yaml` `Document`, not string joins.
  - It triggers on `pull_request` with types from `opened/synchronize/reopened`.
  - The job is guarded by `if: github.event.pull_request.head.repo.fork == false`.
  - Permissions are minimal (`contents: read`; `pull-requests: write` unless `post_as: none`).
  - Actions are pinned by full SHA with a version comment (`PINNED_ACTIONS`: checkout v4.4.0, setup-node v4.4.0, upload-artifact v4.6.2).
  - Env: `OPENROUTER_API_KEY` (from secret), `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `PR_NUMBER`, `DEVDIGEST_POST_AS`.
  - A fixed `run:` step "Write run metadata" writes `devdigest-run.json` {commit_sha, repository, pr_number}.
  - The upload step publishes artifact `devdigest-result` containing `devdigest-result.json` and `devdigest-run.json`, with `if: always()`.
  - No agent or user text is ever interpolated into a `run:` step.
- **Workflow versioning:** no version number is stored in the workflow. Updates go through `republish` (`POST /ci/installations/:id/republish`): regenerate from the agent's current config and recommit to the same `devdigest/ci` branch, reusing an open PR (`findOpenPr`). A header comment says re-running "Update CI config" overwrites the file. Output is deterministic and byte-identical for an unchanged agent (AC-9).
  - `ci_installations` stores `workflow_path`, `branch`, `base`, `post_as`, `triggers`, `pr_url`, `last_export_at` and `last_refreshed_at`.
- **Routes** (`modules/ci/routes.ts`):
  - `GET /ci/targets`
  - `POST /agents/:id/ci/preview`
  - `GET /agents/:id/ci/preview/file`
  - `POST /agents/:id/export-ci` (201 new installation, 200 republish; 422 when the credential is missing or cannot write)
  - `POST /agents/:id/export-ci/archive` (zip)
  - `GET /agents/:id/ci/installations`
  - `GET /agents/:id/ci/secrets` (secret NAMES only)
  - `POST /ci/installations/:id/republish`
  - `POST /ci/refresh`
  - `GET /ci/runs`
  - `GET /agents/performance`
- **One vs many agents:**
  - full-functionality: exactly ONE agent per repo. `ci_installations_repo_uq` is a unique index on (workspace, repo). A second agent export returns `refused_reason` (AC-59). The runner (`agent-runner/src/manifest.ts`) throws on 0 or more than 1 manifest. The current branch's runner still has this single-manifest rule (`manifest.ts:42`).
  - `03a73ad` ("let several reviewers share one repository's CI installation") adds the `ci_installation_agents` roster table (migration 0027) and one manifest per agent at `.devdigest/agents/<name>-<hash8>.yaml`. It also unions skills and deletes stale files under `.devdigest/` via `pruneDirs`.
  - `32f33a4` makes the runner review every manifest in one job and post one merged review. Both are only on `upstream/fix/numbered-diff-line-citations`.
- **How runs were written** (`service.ts` `persistRun`):
  - **`agent_runs`:** one row per provider run, `agentId` = installation's agent, `prId: null`, `provider`/`model` null, status `done` or `failed`, plus duration, cost, findings count and error. It is written for failures too and is idempotent: it reuses `existingRun.agentRunId` via `getRunByProviderRunId`.
  - **`ci_runs`:** `upsertRun`, unique on (`workspace_id`, `provider_run_id`) (`db/schema/ci.ts`). Columns include `repo` (denormalised so orphaned runs still show a repo), `status` (succeeded, failed, no_findings, running), critical/warning/suggestion counts, `cost_usd`, `duration_ms` with `duration_source` (artifact or provider), `source` (= target type), `failure_reason` and `agent_run_id`.
  - **Status and trace:** a completed run with no artifact becomes `failed` / `no_artifact_published` (never skipped). `no_findings` versus `succeeded` is derived from `findings_count === 0`, not from the job exit code. A stub `run_traces` row is also written via `buildRunTrace`, with source `ci`.
  - **Agent Performance:** `GET /agents/performance?range_days=7|30|90`, built from `agent_runs`.
- **Client** (`upstream/full-functionality`):
  - Agent editor CI tab: `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/` with `ExportWizard/{TargetStep,PreviewStep,ConfigureStep,InstallStep}`. Step keys are `target, preview, configure, install` (`ExportWizard/constants.ts`).
  - CI Runs page: `client/src/app/ci-runs/` (`CiRunsView`, `CiRunsTable`).
  - Agent Performance: `client/src/app/agent-performance/`.
  - Hooks in `client/src/lib/hooks/ci.ts`. i18n in `client/messages/en/ci.json`.
  - A GitHub Actions target is the only one registered (`targets.ts`); circle, jenkins and cli exist in the enum but render nowhere.
- **Gen 1 (`0574487`) differences:**
  - The workflow was `.github/workflows/devdigest-review.yml`, with tag refs (`actions/checkout@v4`) and no run-meta sidecar. A real generated example is committed in `1f0873f` along with `.devdigest/agents/general-reviewer.yaml`.
  - The agent manifest used a per-agent slug (`slug.ts`).
  - The UI page was `client/src/app/ci/`.
  - Routes: `POST /agents/:id/export-ci`, `GET /agents/:id/ci-installations`, `POST /ci/refresh`, `GET /ci/runs`.
  - Also pull-based. Its `ingest.ts` downloaded the artifact `devdigest-result` by name.
  - Docs: `docs/plans/export-to-ci.md` and `specs/2026-07-08-export-to-ci.md`.

### Evidence
- `git show upstream/full-functionality:server/src/modules/ci/{constants,workflow,bundle,ingest,service,refresh,routes,targets}.ts` — the details above.
- `git show upstream/full-functionality:server/src/db/schema/ci.ts`, `.../adapters/github/octokit.ts`, `.../client/src/lib/hooks/ci.ts`, `.../agent-runner/src/{index,manifest}.ts`.
- `git show 0574487:server/src/modules/ci/routes.ts` — "no inbound push endpoint".
- Commits:
  - `0574487` / `1980dea` — Gen 1.
  - `84f2bf4`, `f4e7e6a`, `6efe4b4`, `0823ea2`, `294d663`, `9430c44`, `04935b7`, `1e2beaa`, `dffac85` — SPEC-14 phases A–E and tests (`ci-export.it.test.ts`, `ci-ingest.it.test.ts`).
  - `03a73ad`, `32f33a4` — multi-agent roster and runner.
  - `488acfb` — built dist committed.
  - `08916c6`, `207a516`, `dad3033`, `5acec55` — SPEC-13/14 specs and plans.
- Branch containment (`git branch -a --contains`):
  - `f4e7e6a` is in `upstream/full-functionality`, `upstream/debug-experiment` and `upstream/fix/numbered-diff-line-citations`.
  - `03a73ad` is only in `upstream/fix/numbered-diff-line-citations`.
  - `0574487` is only in `upstream/lesson-7-lab/multiagents-finish`.

### Could not determine
- I did not read the shared contract file `contracts/eval-ci.ts`, the `ci/repository.ts` internals, `agent-runner/src/run.ts`/`artifact.ts` (the exact `CiResultArtifact` fields beyond those used in `service.ts`), or the SPEC-14 text.
- I did not check whether `upstream/emdash/export-to-ci-4sp` and `upstream/devdigest/ci` differ from the above.
- Whether `agent_runs` has a `source` column: `persistRun` doesn't set one, and `source: 'ci'` is only in the trace config. I did not verify the `runs.ts` schema.
- Whether this branch's `.gitignore` excludes `agent-runner/dist`; it is absent from the tree.