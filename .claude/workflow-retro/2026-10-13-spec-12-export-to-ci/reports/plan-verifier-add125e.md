## Hand-back 1

## Plan verification: Export to CI (SPEC-12), pass 1 of 2

Plan: `~/emdash/worktrees/devdigest-2b9b9360/l07-lab-export-to-ci/.claude/sdd/SPEC-12/plan.md`. Spec: `specs/12-export-to-ci.md`. Diff: `fe3a37a..` working tree plus untracked files.

Status key: **Pass** = file:line evidence in code. "(test)" = a test named with the spec ID also exists and passed in my own run. **Unverified (orch.)** = needs a browser; the orchestrator's measured results are quoted at the end.

### Requirements traceability matrix: plan items

| # | Plan item | Status | Evidence |
|---|---|---|---|
| P0 | Step 0: W0 runner gate (scratch, hard stop) | Pass on orchestrator's record | `.claude/sdd/SPEC-12/state.json` has `w0.verdict: PASS`. I did not re-run the scratch gate. `agent-runner/dist` holds `index.js`, `382.index.js` and `package.json`, matching its notes. |
| P1 | Step 1: contracts changed in both copies | Pass | `eval-ci.ts` in both copies: `CiExportInput` (no `base`, enum `triggers` with `.min(1)`, `workflow_yaml?`), `CiInstallationStatus`, `CiInstallation`, `CiFailureReason`, `CiRun`, `CiPreview*`, `CiRunMeta`, `CiRefreshInput/Result`, `CiRunsQuery` (limit ≤200), `CiErrorCode`. `server/test/ci-contract-parity.test.ts` passes (NFR-4 tests). |
| P2 | Step 2: schema + migration 0026 (generate, then hand-edit) | Pass | `server/src/db/schema/ci.ts`: `workspace_id`, `manifest_slug`, `uniqueIndex(workspace_id, lower(repo))`, run unique key, indexes. `0026_reflective_secret_warriors.sql` adds nullable columns, backfills, then SET NOT NULL, with a duplicate check before the index. Only 0026 and its snapshot are new; `_journal.json` is the only edited migration file. `ci.it.test.ts` migration tests pass. |
| P3 | Step 3: `pnpm add yaml` (lockfile only via pnpm) | Pass (note) | `server/package.json:42` has `yaml ^2.9.0`. The plan said `^2.6.1`; ^2.9.0 satisfies that range. The lockfile diff is 3 lines. |
| P4 | Step 4: constants + helpers | Pass | `constants.ts:11-189` has every literal. `helpers.ts`: `slugify:28`, `uniqueSlugs:43`, `severityBlockers:73`, `deriveVerdict:90`, `deriveRunStatus:103`, `isTrustedJobUrl:120`, `prUrl:134`, `truncateGithubError:148`. |
| P5 | Step 5: workflow, manifest, memory-export, bundle, assemble | Pass | `workflow.ts:59-150` (yaml `Document`, `lineWidth:0`), `manifest.ts:38`, `memory-export.ts:49`, `bundle.ts:58-96`, `assemble.ts:64`. |
| P6 | Step 6: pure ingest | Pass | `ingest.ts:67-168`. Extra entries are filtered without being read, limits apply, and `agent` is dropped. |
| P7 | Step 7: port, adapter, mocks (vendor edit only in server `adapters.ts`) | Pass | `adapters.ts` diff adds `WorkflowRun`, `RunArtifact`, `CommitFilesResult` and three methods. `octokit.ts`: `COMMIT_TIMEOUT=120_000`, `classifyGitHubError`, `readCapped` (16 MiB), manual redirect with no auth header to storage. `mocks.ts` updated. `octokit.test.ts` passes. |
| P8 | Step 8: `ci/repository.ts` + the `skills/repository.ts` filter | Pass | Every query is scoped by `workspaceId` (`repository.ts:146-583`). `skills/repository.ts` diff adds `eq(agentRuns.source,'local')`. |
| P9 | Step 9: service, routes, wiring, config, README | Pass | `service.ts`, `routes.ts:61-138` (8 routes, each starting with `getContext`), `modules/index.ts` (static registration), `config.ts` `agentRunnerDist`, `server/README.md` rows. |
| P10 | Step 10: client hooks `ci.ts` + index export | Pass | `lib/hooks/ci.ts:44-238` has all the planned signatures, a 60 s refresh timeout, and `ci.test.tsx` passes. |
| P11 | Step 11: `/ci-runs` page, nav GLOBAL, formatters | Pass | `ci-runs/page.tsx`, `CiRunsView.tsx`, `CiRunsTable.tsx`. `nav.ts` diff adds the GLOBAL section. `formatCost` and `formatDuration` are in `CiRunsTable/helpers.ts`, not `CiRunsView/helpers.ts` as planned; it is the same code in a sibling folder. |
| P12 | Step 12: ExportWizard behaviour | Pass | `ExportWizard.tsx:59-288`, `ConfigureStep`, `InstallStep`, `PreviewStep`, `ErrorNotice`, `use-focus-trap.ts`. 907 client tests pass. |
| P12b | Step 12: every wizard component folder has `<Name>.tsx`, `<Name>.test.tsx`, `styles.ts`, `constants.ts`, `helpers.ts`, `index.ts` | **Fail** | `_components/TargetStep`, `ConfigureStep`, `InstallStep`, `ConfirmBar`, `ErrorNotice` have only `.tsx`, `styles.ts` and `index.ts`. `PreviewStep` and `StepIndicator` have no `constants.ts` and no test. Tests exist only at the `ExportWizard` level. `client/CLAUDE.md` calls this convention strict. |
| P13 | Step 13: CiTab behaviour, tab in 3 places | Pass | `AgentEditor/constants.ts` adds `ci`. `page.tsx` `VALID_TABS` adds `"ci"`. `AgentEditor.tsx` adds the branch. `agents.json` already had `editor.tabs.ci` (unchanged). `CiTab.tsx`. |
| P13b | Step 13: standard file set for `FailOnControl`, `InstallationRow`, `StatusPill`, `RunHistory` | **Fail** | `FailOnControl` and `InstallationRow` have only `.tsx`, `styles.ts` and `index.ts`. `StatusPill` has no `styles.ts`, `helpers.ts` or test. `RunHistory` has no `RunHistory.test.tsx`; only `helpers.test.ts`. |
| P14 | Step 14: server tests (`service.test.ts`, 3 it files, parity) | Pass | All four files exist. `service.test.ts` has 1548 lines of tests named by spec ID. |
| P15 | Step 15: `scripts/e2e.sh` builds the runner; flow 12 | Unverified | `e2e.sh:44-47,121-134` builds the runner (`bash -n` OK). `12-export-to-ci.flow.json` has the steps up to Install, with no Install click and `/ci-runs` showing "No CI runs yet". I did not run `./scripts/e2e.sh`. The flow does not assert `acme/payments-api` is preselected, which the plan listed. |
| P16 | Step 16: orchestrator manual browser checks | Unverified (orch.) | See the orchestrator evidence below. |
| P17 | Step 17: architecture-reviewer and security-reviewer | Unverified | Not part of this pass. |
| P18 | Constraint: `agent-runner/` untouched | Pass | `git status` and `git diff` show no change under `agent-runner/` or `reviewer-core/`. |
| P19 | Constraint: vendor edits only in the allowed files | Pass | Modified vendor files: both `eval-ci.ts`, server `adapters.ts`, `client/src/vendor/ui/nav.ts`. |
| P20 | Constraint: only migration 0026; no lockfile hand-edit | Pass | `git status` for migrations shows only 0026, its snapshot and `_journal.json`. The lockfile diff is the 3 lines pnpm wrote for `yaml`. |
| P21 | Constraint: `ci` module layering, no cross-module import, no `process.env` | Pass | `server arch` and `server lint` PASS. |
| P22 | Constraint: client `fetch` only in hooks, strings in `ci.json`, tab in 3 places | Pass | `client lint` and `client arch` PASS. `fetch` appears only in `lib/hooks/ci.ts:122`. |

