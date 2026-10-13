## Hand-back 1

## Plan verification: Eval Pipeline (SPEC-08), pass 1 of 2

Compared against `13a8392` plus the working tree and untracked files. Pass means I found direct evidence in code or in a test I re-ran. Rows that rely on a test cite it, and the suite was green in my own run.

### Gates re-run (my own runs)
- `./scripts/check.sh server typecheck` PASS.
- `./scripts/check.sh server lint` PASS.
- `./scripts/check.sh server arch` PASS.
- `./scripts/check.sh server test` PASS, 697 tests (hermetic).
- `cd server && pnpm verify:l06` PASS, 6 files and 110 tests. Docker was available, so `test/eval.it.test.ts` ran all 38 tests and none were skipped.
- `cd server && pnpm exec vitest run test/agents-skills.it.test.ts test/agents-versions.it.test.ts test/reviews.it.test.ts test/eval.it.test.ts` PASS, 56 tests. These are the plan's regression tests for the agent-delete transaction and for reviews.
- `cd server && pnpm exec vitest run .it.test` (the full Docker suite) has 5 failures, all in `skills-stats.it.test.ts` (4) and `skills.it.test.ts` (1). The first run showed a third failing file that did not repeat in the second run, so I treat it as a flake. The skills failures are not caused by this diff: `GET /skills/:id/stats` has a required `days` query param (`server/src/modules/skills/routes.ts:66-68`), the tests omit it and get 422, and `src/modules/skills/**` and those tests are unmodified.
- `./scripts/check.sh client typecheck` PASS.
- `./scripts/check.sh client lint` PASS.
- `./scripts/check.sh client arch` PASS.
- `./scripts/check.sh client test` PASS, 556 tests.
- By hand, no adapter or platform file imports `modules/eval`. The only `modules/` import in `platform/container.ts` is the repository wiring, which matches the existing `agentsRepo` and `reviewRepo` pattern.
- By hand, the `ORM_DEBT` list is not modified.

Abbreviations: SVC = `server/src/modules/eval/service.ts`, REPO = `repository.ts`, IT = `server/test/eval.it.test.ts`, C = `client/src`.

### Traceability matrix: plan steps

