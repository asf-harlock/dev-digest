## Hand-back 1

## Implementation report: SPEC-11 W3 (client A: hooks, /ci-runs page, GLOBAL nav) — steps 10–11

Workstream size: 2 steps, 2 new component folders (CiRunsView, CiRunsTable). Not too large.

### Files created / changed
- `client/src/lib/hooks/ci.ts` (new) and `client/src/lib/hooks/ci.test.tsx` (new)
- `client/src/lib/hooks/index.ts`: added `export * from "./ci";`
- `client/src/vendor/ui/nav.ts`: added a `GLOBAL` section with only `CI Runs` (`key: "ci-runs"`, icon `Workflow`, `/ci-runs`). `activeKeyFor` in `app-shell/helpers.ts` already mapped `/ci-runs` to `ci-runs`, so nothing else was needed.
- `client/src/app/ci-runs/page.tsx` (thin route with metadata)
- `client/src/app/ci-runs/_components/CiRunsView/`: `CiRunsView.tsx`, `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts`, `CiRunsView.test.tsx`, `helpers.test.ts`
- `client/src/app/ci-runs/_components/CiRunsTable/`: `CiRunsTable.tsx`, `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts`, `helpers.test.ts`
- `client/messages/en/ci.json`: replaced the whole top-level `runs` block with Edit and kept `page.crumb`. `exportWizard`, `ciTab` and the old stale blocks are untouched. JSON parses and has 4 top-level keys.

### Exported hooks (all from `@/lib/hooks/ci`, also via the `@/lib/hooks` barrel)
Signatures match step 10. Types come from `@devdigest/shared`.
- `useCiPreview(agentId: string|null|undefined, input: CiExportInputBody, enabled: boolean): UseQueryResult<CiPreview, ApiError>`
- `useCiPreviewFile(agentId, input: CiExportInputBody, path: string|null, enabled: boolean): UseQueryResult<CiPreviewFileContent, ApiError>`
- `useExportCi(agentId): UseMutationResult<CiExport, ApiError, CiExportInputBody>`
- `useDownloadCiArchive(agentId): UseMutationResult<{blob: Blob; filename: string}, ApiError, CiExportInputBody>`. Errors are `ApiError` with `code`/`status`. It does not save the file, so the caller does the blob download.
- `useAgentCiInstallations(agentId): UseQueryResult<CiInstallation[], ApiError>`
- `useCiInstallations(): UseQueryResult<CiInstallation[], ApiError>` (workspace-wide, for AC-32)
- `useCiRuns(filters: CiRunsQueryInput): UseQueryResult<CiRun[], ApiError>`. Empty or undefined filters are not sent. The contract has no `CiRunsPage`, so it returns `CiRun[]`.
- `useRefreshCi(): UseMutationResult<CiRefreshResult[], ApiError, CiRefreshInputBody>`. Aborts after 60 s.
- `useAutoRefreshCi(installations: readonly CiInstallation[] | undefined): { isRefreshing: boolean; isError: boolean }`. Refreshes installations that were never refreshed or are older than 60 s, once per id per mount, one at a time, stopping at the first failure. W4b can ignore the return value.
- Extras:
  - `ciKeys` (with `installationsAll` and `runsAll` prefixes), `staleInstallationIds`, `archiveFilename`, `CI_REFRESH_TIMEOUT_MS`, `CI_AUTO_REFRESH_AFTER_MS`.
  - **Not done, for W4b:** `useUpdateAgent` lives in `agents.ts`, which I do not own, so the hooks here do not invalidate after a `ci_fail_on` change. W4b must call `qc.invalidateQueries({ queryKey: ciKeys.installationsAll })` itself.

### Route assumptions (the server routes did not exist yet)
- `useCiPreviewFile` calls `GET /agents/:id/ci/preview/file?repo&target&post_as&triggers=<csv>&path`. I took this shape from the prior-art `upstream/full-functionality` routes. W2c should confirm it matches.
- `useRefreshCi` posts `{force?, installation_id?}` to `/ci/refresh` and expects `CiRefreshResult[]`.
- `/ci/runs` and the installation routes are called as in the contract.

