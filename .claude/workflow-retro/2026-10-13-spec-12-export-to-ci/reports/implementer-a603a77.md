## Hand-back 1

## Implementation report: SPEC-12 W2a (steps 4-6: pure generators + ingest check)

Workstream size: 3 steps, 0 component folders, so no size flag. All files are in `~/emdash/worktrees/devdigest-2b9b9360/l07-lab-export-to-ci/server/src/modules/ci/`. I did not touch `agent-runner/`, vendor files or anything outside that dir. `repository.ts` in the same dir belongs to W2b.

### Files created
Source: `constants.ts`, `helpers.ts`, `workflow.ts`, `manifest.ts`, `memory-export.ts`, `bundle.ts`, `ingest.ts`, plus `assemble.ts` (an addition, see Deviations).
Tests: `helpers.test.ts`, `workflow.test.ts`, `manifest.test.ts`, `memory-export.test.ts`, `bundle.test.ts`, `ingest.test.ts`, `assemble.test.ts`.

### Public exports for W2c
Errors are thrown as `AppError` / `ValidationError` / `NotFoundError` from `platform/errors`. W2c does not need to map them.

**constants.ts** (all literals)
- Workflow and file layout: `WORKFLOW_PATH`, `WORKFLOW_NAME`, `WORKFLOW_VERSION` (1), `CI_BRANCH`, `PR_TITLE`, `COMMIT_MESSAGE`, `MEMORY_PATH`, `RUNNER_DIR`, `ARTIFACT_NAME`, `PINNED_ACTIONS`.
- Limits and timings: `MEMORY_MAX_ROWS`, `WORKFLOW_MAX_BYTES`, `REFRESH_RUNS_LIMIT` (30), `RUN_HISTORY_LIMIT`, `RUNS_LIST_MAX`, `STALE_RUN_MS`, `ERROR_TEXT_MAX`, `REFRESH_DEBOUNCE_MS` (30 s), `AUTO_REFRESH_MS`, `REFRESH_CONCURRENCY` (5), `REFRESH_DEADLINE_MS` (50 s), `COMMIT_TIMEOUT_MS` (120 s), `ARTIFACT_MAX_*`.
- GitHub run constants: `INGESTED_CONCLUSIONS` and type `IngestedConclusion`, `WORKFLOW_EVENT`.
- Errors: `CI_ERROR` (code literals), `CI_ERROR_STATUS` and `CI_ERROR_MESSAGE` (both keyed by `CiErrorCode`).

**helpers.ts** (pure)
- `slugify(name, fallback?): string`
- `uniqueSlugs(names, fallback?): string[]`
- `runnerRepoPath(rel): string`
- `type SeverityCounts = {critical, warning, suggestion}`
- `severityBlockers(counts, failOn): number`
- `deriveVerdict({...counts, findings_count}, failOn): Verdict`
- `deriveRunStatus({conclusion: IngestedConclusion, artifactOk, findingsCount: number|null}): 'succeeded'|'failed'|'no_findings'`
- `isTrustedJobUrl(url, repo): boolean`
- `prUrl(repo, n): string|null`
- `truncateGithubError(text: unknown, secrets?: string[]): string`
- `stripWorkflowRef(path): string`
- `isExpectedWorkflowRun({event, path, head_repository_full_name}, installationRepo): boolean` (origin check, UI-10; use it in refresh)

**workflow.ts**
- `type WorkflowOptions = {triggers: ('opened'|'synchronize'|'reopened')[]; postAs: 'github_review'|'pr_comment'|'none'}`
- `buildWorkflowYaml(opts): string`
- `orderTriggers(triggers)`
- `validateWorkflowYaml(text): {ok:true} | {ok:false; message}`
- `assertValidWorkflowYaml(text): void` (throws 422 with the parser message)

**manifest.ts**
- `type ManifestAgent = {name, provider, model, system_prompt, strategy, ci_fail_on}`
- `buildManifestYaml(agent, skillSlugs): string` (422 if invalid or if it does not round-trip)
- `manifestPath(slug)`, `skillPath(slug)`

**memory-export.ts**
- `type MemoryExportRow = {id, kind, content, confidence: number|null, created_at: Date|string}`
- `buildMemoryExport(rows, total?): {contents, count, total, truncated, empty}`. It sorts newest first and takes the top 500 itself.

**bundle.ts** (reads fs; takes the dist dir as a parameter, so no `process.env`)
- `type RunnerFileInfo = {path, size_bytes}`
- `listRunnerFiles(distDir): Promise<RunnerFileInfo[]>`. Recursive and sorted. Throws 409 `runner_bundle_missing` if the dir is missing or empty, or if `index.js` or `package.json` is absent. It skips symlinks and `.DS_Store`.
- `readRunnerFile(distDir, relPath): Promise<string>`. It accepts either a dist-relative path or `.devdigest/runner/<rel>`. It only reads files that appear in the listing; anything else is a 404 (no traversal).
- `readRunnerFiles(distDir): Promise<(RunnerFileInfo & {contents})[]>`