| # | Item | Status | Evidence |
|---|---|---|---|
| S1 | Contracts rewritten in both vendor copies | Pass | `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts` and the client copies match except for the drifted import line. `server/test/eval-contract-parity.test.ts` is green (5 tests). The old `EvalRun`, `EvalPerTrace`, `EvalCaseInput`, `EvalRunResult` shapes are removed. Run and overview shapes are in `eval-ci.ts` (known fact 1). `EvalRunDetail` has no `progress` field (see AC-58). |
| S2 | `contracts.test.ts` updated | Pass | `server/test/contracts.test.ts`, 14 tests green in `verify:l06`. |
| S3 | Schema pass 1 plus generated migration | Pass | `server/src/db/schema/eval.ts` has all the specified columns, `eval_cases_source_finding_uq`, `eval_runs_one_running_uq` as a partial unique index, and the owner and agent-ran indexes. Migration `0020_eager_cassandra_nova.sql` contains these additions. |
| S4 | Schema pass 2 plus `rows.ts` | Pass | `0021_strong_psynapse.sql` drops `case_id`, `actual_output` and `pass`. `rows.ts` gets `EvalCaseRow` and `EvalRunRow`. Only the two new `.sql` files, two snapshots and the journal changed under `migrations/`; no existing migration was edited. |
| S5 | `skill-render.ts` extracted and used by `run-executor` | Pass | `modules/_shared/skill-render.ts`; `reviews/run-executor.ts:26,267`. The existing `run-executor-*` tests are inside the green 697. |
| S6 | `constants`, `helpers`, `scoring`, `frozen-input`, `prompt-diff`, `skills-diff` | Pass | All files exist with the specified behaviour. `scoring.ts:28-39` uses strict inclusive overlap with no tolerance window. `frozen-input.ts:45-69` is an exact splitter, not `sliceDiff`. The range check reuses `groundFindings` at `:84-106`. |
| S7 | Repository holds all persistence, scoped by workspace | Pass | `repository.ts`. List queries use `summarySelection` and do not read the jsonb columns. `deleteByAgent` takes a `tx`. `pnpm arch` is green. |
| S8 | `executor.ts`: one case, no enrichments | Pass | `executor.ts` passes only the diff, task line, `prDescription`, skills and snapshot to `reviewPullRequest`. Empty diff throws (EC-12). `executor.test.ts` covers it (10 tests). |
| S9 | `service.ts` (a)-(e) | Pass | SVC createFromFinding `:78`, startRun `:208` (detached promise), executeRun `:259`, reapStaleRuns `:332`, compare `:413`. Check order at `:78-92`. |
| S10 | Routes plus module registration | Pass | `routes.ts` has all 11 routes with Zod schemas. `/eval-runs/compare` is registered before `/eval-runs/:id`. `modules/index.ts` registers `eval`. |
| S11 | EC-9 cascade | Pass | `agents/repository.ts` `deleteById` runs in `db.transaction` with `beforeDelete`. `agents/service.ts` passes `evalRepo.deleteByAgent`. `container.ts` has the `evalRepo` getter. IT "EC-9" passes (`:997`). |
| S12 | Boot reap | Pass | `app.ts:88-96` is awaited with the same non-fatal try/catch. IT "EC-14" passes (`:1021`). |
| S13 | `verify:l06` script | Pass | `server/package.json` has the exact file list, and the script ran green. |
| S14 | `hooks/eval.ts` | Pass | `C/lib/hooks/eval.ts`: all hooks present. `useEvalRun` polls and stops, has a 10-minute timeout, a halt on failed poll with `retry()`, and invalidates overview, cases and dashboard. Tests in `eval.test.tsx` (`:58,:106,:124,:163,:182,:193`). Exported from `index.ts`, matching the file's pattern. |
| S15 | `eval-format.ts` plus messages | Pass | `C/lib/eval-format.ts` has `formatPercent`, `formatDeltaPoints` (`round(new·100) − round(old·100)`), `formatCostUsd` and `formatDuration`. `messages/en/eval.json` and `prReview.json` hold the strings. `agents.json` already had `editor.tabs.evals`. |
| S16 | Evals tab | Pass | `AgentEditor/constants.ts` adds the tab after Context, with a branch in `AgentEditor.tsx`. `EvalsTab/` has the header, 4 KPI cards (kit `MetricCard`), the case list, the case modal, the delete dialog, `RunAllEvals` and the dashboard link. `EvalsTab.test.tsx` and `RunAllEvals.test.tsx` cover it. |
| S17 | PR page `FindingCard` | Pass | `FindingCard/_components/EvalCaseButton`, `FindingsPanel.tsx` and `ReviewRunAccordion.tsx` pass `agentId`. Tests: `EvalCaseButton.test.tsx` and `FindingsPanel.test.tsx` `:138-161`. |
| S18 | UI-3/UI-5 escaped text, diff view | Pass | `CaseBody.tsx` reuses the existing `components/diff-viewer`, so no new component was needed. No `dangerouslySetInnerHTML` in any new directory. |
| S19 | Dashboard and nav | Pass | `nav.ts` has one line after Conventions. `app/eval/page.tsx` and `EvalDashboardView` render the cards and recent-runs table. `helpers.test.ts` covers `activeKeyFor` for `/eval` and `/eval/agents/ag1`. |
| S20 | Agent detail | Pass (deviation) | Header, KPIs, trend, runs table, `CompareModal` and `RunDetailModal` all exist. The plan said kit `LineChart`; a custom SVG is used (known fact 3). The behaviour is covered: a null metric breaks the line (`MetricTrend/helpers.ts`). |
| S21 | W5 server tests | Pass | `scoring`, `frozen-input`, `executor`, `prompt-diff`, `skills-diff` and `helpers` tests, `eval-contract-parity.test.ts` and `eval.it.test.ts` (38 tests incl. NFR-13 at ~310 ms) all exist and pass. `routes-smoke.test.ts` needs no change (no-DB routes only). |
| S22 | W6 client tests | **Fail (minor)** | All listed tests exist, but the plan's "a11y: roles, aria-live, ≥24×24 (NFR-7)" has no ≥24×24 assertion. A grep for `toHaveStyle`, `getComputedStyle` and `minHeight` in the new tests finds none. The aria-live and roles tests exist. |

### Traceability matrix: spec acceptance criteria

