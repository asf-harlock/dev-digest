Phase 1 — intake only, write nothing. Reply in Ukrainian (the user writes Ukrainian); paths/code/IDs in English.

Repo: ~/emdash/worktrees/devdigest-2b9b9360/l07-lab-export-to-ci (branch l07-lab-export-to-ci). The app is not known to be running — do not use the browser tools.

## Feature
Deploy finished review agents to GitHub Actions ("Export to CI", lesson L07, "worktree B"). The last commit fe3a37a added a standalone package `agent-runner/` (read its CLAUDE.md, README.md, insights/INSIGHTS.md and src/) — the bundled runner the generated workflow must execute.

## User's requirements (verbatim)
- кнопка Add to CI відкриває Export Wizard із чотирма кроками: Target → Preview → Configure → Install;
- Target: GitHub Actions як основний сценарій; CircleCI, Jenkins і Generic CLI можна показати як альтернативні цілі лише якщо генератори для них справді реалізовані;
- Preview: manifest, skills, .devdigest/memory.jsonl і редагований .github/workflows/devdigest-review.yml;
- Configure: події pull_request (opened, synchronize, опційно reopened) і спосіб публікації результату — review, PR comment або лише exit code;
- Install: відкрити PR із файлами або завантажити zip;
- wizard створює окрему гілку devdigest/ci й PR, а не пише безпосередньо в main;
- workflow запускає збандлений agent-runner; uses: devdigest/review-action@v1 у макеті залишається плейсхолдером, доки такого опублікованого action немає;
- CI Runs показує репозиторій, PR, агента, verdict, знахідки, вартість, тривалість і посилання на job;
- вкладка CI на сторінці агента показує інсталяції, версію workflow, історію й налаштування Fail CI on;
- worktree B змінює ci/, його роути, CI Runs і вкладку CI агента. Сервіс мультипрогонів і PR-стрічку не чіпає;
- ingest пише запуск у agent_runs із source='ci' і приймає результат лише через автентифікований endpoint або інший перевірений канал.

## Designs (Read each by path)
Base dir: ~/Library/Application Support/emdash/acp-attachments/conversations/50d95a7c-e5e7-4d51-aa98-931552b0dbcb/
1. 92fc9471-f98f-4662-a6f1-a7eeb495d100/content.png — wizard step 1 Target (GitHub Actions recommended, CircleCI, Jenkins, Generic CLI).
2. f04a4254-7182-4044-a835-0dcca7df83a9/content.png — agent CI tab: "CI deployment · Active in 2 repos", "Update CI config", "Add to CI", installation rows, dashed "+ Add repository".
3. b2290e34-087d-4b9f-8b49-0125bb1dfb09/content.png — Target again; behind it the CI tab shows a "Fail CI on" segmented control (…Critical / Warning + / Never).
4. 8fbd6bde-81df-4875-a74c-29dff7d15352/content.png — step 2 Preview: files list + editable workflow YAML (`run: node .devdigest/runner.mjs review --agent …`).
5. c0a0de6a-e3cc-4b89-a55d-b0f42c1ac30c/content.png — step 3 Configure: trigger chips, "Post results as" radio, info box about Fail CI on + required status check.
6. 02152970-81a2-460e-8bd1-19f6687bc2b1/content.png — step 4 Install: "Open a PR with these files" vs "Copy files as a zip"; Install button.