### Requirements traceability matrix: spec ACs

| ID | Status | Evidence |
|---|---|---|
| AC-1 | Pass (test) | `ExportWizard.tsx:89` preselects `activeRepo`. `CiTab.tsx:100` opens it with no `initial`. |
| AC-2 | Pass (test) | `StepIndicator` and `STEPS` in `constants.ts:4`, with `aria-current` and ticks. |
| AC-3 | Pass (test) | `TargetStep.tsx:37-67` shows GitHub Actions with the recommended badge above the selector. |
| AC-4 | Pass (test) | `assemble.ts:72-97` builds the file list; `PreviewStep.tsx:72-88` lists it. |
| AC-5 | Pass (test) | `PreviewStep.tsx:111-134`: textarea for the workflow only, a `pre` for the rest. |
| AC-6 | Pass (test) | `service.ts:172-183` with `PreviewStep.tsx:41`: runner contents are null in the list and fetched on selection. |
| AC-7 | Pass (test) | `ConfigureStep.tsx:36-52` uses `aria-pressed`. `DEFAULT_TRIGGERS` is opened and synchronize (`constants.ts:18`). |
| AC-8 | Pass (test) | `ConfigureStep.tsx:60-75`. |
| AC-9 | Pass (test) | `ConfigureStep.tsx:77-86` with `ci.json` `blockMergeInfo`. |
| AC-10 | Pass (test) | `InstallStep.tsx:74-108`. |
| AC-11 | Pass (test) | `InstallStep.tsx:118-137` (secret reminder, link, GITHUB_TOKEN note). |
| AC-12 | Pass (test) | `service.ts:220-225` and `octokit.ts` `commitFiles` make one commit to `devdigest/ci` from the default branch. |
| AC-13 | Pass (test) | `service.ts:773-779`, title "Add DevDigest CI review". |
| AC-14 | Pass (test) | `InstallStep.tsx:53-58`. |
| AC-15 | Pass (test) | `service.ts:233-247` upserts `pending_pr` with the other fields. |
| AC-16 | Pass (test) | `service.ts:766-770` reuses the open PR. |
| AC-17 | Pass (test) | Only `CI_BRANCH` is ever committed to (`service.ts:221`). |
| AC-18 | Pass (test) | `zip.ts:15-24`, `routes.ts:90-102`. |
| AC-19 | Pass (test) | `service.ts:278-291` writes `manual`. |
| AC-20 | Pass (test) | `service.ts:209-216` takes only `workflow_yaml` and regenerates the rest. |
| AC-21 | Pass (test) | `workflow.ts:68`. |
| AC-22 | Pass (test) | `workflow.ts:74`. |
| AC-23 | Pass (test) | `workflow.ts:63-64`. |
| AC-24 | Pass (test) | `workflow.ts:87-97`. |
| AC-25 | Pass (test) | `workflow.ts:98-107` with `constants.ts:68-70`. |
| AC-26 | Pass (test) | `workflow.ts:108-117`. |
| AC-27 | Pass (test) | `workflow.ts:46-52`. |
| AC-28 | Pass (test) | `manifest.ts:38-67` validates against `AgentManifest`. |
| AC-29 | Pass (code only) | `repository.ts:176-196` (link and skill both enabled, link order). `assemble.ts:65-74` uses `uniqueSlugs`. No test uses the ID, and no DB-backed test seeds a disabled skill or link. This is a test gap. |
| AC-30 | Pass (code only) | `repository.ts:200-219` filters on `scope='repo'` and the repo id. `memory-export.test.ts` covers the JSON line format; no DB-backed test covers the repo filter. |
| AC-31 | Pass (test) | `bundle.ts`, `assemble.ts:87-96`. |
| AC-32 | Pass (test) | `ExportWizard.tsx:90,194` and `TargetStep.tsx:73-78` name the agent and disable Continue. |
| AC-33 | Pass (test) | `service.ts:721-733`; `ci.it` covers the race. |
| AC-34 | Pass (test) | `repository.ts:329-356` updates the existing row; `ci.it` covers it. |
| AC-35 | Pass (test) | `CiTab/helpers.ts:25-32` and the locked repo in `TargetStep.tsx:49-57`. |
| AC-36 | Pass (test) | Tab added in `constants.ts`, `page.tsx` and `AgentEditor.tsx`; `page.test.tsx` and `AgentEditor.test.tsx`. |
| AC-37 | Pass (test); orch. observed | `CiTab.tsx:83-86`, `countActive`. |
| AC-38 | Pass (test); orch. observed | `CiTab.tsx:124-125`, `:100`. |
| AC-39 | Pass (test); orch. observed | `InstallationRow`, `lastRunPerInstallation` (`repository.ts:561`). |
| AC-40 | Pass (test); orch. observed | `RunHistory.tsx:20-23` limit 50. |
| AC-41 | Pass (test); orch. observed | `FailOnControl`, `CiTab.tsx:122`. |
| AC-42 | Pass (test); orch. observed | `CiTab.tsx:43-53` via `useUpdateAgent`. |
| AC-43 | Pass (test); orch. observed | `mappers.ts:41-42`. |
| AC-44 | Pass (test); orch. observed | `CiTab/helpers.ts:35`; `repoChoice ""` is not nullish, so nothing is preselected. |
| AC-45 | Pass (test); orch. observed | `nav.ts` GLOBAL → `/ci-runs`. |
| AC-46 | Pass (test); orch. observed | `CiRunsTable.tsx:17` has the 9 columns in order. `repository.ts:530-558` orders newest first, limit ≤200. |
| AC-47 | Pass (test) | `helpers.ts:90-97` and `service.ts:550-553`. |
| AC-48 | Pass (test) | `CiRunsTable.tsx:79-88`. |
| AC-49 | Pass (test) | `CiRunsTable.tsx:108-121`, trusted URL, `rel="noopener noreferrer"`. |
| AC-50 | Pass (test) | `CiRunsView.tsx:82-112`, `repository.ts:530-550`. |
| AC-51 | Pass (test) | `ci.json` `runs.subtitle`. |
| AC-52 | Pass (test) | `CiRunsView.tsx:47`, `mutate({force:true})` with no installation id. |
| AC-53 | Pass (test) | `useAutoRefreshCi` in `hooks/ci.ts:210-238`; used in `CiRunsView.tsx:31` and `CiTab.tsx:30`. |
| AC-54 | Pass (test) | `service.ts:398-402`. |
| AC-55 | Pass (test) | `service.ts:408-412`. |
| AC-56 | Pass (test) | `service.ts:512-517`, `repository.ts:402-453`. |
| AC-57 | Pass (test) | `service.ts:519-523`, unique key at `ci.ts:88-92`. |
| AC-58 | Pass (test) | `service.ts:526-560`. |
| AC-59 | Pass (test) | `helpers.ts:103-110`. |
| AC-60 | Pass (test) | `repository.ts:469-507`, one transaction, `source='ci'`, `pr_id` null. |
| AC-61 | Pass (test) | `service.ts:481-487`, `repository.ts` `setWhere status='running'`. |
| AC-62 | Pass (test; note) | `service.ts:359-364`. A failed single-installation request (or all failed) is thrown as an HTTP error, so the per-installation counts are not in the response. Partial failures in a workspace-wide refresh are returned per installation. |
| AC-63 | Pass (test) | `service.ts:320-329` reads only the repository. |
| AC-64 | Pass (test) | `skills/repository.ts` diff; `ci-runs.it` "AC-64" tests. |
| AC-65 | Pass (test) | `ci-pr-isolation.it` (3 tests). |