| ID | Status | Evidence |
|---|---|---|
| AC-1 | Pass | `FindingCard.tsx` renders `EvalCaseButton` after Dismiss, inside the expanded block. `FindingCard.test.tsx:73`. |
| AC-2 | Pass | `service.ts:78-120` sets `must_find` for accepted findings. IT `:400`. |
| AC-3 | Pass | `helpers.ts:56-67`. IT `:436`. |
| AC-4 | Pass | `frozen-input.ts:45-69` and `service.ts:99` store the file-only diff and the PR meta. IT `:400`, `:576`. |
| AC-5 | Pass | `service.ts:105-113` stores severity, category and title in the expectation. Scoring never reads them. |
| AC-6 | Pass | `helpers.ts:35-52`. IT `:452`, `:467`, `helpers.test.ts`. |
| AC-7 | Pass | `source_finding_id` stored, `routes.ts` replies 201. |
| AC-8 | Pass | `EvalCaseButton.tsx` turns into an "In eval set" Link. The hook sets the links cache without a refetch (`eval.test.tsx:163`). |
| AC-9 | Pass | `FindingsPanel.tsx` reads `usePullEvalCaseLinks`. `FindingsPanel.test.tsx:161`. |
| AC-10 | Pass | `AgentEditor/constants.ts` plus `VALID_TABS` in `agents/[id]/page.tsx`. `AgentEditor.test.tsx` was updated. |
| AC-11 | Pass | `EvalCaseList.tsx` shows name, type, `file:lines`, severity and category tag, and the latest result. `repository.ts` `listCases` is newest first. IT `:643`. |
| AC-12 | Pass | `CaseStateLabel` shows icon and text. `scoring.ts:62-85` sets `expected_count` to 1 or 0. `EvalsTab.test.tsx:155`. |
| AC-13 | Pass (note) | Header "{passed} / {scored} passing" is computed from the current case list's `latest_result`, not from the run's `traces_*`. If a case was deleted after the run, the header can differ from the Traces KPI. Test at `EvalsTab.test.tsx:155`. |
| AC-14 | Pass | `CaseBody.tsx` shows the diff, PR title and body, expectation, source link and last result with duration and cost. `EvalsTab.test.tsx:196`. |
| AC-15 | Pass | `CaseNameForm.tsx` sends PATCH and `useRenameEvalCase` invalidates the list. `EvalsTab.test.tsx:196`, IT `:689`. |
| AC-16 | Pass | `DeleteCaseDialog.tsx` names the case. `EvalsTab.test.tsx:242`. |
| AC-17 | Pass | `useDeleteEvalCase` invalidates the case list. `EvalsTab.test.tsx:242`, IT `:723`. |
| AC-18 | Pass | Runs keep their own `case_set` and `case_results`. IT `:723`. |
| AC-19 | Pass | `startRun` replies 202 before the executor starts. IT `:782`. |
| AC-20 | Pass | Snapshot built at `service.ts:208-232` with version, provider, model, strategy, system prompt and ordered skills. IT `:782`. |
| AC-21 | Pass | `caseSet: cases.map(toCaseRef)`. IT `:782`. |
| AC-22 | Pass | `executor.ts`, one case at a time. `executor.test.ts:85-135`. |
| AC-23 | Pass | `saveProgress` per case. IT `:782`. |
| AC-24 | Pass | `finalStatus` in `helpers.ts:214`. IT `:871`, `:884`. |
| AC-25 | Pass | `RunAllEvals.tsx` disables the button while a run is in flight and shows "Running case k of n". `RunAllEvals.test.tsx:86`. |
| AC-26 | Pass | `eval.test.tsx:58` and `RunAllEvals.test.tsx:98`. |
| AC-27 | Pass | `scoring.test.ts:66-107`. |
| AC-28 | Pass | `scoring.test.ts:109`. |
| AC-29 | Pass | `scoring.test.ts:90`, `:121`. |
| AC-30 | Pass | `scoring.test.ts:209`. |
| AC-31 | Pass | `scoring.test.ts:213`. |
| AC-32 | Pass | `scoring.test.ts:218`. |
| AC-33 | Pass | `scoring.test.ts:223`. |
| AC-34 | Pass | `EvalMetrics` carries tp, fp, unlabeled and num/den. `scoring.test.ts:223`. |
| AC-35 | Pass | `EvalKpiCards.tsx` and `buildKpis`. `EvalsTab.test.tsx:155`. |
| AC-36 | Pass | Captions `evalsTab.kpi.recallCaption` and `precisionCaption` match the spec text. |
| AC-37 | Pass (note) | `RunDetailModal` and `CaseResultRow` show everything the AC lists (`RunDetailModal.test.tsx:80`). The dashboard rows go to the agent detail page rather than a modal; this is the plan-adopted reading of AC-54. |
| AC-38 | Pass | `FINISHED_STATUSES` in `service.ts`, and `inArray` in `repository.ts`. |
| AC-39 | Pass | `EvalsTab.tsx` Link. `EvalsTab.test.tsx:155`. |
| AC-40 | Pass | `DetailHeader.tsx` has the back link, name, model badge, "{runs} runs on the {cases}-case set", agent dropdown and Run eval. The breadcrumb is passed through `AppShell`. `EvalAgentDetailView.test.tsx:96`. |
| AC-41 | Pass | `KpiCards.tsx` uses a `GapSparkline` over the last 10 trend points. |
| AC-42 | Pass (note) | `MetricTrend.tsx` draws 3 labelled series with `v{n}` labels. `MAX_X_LABELS = 10` thins the labels with 30 runs, so not every run is labelled. |
| AC-43 | Pass | `AgentRunsTable.tsx`. `AgentRunsTable.test.tsx:73`. |
| AC-44 | Pass | `AgentRunsTable.test.tsx:47`. |
| AC-45 | Pass | `CompareModal.tsx` uses the server's `old` and `new`. `CompareModal.test.tsx:69`. |
| AC-46 | Pass (note) | Common ratios, signed deltas and whole-run cost. `CompareModal.test.tsx:69`. The server returns ratios and the client computes deltas (see AC-60). |
| AC-47 | Pass | `compare.caseCounts`. `CompareModal.test.tsx:69`. |
| AC-48 | Pass (note) | `PromptDiff.tsx` shows a `−`/`+` marker per line and a `v{old}`/`v{new}` legend. The version labels appear in the legend and as sr-only text per line, not visibly on each line. `CompareModal.test.tsx:69`. |
| AC-49 | Pass | `skills-diff.ts`, `CompareModal.tsx` skills section. `skills-diff.test.ts`, IT `:1167`. |
| AC-50 | Pass | `CompareModal.test.tsx:109`. |
| AC-51 | Pass | `nav.ts:36`, `app-shell/helpers.test.ts` new test. |
| AC-52 | Pass | `EvalDashboardView.tsx` title and subtitle. `EvalDashboardView.test.tsx:57`. |
| AC-53 | Pass | `AgentSummaryCard.tsx` shows all listed parts, and the whole card navigates. |
| AC-54 | Pass | `RecentRunsTable.tsx`. `EvalDashboardView.test.tsx:57`. |
| AC-55 | Pass | `listCases` plus IT `:643`. |
| AC-56 | Pass | `getCase`, `source` null when the PR is gone. IT `:672`, `:598`. |
| AC-57 | Pass | `overview()` at `service.ts:349`. IT `:1047`. |
| AC-58 | Pass (deviation) | `EvalRunDetail` returns the snapshot, metrics, `case_results`, `cases_done` and `cases_total`, with no literal `progress: {done,total}`. The contract differs from the spec wording; the intent (progress derivable, used for "Running case k of n") is met. IT `:782`. |
| AC-59 | Pass | `dashboard()`. IT `:1097`. |
| AC-60 | Pass (deviation) | The server returns old/new ratios on common cases, whole-run cost, counts, prompt diff and skill changes, but no deltas. The client computes `round(new·100) − round(old·100)`. The UI shows deltas, so the observable intent is met. IT `:1167`. |
| AC-61 | Pass (deviation) | `{links:[{finding_id, case_id, agent_id}]}` rather than a map. It carries the same information plus `agent_id`, and `FindingRecord` is unchanged. IT `:616`. |