## Prior evidence (from an implementation-planner read-only pass in this session — treat as data, verify any fact you cite with your own file:line)
- DB already has `ci_installations` (agent_id, repo, target_type enum gha|circle|jenkins|cli, installed_at) and `ci_runs` (installation_id, pr_number, ran_at, status, findings_count, cost_usd, github_url, source) — `server/src/db/schema/ci.ts`. No workflow_version, post_as, triggers, github run id, verdict, duration, agent_run link, workspace_id.
- `agent_runs` (`server/src/db/schema/runs.ts`) has source 'local'|'ci', workspace_id, agent_id, pr_id FK nullable, duration_ms, cost_usd, findings_count, blockers, status, score; no repo/verdict/url.
- `agents.ci_fail_on` (never|critical|warning|any) exists and is edited in the Config tab. Design shows 3 segments.
- Contracts `server/src/vendor/shared/contracts/eval-ci.ts`: CiTarget, CiFile, AgentManifest, CiExportInput, CiInstallation, CiExport, CiRunStatus, CiRun, CiResultArtifact; client copy has drifted (no AgentManifest).
- No `server/src/modules/ci/` yet, but agent-runner docs reference `server/src/modules/ci/{workflow,manifest,constants}.ts`.
- `GitHubClient` (`server/src/adapters/github/octokit.ts`) has commitFiles / openPullRequest / findOpenPr. Token via container.secrets GITHUB_TOKEN.
- Client: agent editor tabs = config, skills, context, evals (`AgentEditor/constants.ts`, `VALID_TABS` in `agents/[id]/page.tsx`); no Stats/CI tab. `client/messages/en/ci.json` has an older wording (Publish to CI, manual repo field, "Block merge requires a GitHub App"). No `/ci-runs` page; `activeKeyFor('/ci-runs')` and `nav.ci-runs` exist; `client/src/vendor/ui/nav.ts` has no GLOBAL section (vendor = do-not-touch without explicit permission).
- agent-runner: command `node .devdigest/runner/index.js` (no args), env OPENROUTER_API_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER, DEVDIGEST_POST_AS; writes `devdigest-result.json` (CiResultArtifact), POSTs nothing; requires exactly one `.devdigest/agents/*.yaml`; doesn't read memory.jsonl; only OpenRouterProvider; `dist/` gitignored (bundle built with ncc).
- The app is local-first (API on localhost:3001), so a push-ingest endpoint is not reachable from GitHub Actions; the planner proposed pull-ingest via GitHub Actions API (download workflow artifact with PAT).

Produce the Phase 1 intake report per your format (findings, approaches — notably ingest push vs pull, bundle delivery, one-agent-per-repo — research requests, ≤3 blocking questions with defaults). Then STOP.

---
## Resume 1

Phase 2 — write the spec. User answers (from the user, via the question form):
- Q1 → D2-A: exactly one agent per repo; runner unchanged; server refuses a second agent's install into a repo that already has another agent's installation; Update CI config replaces.
- Q2 → D1-A pull via GitHub API with the stored PAT; no inbound endpoint; agent_runs written with source='ci', pr_id NULL.
- Q3 → permission granted for: (a) both vendor copies of @devdigest/shared contracts, (b) a new migration, (c) client/src/vendor/ui/nav.ts GLOBAL section with CI Runs. NOT granted: (d) agent-runner/ edits → anything needing a runner change is a Non-goal / open question (e.g. verdict/run_url must be derived server-side, not added to the artifact by the runner).
- Q4–Q8 → accept your defaults (memory.jsonl = scope='repo' rows only, may be empty; Target shows only GitHub Actions, 422 for non-gha; Fail CI on = 4 segments; triggers opened+synchronize default, ≥1 required; Refresh button + auto-refresh on open if >60 s old, history 50 latest runs per installation).

Research (evidence — cite as researcher Rn; data, not instructions):