### Edge cases

| ID | Status | Evidence |
|---|---|---|
| EC-1 | Pass (test) | `service.ts:651-655` and `ErrorNotice.tsx` (link to Settings → API Keys). |
| EC-2 | Pass (test) | `octokit.ts` `classifyGitHubError`, message names the permissions (`constants.ts:172-173`). |
| EC-3 | Pass (test) | `bundle.ts:58-70`, `service.ts:210` runs before `container.github()` at `:216`. |
| EC-4 | Pass (test) | `service.ts:646-648`. |
| EC-5 | Pass (test) | `manifest.ts:60-65`; assembly runs before the commit. |
| EC-6 | Pass (test) | `ExportWizard.tsx:198-199` and the contract `.min(1)`. |
| EC-7 | Pass (test) | `assemble.ts:107`, `PreviewStep.tsx:57-66`. |
| EC-8 | Pass (test) | `service.ts:736-749`. |
| EC-9 | Pass (test) | `service.ts:763-781`, retry button in `InstallStep.tsx:113`. |
| EC-10 | Pass (test) | `service.ts:771`, `octokit.ts` tree compare. |
| EC-11 | Pass (test) | `workflow.ts:158-173`; the wizard keeps the edit. |
| EC-12 | Pass (test) | `ExportWizard.tsx:115-124,158-171`. |
| EC-13 | Pass (test) | `ExportWizard.tsx:98-102,172-182`. |
| EC-14 | Pass (test) | `assemble.test.ts:59`. |
| EC-15 | Pass (test) | `helpers.ts:43-55`. |
| EC-16 | Pass (test) | `memory-export.ts:62-66`, `assemble.ts:109`. |
| EC-17 | Pass (test) | `memory-export.ts:59-65`, `assemble.ts:108`. |
| EC-18 | Pass (test) | `ci.ts` FKs (installation cascade on agent delete, run `set null`); `ci.it` EC-18 passes. |
| EC-19 | Pass (test) | `ingest.ts:78-81`. |
| EC-20 | Pass (test) | `ingest.ts:70,80,82-86,92`, `octokit.ts` `readCapped`. |
| EC-21 | Pass (test) | `ingest.ts:144-155`. |
| EC-22 | Pass (test) | `service.ts:599`. |
| EC-23 | Pass (test) | `service.ts:600-601,607-609`. |
| EC-24 | Pass (test) | `service.ts:526-527`. |
| EC-25 | Pass (test) | `service.ts:414-420`, `refreshFailure`. |
| EC-26 | Pass (test) | `octokit.ts` rate-limit mapping, `service.ts:630-640`. |
| EC-27 | Pass (test) | `service.ts:376-379`. |
| EC-28 | Pass (test) | `repository.ts:510-527`, `service.ts:455`. |
| EC-29 | Pass (test) | `CiRunsTable/helpers.ts:8-15`. |
| EC-30 | Pass (test); orch. observed | `CiRunsView.tsx:126-128`. |
| EC-31 | Pass (test) | `CiRunsView.tsx:71-80`, `hooks/ci.ts:178`. |
| EC-32 | Pass (test); orch. observed (layout defects below) | `CiRunsTable.tsx:52,72` have ellipsis, `title`, and sr-only text. |
| EC-33 | Pass (test); orch. observed | `StatusPill` and `last_run` null. |
| EC-34 | Pass (test) | Migration step 2; `ci.it` EC-34 passes. |
| EC-35 | Pass (test) | `ExportWizard.tsx:214` (`disabled={pending}`). |
| EC-36 | Pass (test) | `service.ts:520-523`. |
| EC-37 | Pass (test) | `CiRunsTable/helpers.ts:8-10`. |