### Traceability matrix: edge cases

| ID | Status | Evidence |
|---|---|---|
| EC-1 | Pass | Server: `service.ts:80`, IT `:505`. Client: `EvalCaseButton.test.tsx:43`. |
| EC-2 | Pass | `service.ts:81`. Client: `EvalCaseButton.test.tsx:54`, `FindingsPanel.test.tsx:153`. |
| EC-3 | Pass | `service.ts:83`, `repository.ts` `insertCase` handles the unique violation. IT `:475`, `:489`. Client `eval.test.tsx:182`. |
| EC-4 | Pass | `extractFileDiff` returns null, giving `no_patch`. `frozen-input.test.ts`, IT `:505`. Message string present. |
| EC-5 | Pass | `groundFindings` range check. `frozen-input.test.ts`, IT `:505`. |
| EC-6 | Pass | Full-file kinds via `groundFindings`. IT `:444`. |
| EC-7 | Pass | IT `:585`. |
| EC-8 | Pass | No FK on `source_finding_id`. IT `:598`. `EvalsTab.test.tsx:231`. |
| EC-9 | Pass | IT `:997`. |
| EC-10 | Pass | IT `:914`. |
| EC-11 | Pass | Server `no_eval_cases` at IT `:771`. Client `RunAllEvals.test.tsx:77`. |
| EC-12 | Pass | `scoring.test.ts:235-264`, IT `:884`, `RunDetailModal.test.tsx:120`. |
| EC-13 | Pass | IT `:871`, `RunDetailModal.test.tsx:130`. |
| EC-14 | Pass | IT `:1021`. |
| EC-15 | Pass | `eval.test.tsx:106`, `RunAllEvals.test.tsx:106`. |
| EC-16 | Pass | `eval.test.tsx:124`, `RunAllEvals.test.tsx:114`. The hook uses `retry: false`, so only the global toast fires. |
| EC-17 | Pass | The run uses the start snapshot and the cases read once. IT `:914`. |
| EC-18 | Pass | `casesForRun` reads once; the outcome keeps the recorded name. By code reading only; IT `:723` covers deletion after the run. |
| EC-19 | Pass | `scoring.test.ts:163-191`, `eval-format.test.ts:17`. |
| EC-20 | Pass | `eval-format.test.ts:37`, `CompareModal.test.tsx:146`. |
| EC-21 | Pass | `scoring.test.ts:308-314`, `eval-format.test.ts:49`. |
| EC-22 | Pass | `EvalsTab.test.tsx:127`. The link target is `"/"`, which redirects to the first repo's PR list (`C/app/page.tsx`). |
| EC-23 | Pass | `EvalsTab.test.tsx:138`, `EvalAgentDetailView.test.tsx:125`. |
| EC-24 | Pass | `EvalDashboardView.test.tsx:98`. |
| EC-25 | Pass | IT `:1214`, `CompareModal.test.tsx:167`. |
| EC-26 | Pass | `CompareModal.test.tsx:121`, IT `:1196`. |
| EC-27 | Pass | `AgentRunsTable.test.tsx:37`. The tooltip is a `title` on the label. |
| EC-28 | Pass | IT `:963`, `EvalAgentDetailView.test.tsx:135`, `AgentSummaryCard` badge. |
| EC-29 | Pass | `title` attributes in `EvalCaseList`, `CaseResultRow`, `AgentSummaryCard`. `RunDetailModal.test.tsx:113`. |
| EC-30 | Pass | `EvalCaseRename` min 1, max 80. IT `:707`. The client form validates before sending. |
| EC-31 | Pass | IT `:1254`. |
| EC-32 | Pass | IT `:689`. |
| EC-33 | Pass | `service.ts:259-300`, IT `:975`. |
| EC-34 | Pass | `service.ts:430-436`. IT `:1214`. |
| EC-35 | Pass | IT `:541`. |
| EC-36 | Pass | `toTrendPoint` and `recallOf` return null. `GapSparkline`, `MetricTrend/helpers.ts`. `EvalDashboardView.test.tsx:110`, IT `:1047`. |
| EC-37 | Pass | Partial unique index `eval_runs_one_running_uq`. IT `:914`. |