### Page behaviour
- **Table:** columns are repository, PR, agent, verdict, findings, cost, duration, run time, job.
- **Verdict and status:** the verdict is an icon plus text badge. A run without a verdict shows a status badge instead, with the failure reason as visible text.
- **Cost and duration:** null renders `—` and 0 renders `$0.00`.
- **Findings:** the total carries a `title` plus a screen-reader-only text with the critical/warning/suggestion counts.
- **Links:** the PR link is built from repo and an integer `pr_number`. The job link renders only for a trusted github.com run URL and uses `rel="noopener noreferrer"` with `target="_blank"`.
- **Truncation:** repo and agent cells truncate with an ellipsis and a `title`.
- **Filters:** repo, agent and status are real `<select>`s with sr-only labels, sent as server query params. Their options come from `useCiInstallations`.
- **Refresh and auto-refresh:** Refresh sends `force:true`. `useAutoRefreshCi` runs on open. A failed refresh shows a stored-results notice with Retry, covering request errors, a 60 s timeout and per-installation `failed` results.
- **States:** a skeleton while loading, an `ErrorState` with retry on query failure, and the "No CI runs yet" empty state (the filters are hidden there). Filtered with no rows shows a "no match" text.

### Gate results (inner loop only; the caller runs the outer loop)
- `./scripts/check.sh client typecheck` — PASS. Earlier it showed 2 errors in W4a's `ExportWizard/index.ts` ("Cannot find module './ExportWizard'"); they were gone on the last run.
- `./scripts/check.sh client lint client/src/app/ci-runs client/src/lib/hooks/ci.ts client/src/lib/hooks/ci.test.tsx client/src/lib/hooks/index.ts` — PASS
- `./scripts/check.sh client arch` — PASS
- `./scripts/check.sh client related <my files and tests>` — PASS (44 tests in 10 files). My own tests are 3 hook tests plus 2 pure-helper tests in `ci.test.tsx`, 4 view tests, and the two `helpers.test.ts` files.

### Self-check
- Diff matches the plan: yes, except for the deviations below.
- Naming and "Do not touch": respected. `vendor/ui/nav.ts` was edited with the user's permission. No other vendor, migration or lockfile was touched, no `git stash`/`checkout`/`reset`/`clean` was run, and nothing outside my file list was edited.
- Skills loaded: frontend-ui-architecture, next-best-practices, react-best-practices, security, typescript-expert, react-testing-library.
- i18n keys: I checked every key the view and table use (static, plus the dynamic ones `runs.table.*`, `runs.verdict.*`, `runs.status.*`, `runs.failure.*`, `runs.stale.reasons.*`) with a node script against `client/messages/en/ci.json`. 53 keys, 0 missing.
- UI traps: the only buttons (Refresh, Retry) are kit `Button`s with `type="button"`, and neither is inside a form. There is no modal, so portal and width do not apply. No `fetch` in components; `fetch` appears only in `lib/hooks/ci.ts` for the zip download.

### Deviations from plan
- **Formatters location.** `formatCost`, `formatDuration`, `prUrl`, `isTrustedJobUrl` and `severityTotals` live in `CiRunsTable/helpers.ts`, not `CiRunsView/helpers.ts`. I split the table into its own component folder to follow the folder-per-component rule. The cost and duration formatting reuses `formatRunCost` and `eval-format`.
- **Tests use `fireEvent`.** `@testing-library/user-event` is not installed in `client`, and I did not add it.
- **Hook toasts.** The hooks add no toasts of their own, because `MutationCache` already toasts failures globally. The plan's "hooks error/toast strings" are therefore the `runs.stale.reasons.*` strings in the view.
- **Old `runs` keys.** `runs.filters.last7Days`, `runs.table.timestamp`, `runs.table.source` and `runs.view` are removed, and the subtitle is rewritten for AC-51. The old `last7Days`/`source` filters came from spec 14 and are not in this spec.