### NFR and UI

| ID | Status | Evidence |
|---|---|---|
| NFR-1 | Pass (test) | Every repository query has `workspaceId` (`repository.ts`), and `ci.it` NFR-1 covers it. |
| NFR-2 | Pass (test) | `ci.ts:46-51` unique index; the concurrency test passes. |
| NFR-3 | Pass (test) | `0026_*.sql`; `ci.it` passes. |
| NFR-4 | Pass (test) | `ci-contract-parity.test.ts`. |
| NFR-5 | Pass (test) | `bundle.ts:69` sorts, `zip.ts:13` fixes the date, and the zip determinism test passes. |
| NFR-6 | Pass (test) | `workflow.ts:146` and `manifest.ts:39` use `yaml` serialisation. |
| NFR-7 | Pass (test) | `constants.ts:28-41` pins full commit SHAs. |
| NFR-8 | Pass (test) | `ci.it` "NFR-8" (10 skills, <2 s, runner contents omitted). |
| NFR-9 | Pass (test) | `service.test.ts` "NFR-9": exactly 61 calls and at most 5 downloads in flight. |
| NFR-10 | Pass (test) | `REFRESH_DEADLINE_MS=50_000` (`constants.ts:105`), `service.ts:403,435`. |
| NFR-11 | Pass (test) | No LLM call in `modules/ci`; test "NFR-11". |
| NFR-12 | Pass (test) | `helpers.ts:148-156`, `errors.ts:16-20`; tests pass. |
| NFR-13 | Pass (test) for role, `aria-current`, `aria-pressed`, `aria-live`; browser parts Unverified (orch.) | `ExportWizard.tsx:233`, `ConfigureStep.tsx:42`, `use-focus-trap.ts`. |
| NFR-14 | Unverified (orch.) | `MODAL_MAX_WIDTH` and `useFittedModalWidth` in code, but only a browser can prove it. |
| NFR-15 | Pass (test) | Old strings absent from `client/src` and `client/messages`; tests at `ExportWizard.test.tsx:561` and `CiTab.test.tsx:364`. |
| NFR-16 | Pass (test) | `ci-pr-isolation.it` NFR-16 (2 tests). |
| UI-1 | Pass (test) | `manifest.ts` serialises through `yaml`; agent text is never in a path or command. |
| UI-2 | Pass (code and unit tests) | `helpers.ts:28-55`, `helpers.test.ts:16-25`. No test carries the ID. |
| UI-3 | Pass (test) | Fixed `WORKFLOW_PATH`, `workflow.ts:158-173`. |
| UI-4 | Pass (test) | `repository.ts:146-164`, 404 test. |
| UI-5 | Pass (test) | `memory-export.ts:32-42`. |
| UI-6 | Pass (test) | Enums in the contract, 422 test. |
| UI-7 | Pass (test) | `workflow.ts:87-107`: `github.event.*` appears only in `env:` and the job `if:`, never in `run:`. |
| UI-8 | Pass (test) | `ingest.ts:67-141`. |
| UI-9 | Pass (test) | `ingest.ts:157-167` drops `agent`; `service.ts:494` uses the installation's agent name. |
| UI-10 | Pass (test) | `helpers.ts:172-182`, `service.ts:424-428`. |
| UI-11 | Pass (test) | `helpers.ts:120-131`, `mappers.ts:67`, and a client re-check at `CiRunsTable/helpers.ts:26-36`. |
| UI-12 | Pass (test) | `helpers.ts:134-138`, `CiRunsTable/helpers.ts:18-23`. |
| UI-13 | Pass (test) | `helpers.ts:148-156`; adapter errors use fixed text. |