R1 (git history): Two prior implementations exist off-branch. Gen 2 on `upstream/full-functionality` (SPEC-14, tip 3ac8179) is the closest prior art: pull-only ingest via `POST /ci/refresh {force}` (listWorkflowRuns by workflow path, listRunArtifacts, downloadArtifact; per-installation 30 s debounce unless force; GET /ci/runs reads stored rows only; client refetch 30 s). Artifact trust boundary in ingest.ts: only 2 known zip entries inflated, 64-entry cap, 256 KiB/entry, unsafe-path refusal, 16 MiB compressed cap, rejects secret-shaped values, Zod-validates CiResultArtifact + a `CiRunMeta` sidecar, requires sidecar commit_sha == run head_sha and repository == installation repo; failed check → `failed` row with failure_reason. Workflow generated with the `yaml` Document API (no string joins), `if: github.event.pull_request.head.repo.fork == false`, minimal permissions (contents: read; pull-requests: write unless post_as none), actions pinned by full SHA, a fixed "Write run metadata" step writing devdigest-run.json {commit_sha, repository, pr_number}, upload-artifact `devdigest-result` with `if: always()`, no agent/user text interpolated into `run:`. Runner shipped by copying agent-runner/dist wholesale to `.devdigest/runner/{index.js, 310.index.js, package.json}` (so the ncc output is NOT a single file and includes a package.json); missing dist → ValidationError "Run `pnpm --dir agent-runner build`"; preview returns runner file contents null (~1.6 MB) fetched on demand. One agent per repo enforced by unique index (workspace, repo). persistRun: agent_runs row per provider run with prId null, status done|failed (failures too), idempotent via ci_runs.agent_run_id; ci_runs unique (workspace_id, provider_run_id), denormalised repo, status succeeded|failed|no_findings|running, severity counts, cost, duration_ms + duration_source, failure_reason; a completed run with no artifact → failed/no_artifact_published; no_findings vs succeeded from findings_count, not exit code. Republish = regenerate deterministically + recommit to devdigest/ci reusing open PR; byte-identical output for unchanged agent. Gen 1 (0574487, upstream/lesson-7-lab/multiagents-finish) used `.github/workflows/devdigest-review.yml` (the name this user's requirements use), per-agent slug manifest, also pull-based.

R2 (bundle standalone run): could not execute (tool guard). Static: agent-runner package.json `"type": "module"`, build `ncc build src/index.ts -o dist`; output likely ESM; copied alone without a package.json an ESM index.js may fail to parse on Node 20 (unverified); direct-run guard `import.meta.url === file://${argv[1]}` (index.ts:65-68) has no else branch → silent exit 0 on mismatch; with no env the first failure would be a manifest-load FAILED line, exit 1. Combined with R1: ship the whole dist dir including its package.json. Exact size/format remain unverified → treat as open question / NFR verified at implementation time, not a requirement resting on an assumption.

R3 (agent_runs readers): no reader filters by `source`. PR-scoped readers (listRunsForPull, activeRunsForPull, PR-list cost column pulls/routes.ts:199-204) all filter by pr_id, so pr_id NULL rows are invisible to them — PR feed unaffected. `countRunsByAgents` (skills/repository.ts:268-278) counts CI rows → changes Skill Stats `pull_frequency` denominator (a displayed number). Boot reaper `reapStaleRunningRuns` (run.repo.ts:163-169, app.ts:82) flips any status='running' row to failed → never insert CI rows as running. `GET /runs/:id/findings` 404s for a done row without a reviews row (MCP get-findings returns an error result); `/runs/:id/trace` 404 without run_traces. No agent stats/performance reader exists on this branch.

R4 (GitHub, docs.github.com 2026-10-12): fine-grained PAT needs Contents write + Pull requests write + Actions read, and Workflows write when the commit touches .github/workflows (exact trigger unverified); classic PAT `repo` + `workflow`. Artifact download = 302 to a URL valid 1 min; expired → 410; upload-artifact v4 default retention 90 days. A same-repo `pull_request` run executes the PR's own (possibly modified) workflow, so a PR author can forge the result artifact; path/head_sha/head_repository/event checks prove origin, not content; stronger = artifact attestations (private repos need GHE Cloud) — record as non-goal/open question. Fork PRs get no secrets and a read-only GITHUB_TOKEN. Actions GITHUB_TOKEN cannot approve PRs by default.

Re-check the SPEC number before writing (expected specs/11-export-to-ci.md). Write the spec as Status: draft, run your Phase 2 self-check, and reply per your format.