### Traceability matrix: NFR and UI

| ID | Status | Evidence |
|---|---|---|
| NFR-1 | Pass | IT `:1320`, `scoring.test.ts:326`. |
| NFR-2 | Pass | `executor.test.ts:75`. A single-file diff is always reviewed single-pass (`reviewer-core/src/review/run.ts:134-139`); `DEFAULT_REVIEW_MAX_RETRIES = 2`. |
| NFR-3 | Pass | `workspace_id` on both tables. All queries scoped in `repository.ts`. IT `:1254`. |
| NFR-4 | Pass | IT `:782`. |
| NFR-5 | Pass | `saveProgress` and `finalizeRun` only update rows with `status = 'running'`. |
| NFR-6 | Pass | A grep for hard-coded text in JSX of the new dirs finds none. `eval.json` and `prReview.json` hold the strings. Note: key `runStatus.interrupted` is unused, and server `error_reason` text is shown as returned. |
| NFR-7 | Unverified | There is evidence for aria-live, roles, icon plus text states, arrows plus sr-only delta text and `minHeight: 24` styles. No test or measurement covers contrast ≥ 4.5:1, visible focus or the ≥ 24×24 targets. |
| NFR-8 | Pass | `eval-format.ts`, `eval-format.test.ts:26`. |
| NFR-9 | Pass | `eval-contract-parity.test.ts` (5 tests); no `.default()` in the eval regions. |
| NFR-10 | Pass | `verify:l06` is green with the 6 files and 110 tests, including the DB test with Docker. |
| NFR-11 | Pass | Migrations 0020 and 0021 were generated; no applied migration was edited. |
| NFR-12 | Pass | `service.ts:208-258` and `LOG` in `constants.ts`. Messages carry the run id, agent id, version, case count, status and duration. No diff, body, prompt or finding text. |
| NFR-13 | Pass | IT `:1369` ran in ~310 ms against the 500 ms budget. |
| NFR-14 | Pass | A grep for `sk_live_`, `ghp_` and `sk-` in the new code and tests finds only `sk_live_xxx`. |
| UI-1 | Pass | `executor.test.ts:121-135`. |
| UI-2 | Pass | `executor.test.ts:121-135`. |
| UI-3 | Pass | `CaseBody.tsx` plus `DiffViewer`; `EvalsTab.test.tsx:196` uses an `<img onerror>` payload. |
| UI-4 | Pass | `executor.ts` keeps only the kept findings. The route response schema `EvalRunDetail` validates `case_results` before return. |
| UI-5 | Pass | `RunDetailModal.test.tsx:105`. |
| UI-6 | Pass | IT `:467`. |
| UI-7 | Pass | Bound parameters through Drizzle. 1-80 enforced. IT `:707`. |
| UI-8 | Pass | `CompareModal.test.tsx:98`. |
| UI-9 | Pass | Same grep as NFR-14. |
| UI-10 | Pass | `IdParams` plus `EvalCompareQuery` uuid. IT `:1304`. |