### Handoff note
- **Parity check.** W2c must confirm the preview-file query string and the `/ci/refresh` body match what the hooks send.
- **Manual browser check (step 16a).** Still to do: `/ci-runs` at 1280 px and 768 px. The table has `minWidth: 900` and scrolls horizontally inside its card. Also check the ellipsis, the sidebar GLOBAL section, and the stale notice.
- **Unchecked case.** The `AbortSignal.timeout` abort surfaces as `ApiError{status 0, code network_error, details: DOMException}`. `refreshFailureKey` maps it to the timeout message, but I did not test that in a browser.

---

## Hand-back 2

## Fix mode, round 1

| id | status | evidence |
|---|---|---|
| A1 | fixed | The shared `client/src/lib/ci-format.ts` now holds the only `formatCost` and `isTrustedJobUrl(url, repo)`. Callers are `CiRunsTable/CiRunsTable.tsx:14` and `RunHistory/RunHistory.tsx` (the import, and the call now `isTrustedJobUrl(run.job_url, repo)`). I deleted `RunHistory/helpers.ts`, `RunHistory/helpers.test.ts` and `TRUSTED_JOB_HOST` in `RunHistory/constants.ts`. I removed the old copies from `CiRunsTable/helpers.ts` and `GITHUB_HOST` from its constants. |
| M1 | fixed | `CiRunsTable/constants.ts:48` has `COLUMN_WIDTHS = [13, 9, 17, 18, 9, 8, 9, 11, 6]`, 9 columns in AC-46 order. `CiRunsTable/styles.ts` header: `whiteSpace: "normal"` with `overflowWrap: "anywhere"`, font 10.5px, padding 10px. The relative-time cell now wraps (`s.time`). Truncation with ellipsis and `title` for repo and agent is unchanged. |
| M2 | fixed | `CiRunsTable/styles.ts:8-12`: the scroller `wrap` now has `position: "relative"`. I also gave the CiRunsView filter `<label>`s (which hold an sr-only span) `position: "relative"` in `CiRunsView/styles.ts`. |
| M3 | fixed | `RunHistory/styles.ts`: the `scroll` style now has `position: "relative"`. `InstallationRow` and `CiTab/styles.ts` have no sr-only spans, so they needed nothing. |

**Needs your browser re-measure.** I could not use a browser. Please re-measure these:
- Document `scrollWidth` at 768 px on `/ci-runs`, and on the agent CI tab with an installation selected.
- Header clipping and the "Security Reviewer" ellipsis on `/ci-runs` at 1280 px and at 768 px.
- The column widths are estimates from character-width arithmetic; the "anywhere" wrap is the safety net that prevents overlap.

**Shared module:** `client/src/lib/ci-format.ts` exports `formatCost(costUsd: number | null | undefined): string` and `isTrustedJobUrl(url, repo): url is string`. `formatCost` is built on `formatRunCost`, so the history table now shows `$0.042` where it used to show `$0.04`.

**Tests:**
- `ci-format.test.ts` is new and keeps the spec-ID names: EC-29/EC-37 for `formatCost`, UI-11 for the repo-scoped trust rule.
- `CiRunsTable/helpers.test.ts` keeps UI-12 and the null-duration check.
- Containing-block tests added to `CiRunsView.test.tsx` and `CiTab.test.tsx`. Each asserts that the table's parent scroller has `overflowX: auto` and `position: relative`, with a `position: absolute` sr-only span inside.
- `CiTab.test.tsx` also gets a UI-11 test: a job link to a different repo is not rendered.

**Gates:**
- `./scripts/check.sh client typecheck` — PASS
- `./scripts/check.sh client lint` on the changed files — PASS
- `./scripts/check.sh client arch` — PASS
- `./scripts/check.sh client related …` — PASS (47 tests)
- `./scripts/check.sh client test` — PASS (911 tests)

I did not touch the ExportWizard folder or any server files.