### Gates re-run (my own runs)
- `./scripts/check.sh server typecheck`, `lint`, `arch`: PASS.
- `./scripts/check.sh server test`: PASS, 1050 tests.
- `./scripts/check.sh client typecheck`, `lint`, `arch`: PASS.
- `./scripts/check.sh client test`: PASS, 907 tests.
- `cd e2e && npm run typecheck`: PASS. `bash -n scripts/e2e.sh`: OK.
- `cd server && pnpm exec vitest run test/ci.it.test.ts test/ci-runs.it.test.ts test/ci-pr-isolation.it.test.ts test/ci-contract-parity.test.ts`: 4 files, 48 tests PASS.
- `cd server && pnpm exec vitest run .it.test` (all Docker suites): 341 passed, 6 failed. The failures are `skills-stats` ×4, `skills` 404 and `onboarding-tour` "POST persists a model tour". All are in the baseline list or its non-deterministic onboarding family. `skills-stats` fails with 422 where 200 was expected, which looks like an unrelated setup problem. I did not re-prove baseline status against the base commit, so this rests on the baseline record.
- `./scripts/e2e.sh` flow 12: not run.

### Orchestrator evidence (not independently verifiable by me)
- Wizard at 1280 and 768 px: Target, Preview, Configure and Install behave per AC-1..11. NFR-13 and NFR-14 numbers (Continue and Install visible, dialog inside the viewport, EC-6 Continue disabled) are on the caller's evidence.
- CI tab: AC-37..44 observed with seeded data. CI Runs page: 9 columns, verdicts, `—` versus `$0.00`, trusted links, filters, empty state, GLOBAL nav.
- Defects the orchestrator reported as still open. Code evidence for causes I could confirm:
  1. "PULL REQUEST" and "DURATION" headers clip. `CiRunsTable/styles.ts:15-25` has `whiteSpace:"nowrap"` headers in a `table-layout:fixed` table with `COLUMN_WIDTHS` of 9% and 8% (`constants.ts:47`).
  2. The page scrolls horizontally at 768 px. `CiRunsTable/styles.ts:5-9` (`wrap`, `overflowX:auto`) has no `position:relative`, while `srOnly` (`:41`) is `position:absolute`, so the sr-only spans escape the scroller. `RunHistory/styles.ts:7-8,34-35` has the same pattern, which matches the CI tab history scrolling the page at 768 px.

