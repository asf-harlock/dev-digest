## Hand-back 1

## W6 report: e2e build step and flow 12

**Files changed** (only the two I own):
- `~/emdash/worktrees/devdigest-2b9b9360/l07-lab-export-to-ci/scripts/e2e.sh`
- `~/emdash/worktrees/devdigest-2b9b9360/l07-lab-export-to-ci/e2e/specs/12-export-to-ci.flow.json` (new)

**`scripts/e2e.sh`**
- It now exports `AGENT_RUNNER_DIST` (default `$ROOT/agent-runner/dist`, overridable) before the API starts, so the build and the server read the same path.
- It checks that `npm` exists.
- `install_if_needed` now runs `pnpm install --frozen-lockfile`; this was plain `pnpm install` before. It covers `server` and `client`.
- After the reviewer-core install and before migrate/seed, it runs `npm ci` in `agent-runner` if `node_modules` is missing, then `npm run build`.
- It fails with a clear message if `$AGENT_RUNNER_DIST/index.js` is missing or empty after the build.
- Dependency order is `server` (pnpm), then `reviewer-core` (npm), then `agent-runner` (npm), as ncc needs. No lockfile changed (`git status` shows none).
- The build runs on every run, since `dist` is gitignored via `agent-runner/.gitignore`.

**Flow 12.**
- It runs `/agents`, then Security Reviewer, then the CI tab (found with `find role button --name CI --exact`).
- On the empty CI tab it checks "Not deployed to CI yet" and "Fail CI on".
- It presses "Add to CI" and walks the wizard Target, Preview, Configure, Install.
- Target checks "Target repository" and "GitHub Actions".
- Preview checks "FILES TO CREATE", `.github/workflows/devdigest-review.yml`, `.devdigest/agents/` and `.devdigest/runner/index.js`.
- Configure checks `pull_request:opened`, "Post results as", "GitHub review" and "Fail CI on".
- Install checks "Open a PR with these files" and `OPENROUTER_API_KEY`.
- It never clicks Install. It then opens `/ci-runs` and waits for "No CI runs yet".
- "Add repository" is not in the flow: `CiTab.tsx` renders it only when installations already exist. In the empty state only "Add to CI" is shown.

**Gates**
- `bash -n scripts/e2e.sh`: PASS.
- `cd e2e && npm run typecheck`: PASS. `node_modules` was missing, so I ran `npm ci`; the lockfile is unchanged.
- The flow JSON parses.
- As an extra check I ran `cd agent-runner && npm ci && npm run build` by hand. It works now: `dist/index.js` is 1.5 MB and `dist/382.index.js` was also produced.
- I did not run the full `./scripts/e2e.sh`. It needs Docker and the W2c routes, which are still in progress.

**What W2c's server must satisfy**
- `POST /agents/:id/ci/preview` works with no `GITHUB_TOKEN` stored and makes no GitHub call. The plan says `runner_bundle_missing` is raised before any GitHub call. The flow also needs the repo to be a seeded connected repo (`acme/payments-api`).
- The preview works when that repo has no memory and no clone. It should return only the `memory_empty` warning, which does not block Continue.
- The preview's file list contains the paths above. The runner file comes without contents (`listRunnerFiles`).
- `config.agentRunnerDist` reads `AGENT_RUNNER_DIST` as an absolute path.
- `GET /agents/:id/ci/installations` returns `[]` on a fresh DB. Opening the CI tab must not need GitHub when there are no installations (`useAutoRefreshCi` on an empty list).
- `GET /ci/runs` returns `[]`, and the client shows "No CI runs yet".

**Deviations and notes**
- `--frozen-lockfile` is new for `server` and `client`. It is stricter than before. If lockfile drift in the working tree breaks it, drop the flag.
- I did not edit `e2e/README.md`. Its coverage table stops at flow 09, and flow 11 is also missing. The caller or a docs step may want to add row 12.
- The flow has not been run in a browser. The selectors are checked against the component source: `find role button --name … --exact` for the tab and the buttons, and `wait --text` on strings that are not CSS-uppercased. "FILES TO CREATE" is literal uppercase in the i18n source.
- The Target step does not wait for the repo name, because it sits in a native select value. The flow does `wait --load networkidle` so Continue is enabled. If the flow flakes there, that step is the first suspect.