### Not covered by the plan (unverified, out of scope for this check)
- `specs/.08-eval-pipeline.md.swp` is a stray editor swap file in the untracked set. Do not commit it.
- `server/README.md` route contracts were not updated for the 11 new routes. The root `CLAUDE.md` asks for this when routes are added, but the plan did not list it.
- The 5 failures in `skills-stats.it.test.ts` and `skills.it.test.ts` already exist (missing `days` param, 422). They are not part of this diff.

### Verdict
143 of 144 rows Pass (11 with a noted deviation, listed below). 1 row Fail (minor: plan step 22). 1 Unverified (NFR-7). Nothing is Blocked. All gates pass on my own runs.

Pass with a noted deviation: AC-13, AC-37, AC-42, AC-46, AC-48, AC-58, AC-60, AC-61, S20, plus the contract-placement note on S1. Of these, AC-58, AC-60 and AC-61 are the spec/contract mismatches you described, and none contradicts the AC's observable intent.

### Fail rows and the smallest fix
- **S22 (minor):** the plan's client tests for a11y ≥24×24 (NFR-7) are missing. Fix: add one small test, for example in `AgentRunsTable.test.tsx` and `EvalCaseButton.test.tsx`, asserting that the checkbox, "Compare", "Turn into eval case" and the delete icon button have `minWidth` or `minHeight` ≥ 24 in their inline styles (use `MIN_TARGET_PX` from `app/eval/constants.ts`).

Unverified, not a Fail:
- **NFR-7:** no test covers contrast or focus visibility. If you want it closed, this needs a manual pass or an axe-style check. Either of those, or accepting the style assertions above as the evidence, would close it.

### Spec status
Not ready for `implemented`: NFR-7 is Unverified, and step S22 is a minor Fail.