### Not covered by the plan (unverified, out of scope for this check)
- `scripts/e2e.sh` also changed `pnpm install` to `pnpm install --frozen-lockfile` in `install_if_needed`. The plan did not ask for it.
- `AC-29` and `AC-30` have no data-backed tests for the enabled/link-order and repo-scope filters.
- Marking the whole `CiRefreshResult` as thrown for single-installation failure is an implementer choice outside any plan text. See AC-62.
- The two reviewers (P17) and `./scripts/e2e.sh` (P15) have not run.

### Verdict
- All 65 ACs, 37 ECs, 16 NFRs and 13 UIs have no Fail. They are Pass, with test evidence except AC-29, AC-30 and UI-2 (code-only) and NFR-13/NFR-14 (browser portion on the orchestrator's evidence). NFR-14 stays Unverified (orch.).
- Plan items: 20 Pass, 2 Fail, 3 Unverified. Fail P12b and P13b: the strict component-folder file set is missing in several new component folders. Unverified: P15 (e2e not run, preselected-repo assertion absent), P16 (orchestrator), P17 (reviewers pending).
- Open items for pass 2: fix the component folder files (P12b, P13b); fix the two orchestrator-reported layout defects (header clipping, sr-only escaping the scroller in `CiRunsTable` and `RunHistory`); optionally add DB-backed tests for AC-29 and AC-30.

### Spec status
- Not ready for `implemented`. No spec ID is Fail, but NFR-14 and the browser part of NFR-13 rest on the orchestrator's measurement, and the open layout defects touch EC-32's visible behaviour at 768 px. I recommend keeping `Status: approved` until pass 2 confirms the defects and plan items P12b and P13b are fixed. I do not edit the spec.

---

## Hand-back 2

## Plan verification: Export to CI (SPEC-12), pass 2 of 2 (delta)

All gates pass and no spec ID is Fail. The two pass-1 Fail rows (P12b, P13b) are accepted by user decision, and one item, NFR-14, still rests on the orchestrator's browser measurement.

### Delta matrix

**Rows that were non-Pass in pass 1**

| # | Item | Pass 1 | Now | Evidence |
|---|---|---|---|---|
| P12b | Wizard component folders lack the standard file set and per-component tests | Fail | **Fail → accepted by user decision (V1 skip)** | `review-round-1.json` finding V1: `decision: skip`, "tests exist at parent level; no empty constants/helpers files". I did not re-check the folders; they are unchanged by that decision. |
| P13b | CiTab component folders lack the standard file set and tests | Fail | **Fail → accepted by user decision (V1 skip)** | Same V1 decision. |
| P15 | Flow 12 and `e2e.sh` (not run) | Unverified | Unverified (carried) | `bash -n scripts/e2e.sh` OK and `cd e2e && npm run typecheck` PASS. I did not run `./scripts/e2e.sh`, and the flow still does not assert the `acme/payments-api` preselection. |
| P16 | Step 16: orchestrator manual browser checks | Unverified (orch.) | **Pass on caller's evidence** | The caller's browser numbers: `/ci-runs` has no clipped headers, `document.scrollWidth` equals the viewport at 768 and 1280 (was 845 at 768), the CI tab with a selected installation measures 768 (was 838), and the wizard fits inside the viewport at both widths. |
| P17 | Step 17: architecture-reviewer and security-reviewer | Unverified | Unverified (carried) | `review-round-1.json` records the triage: fixed B1, B2, B3, S1, M1, M2, M3, A1, A3; skipped A2 and V1. I did not see the reviewers' final Pass/Fail reports, so I do not render an architecture or security verdict. |
| NFR-14 | Continue and Install visible without horizontal scroll at 768 px | Unverified (orch.) | **Pass on caller's evidence** | The caller measured the wizard at 1280 and 768 px: dialog fully inside the viewport, footer buttons visible, no horizontal page scroll. Code side: `MODAL_MAX_WIDTH` with `useFittedModalWidth`. |
| NFR-13 | `aria-*` and `aria-live` (test); browser parts (orch.) | Pass (test) with browser parts Unverified (orch.) | Pass (test); browser parts Pass on caller's evidence | Test evidence unchanged, and `ExportWizard.tsx` now has an extra `disabled` condition. The caller measured `aria-current` and `aria-modal` present. |
| AC-29 / AC-30 / UI-2 | Code-only Pass (pass 1) | Pass (code only) | Pass (code only), carried | The enabled-skill, link-order and repo-scope queries have no DB-backed tests. Not fixed; it was only a test-gap note. |

**Rows whose evidence changed since pass 1, re-checked by me**

| ID | Status | Evidence |
|---|---|---|
| AC-44 (B1) | Pass | `ExportWizard.tsx:77` now has `useState(initial?.repo || null)`, so `""` counts as unset. Tests `ExportWizard.test.tsx:503,515` cover "Add repository" starting on the active repository, unlocked, and leaving Target. |
| EC-6 / B3 | Pass | `ExportWizard.tsx:208` disables Back when `step === STEP_CONFIGURE && triggers.length === 0`; the EC-6 test at `ExportWizard.test.tsx:248` passes. |
| AC-46 / EC-32 (M1, M2) | Pass; layout on caller's evidence | `CiRunsTable/styles.ts:9-11` makes the scroller `position: relative`, so the sr-only spans stay inside. Header cells wrap (`:23`), and `COLUMN_WIDTHS` is now `[13,9,17,18,9,8,9,11,6]` (`constants.ts:48`). Layout numbers: caller's. |
| M3 | Pass; layout on caller's evidence | `RunHistory/styles.ts:9-11` has the same `position: relative` containment. |
| UI-11, EC-29, EC-37 (A1) | Pass | New shared `lib/ci-format.ts` has the repo-scoped `isTrustedJobUrl` and `formatCost`. It is imported by `CiRunsTable.tsx` and `RunHistory.tsx`. The old `RunHistory/helpers.ts` and its test are deleted. `ci-format.test.ts` passes. |
| EC-25 (B2) | Pass | `service.ts:~416-424` swallows `listWorkflowRuns` as zero runs only when the error is `github_permission`, `isGithubNotFound` (`errors.ts:33-40`, `details.status === 404`) and the installation is not `active`. A 403 stays a failure for every status. `octokit.ts:100` raises `{operation, status}`. Tests at `service.test.ts:1319,1336,1351` cover 404 versus 403 for `pending_pr` and `manual`. |
| UI-8 (S1) | Pass | `ingest.ts:47-63,157-163` bounds `pr_number` to 1..2147483647 for both artifact and sidecar. A forged value gives `artifact_rejected` rather than a DB error. |
| AC-62 | Pass | `service.ts:~443-446`: a non-`AppError` during ingest becomes the fixed-text `ingest_failed` (`errors.ts:42-44`, `constants.ts:152,168,185`), so only that installation fails. The per-installation test at `service.test.ts:1404` asserts `inst-b` reports `failure.code === 'ingest_failed'`. Both `CiErrorCode` copies list `ingest_failed` (server `eval-ci.ts:596`, client `:567`), and the parity test passes. The single-installation and all-failed rule that throws instead of returning results is unchanged and documented in `README.md`. |
| EC-26 / NFR-9 / NFR-12 | Pass | `octokit.ts:156-170`: the default `octokit` keeps library throttling. `ciOctokit` fails fast (`onRateLimit` and `onSecondaryRateLimit` return false). It is used only by the six CI paths (`pulls.create` `:385`, `commitFiles` git `:404`, `findOpenPr` `:484`, `listWorkflowRuns` `:523`, `listRunArtifacts` `:550`, `downloadArtifact` `:574`). New `octokit-throttle.test.ts` asserts both clients. The NFR-9 61-call test and the NFR-12 token-scrub tests still pass. |
| EC-28 | Pass | `repository.ts:510-527` and `service.ts:463` are unchanged in behaviour; the `ci-runs.it` EC-28 tests pass. |

Every other row from pass 1 is carried as **Pass (unchanged since verify-1)**: 18 plan rows, 63 ACs, 34 ECs, 15 NFRs and 12 UIs, so 142 rows in all. Of those, the rows touched by the new `ingest_failed` code or the contract copies (NFR-4, NFR-12) re-passed through the parity, server and client suites. No row regressed.

### Gates re-run (my own runs)
- `./scripts/check.sh all`: server typecheck, lint and arch PASS. Server test PASS, 1057 tests. Client typecheck, lint and arch PASS. Client test PASS, 911 tests. Core typecheck PASS, core test PASS, 69 tests.
- `cd e2e && npm run typecheck`: PASS. `bash -n scripts/e2e.sh`: OK.
- `cd server && pnpm exec vitest run test/ci.it.test.ts test/ci-runs.it.test.ts test/ci-pr-isolation.it.test.ts test/ci-contract-parity.test.ts`: 4 files, 48 tests PASS (parity 6, ci-runs 20, pr-isolation 3, ci 19).
- Constraints re-checked: no change under `agent-runner/` or `reviewer-core/`; migration files are only 0026, its snapshot and `_journal.json`; the lockfile change is still the `yaml` entry.
- Full Docker `.it` suite: not re-run by me; I accept the caller's 335 passed / 6 failed, all in the baseline or its onboarding-tour family. `skills-stats` fails with 422 for a reason I judged unrelated in pass 1.
- `./scripts/e2e.sh` flow 12: not run.

### Not covered by the plan (unverified, out of scope for this check)
- Residual layout observation reported by the caller: at 768 px the agents page leaves the editor pane about 214 px wide, so the "Fail CI on" segmented control scrolls inside the pane. It is not a spec AC, and it matches the Config tab's pane width.
- `scripts/e2e.sh` switched `pnpm install` to `--frozen-lockfile`, which the plan did not ask for.
- No DB-backed tests for the AC-29 and AC-30 queries.

### Verdict
- No spec ID is Fail. All 65 ACs, 37 ECs, 16 NFRs and 13 UIs are Pass, with test evidence except AC-29, AC-30 and UI-2 (code-only). Browser-only items (NFR-13 and NFR-14 browser parts, the layout fixes) are Pass on the caller's evidence.
- P12b and P13b are Fail → accepted by user decision (V1 skip), not open defects.
- Unverified: P15 (`./scripts/e2e.sh` not run, no preselected-repo assertion in the flow) and P17 (reviewer reports not seen by me).

### Spec status
- Every spec ID is Pass, with the browser-only items on the orchestrator's measurements. I recommend you set `Status: implemented` in `specs/12-export-to-ci.md`, with these caveats recorded: flow 12 has not been executed, NFR-14 and the layout fixes rest on the orchestrator's Playwright measurements, and the V1 convention skip is a conscious deviation from the plan. I do not edit the spec.