**assemble.ts** (pure)
- `assembleExport({agent, manifestSlug, skills: {name, body}[], memoryRows, memoryTotal?, runnerFiles: (RunnerFileInfo & {contents?})[], workflow: WorkflowOptions, workflowOverride?}): {files: ExportFile[], warnings}`
- `toPreview(assembled): CiPreview`. Runner contents are null.
- `toCommitFiles(assembled): {path, contents}[]`. It throws if a runner file has no contents. Use it for `commitFiles` and the zip.
- Order is manifest, skills (link order), memory, workflow, then runner (sorted). Preview passes runner files without contents; export uses `readRunnerFiles`.
- `warnings` use the shared codes `provider_not_openrouter`, `memory_truncated` (with `count` = total memory rows) and `memory_empty`.
- The memory file's `note` is `'empty'` or `'newest 500 of N'`.

**ingest.ts** (pure, fflate)
- `checkIngestArtifact({zipBytes, headSha, installationRepo, installationPrNumber?}): {ok:true; artifact: CheckedArtifact; meta: CiRunMeta} | {ok:false; reason:'artifact_rejected'; detail: string}`
- `CheckedArtifact` is `{findings_count, critical, warning, suggestion, cost_usd: number|null, duration_ms: number|null, pr_number}`. Null severity counts become 0, and the artifact's `agent` text is dropped (UI-9).
- `detail` is a fixed internal string for logging only. Do not show it to users.

### Gate results
Multi-agent run, inner loop only; the caller runs the outer loop.
- `./scripts/check.sh server related server/src/modules/ci/{constants,helpers,workflow,manifest,memory-export,bundle,ingest,assemble}.ts` — PASS (104 passed)
- `./scripts/check.sh server typecheck` — PASS (package-wide, so it also covers the other workstreams' files at the time I ran it)
- `./scripts/check.sh server lint <my files and tests>` — PASS
- `./scripts/check.sh server arch` — PASS
- Skills applied: onion-architecture, security, typescript-expert, zod, and fastify-best-practices per backend routing. I did not load fastify-best-practices since no route code is in this workstream.

### Checks beyond the gates
- I printed the generated workflow and confirmed `uses:` pins carry `# v4.x` comments, `path: |-` is a block scalar, and there is no `${{` in any `run:`.
- The sidecar takes the head SHA from `github.event.pull_request.head.sha` via `env:`, not `GITHUB_SHA` (for `pull_request` events `GITHUB_SHA` is the merge commit, which would never equal the run's `head_sha`).
- I tested fflate against a zip with a lying declared size: inflation is capped at the declared size, so there is no zip-bomb path. This is covered in `ingest.test.ts`.

### Self-check
- Diff matches the plan: yes, apart from the deviations below.
- Naming and "Do not touch" rules respected: yes. All files are kebab-case, `*.test.ts` sit next to their subject, and no vendor, migration, lockfile or `agent-runner/` edits.
- i18n keys: n/a (server only).

### Deviations from plan
1. I added `assemble.ts` (and `assemble.test.ts`). The plan said "assemble.ts / extract into helpers" but did not list it in W2a's owned files. It is a new file inside the module and nobody else owns it.
2. `runnerRepoPath` lives in `helpers.ts`, not `bundle.ts`, so `assemble` stays free of fs.
3. `isExpectedWorkflowRun` and `stripWorkflowRef` in `helpers.ts` are extras for the UI-10 origin check in refresh.
4. The workflow adds `timeout-minutes: 15` and `persist-credentials: false` on checkout, which the plan did not mention.
5. `buildManifestYaml` additionally checks that the YAML round-trips `name` and `system_prompt` exactly.
6. `yaml` resolved to 2.9.0, because `package.json` already had `^2.9.0`.

### Handoff note
- W2c must pass `config.agentRunnerDist` (not yet in `platform/config.ts`) into `bundle.ts`.
- It must call `assertValidWorkflowYaml` on the client's `workflow_yaml` before using it as `workflowOverride`.
- It maps the DB memory rows to `MemoryExportRow` (ISO `created_at`) and passes the real total as `memoryTotal`.
- It must reuse `manifest_slug` from an existing installation; otherwise use `slugify(agent.name)`.
- `isTrustedJobUrl` and `prUrl` are the only places that build or validate links; the service should use them when mapping `CiRun`.
- `ARTIFACT_MAX_COMPRESSED_BYTES` is checked inside `checkIngestArtifact`. The adapter (W2b) should also enforce it before buffering.