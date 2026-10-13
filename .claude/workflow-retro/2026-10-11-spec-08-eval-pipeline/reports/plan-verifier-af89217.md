## Hand-back 1

## Plan verification (pass 2 of 2): SPEC-08 Eval Pipeline

Diff checked: `13a8392`..working tree, including untracked files. Plan: `.claude/sdd/SPEC-08/plan.md`. Spec: `specs/08-eval-pipeline.md` (Status: approved).

### Gates re-run (my own runs this session)
- `cd server && pnpm typecheck`: PASS.
- `cd server && pnpm lint`: PASS (no output).
- `cd server && pnpm arch`: PASS, no violations (231 modules, 811 dependencies).
- `cd server && pnpm test`: 883 passed, 5 failed, 78 of 80 files passed.
  - The 5 failures are `skills-stats.it.test.ts` (4 tests) and `skills.it.test.ts` (1 test). Each expects 200 or 404 and gets 422, from the missing `days` query param on `/skills/:id/stats`.
  - They are pre-existing and unrelated, confirmed without `git stash`. `git diff 13a8392 -- server/src/modules/skills server/test/skills-stats.it.test.ts server/test/skills.it.test.ts` is empty, and `git status` shows no skills file touched.
- `cd server && pnpm verify:l06`: PASS, 6 files, 110 tests. `test/eval.it.test.ts` ran 38 tests in about 5 s (not skipped), so Docker was present. This includes NFR-13 (500 ms) and EC-33.
- `cd client && pnpm typecheck`: PASS.
- `cd client && pnpm lint`: 0 errors, 1 warning in `components/safe-markdown/SafeMarkdown.tsx:48`, not in the diff.
- `cd client && pnpm arch`: PASS, no violations (716 modules).
- `cd client && pnpm test`: 564 passed, 100 of 100 files (up from 556 at pass 1).

### Closure of previously non-Pass rows
| Row | Pass 1 | Now | Evidence |
|---|---|---|---|
| S22 (a11y tests for >=24x24) | Fail | **Closed, with a limit** | The 4 new tests assert inline styles only (jsdom has no layout). `AgentRunsTable.test.tsx:93` covers the checkbox label hit area and the version button. `EvalsTab.test.tsx:274` covers delete, the dashboard link and the empty-state link. `EvalCaseButton.test.tsx:89` covers the In eval set link. `EvalDashboardView.test.tsx:141` covers both agent links. Compare, Turn into eval case, Run all evals and Run eval use the shared kit `Button` (`vendor/ui/primitives/Button.tsx:26`, sm padding 5px 9px) and get no min-size assertion. This is a smaller gap than pass 1 and I judge the visible sizes adequate. |
| NFR-7 | Unverified | **Still open (partly Pass)** | Contrast >= 4.5:1 and visible focus cannot be proven by unit tests and nothing measures them. Needs a manual pass or an axe or Lighthouse run. Evidence that exists and is covered: state and delta direction carried by text or icon (`CaseStateLabel`, `RunStatusBadge`, `DeltaText`, `eval-format.ts:47`), aria-live regions (`RunAllEvals.tsx:75`, `DetailHeader.tsx:137`), focus return on modal close (`app/eval/hooks.ts:8`), and the target-size style tests above. |
| B1 (review warning: frozen diff showed header lines in the case modal) | Fail | **Closed** | `CaseBody/helpers.ts:24` `stripDiffHeaders` and `:34` `frozenDiffFile`. `helpers.test.ts` asserts the patch has no `diff --git` or `+++ b/` and counts +/- only from hunk lines. The stored `input_diff` is not modified. |
| AC-13 (header counts from the current case list) | Pass, deviation | Accepted deviation | Not changed since pass 1. |
| AC-37 (dashboard row opens the agent page; per-case modal on the detail page) | Pass, deviation | Accepted deviation | This is the plan's own adopted reading (plan "AC-37 vs AC-54"). `RunDetailModal.test.tsx:80`. |
| AC-42 (x labels thinned) | Pass, deviation | Accepted deviation | `MAX_X_LABELS = 10` (`MetricTrend/constants.ts:10`). |
| AC-46 / AC-60 (server returns old/new ratios; client computes deltas) | Pass, deviation | Accepted deviation | Matches the plan's compare shapes and NQ-2 (`scoring.ts:164`). |
| AC-48 (v-labels in legend and sr-only) | Pass, deviation | Accepted deviation | Not changed. |
| AC-58 (cases_done/cases_total, not progress{done,total}) | Pass, deviation | Accepted deviation | The plan's step 1 itself defines it this way. |
| AC-61 (links array including agent_id, not a map) | Pass, deviation | Accepted deviation | The plan's Q1 decision, since `agent_id` is needed for the AC-8 deep link. `eval.it.test.ts:617`. |
| S1 (shapes in `eval-ci.ts`, not `knowledge.ts`) | Pass, deviation | Accepted deviation | The two vendor copies are identical in the eval regions. `eval-contract-parity.test.ts` passes. |
| S20 (custom SVG trend, not the kit LineChart) | Pass, deviation | Accepted deviation | Needed for EC-36 null gaps. `MetricTrend/helpers.test.ts` and `GapSparkline/helpers.test.ts` pass. |

### Requirements traceability matrix

**Plan steps 1-22**

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Contracts rewritten in both vendor copies; old shapes removed | Pass (S1 deviation) | `test/eval-contract-parity.test.ts` (5 tests), `server/test/contracts.test.ts` (14 tests), typecheck on both sides |
| 2 | `contracts.test.ts` updated | Pass | `verify:l06` run |
| 3 | Schema pass 1 (columns, `eval_cases_source_finding_uq`, `eval_cases_owner_idx`, `eval_runs_agent_ran_idx`, `eval_runs_one_running_uq` partial) | Pass | `server/src/db/schema/eval.ts:48,50,85,87`; migration `0020_eager_cassandra_nova.sql` |
| 4 | Schema pass 2 (drop `case_id`, `actual_output`, `pass`); `rows.ts` updated | Pass | `0021_strong_psynapse.sql`; only two new migrations plus `_journal.json` (generator output); no existing migration edited |
| 5 | `renderSkillBlock` extracted and used by `run-executor.ts` | Pass | `_shared/skill-render.ts`; `run-executor.ts` diff: one import plus one line; existing run-executor tests green |
| 6 | Pure modules: constants, helpers, scoring, frozen-input, prompt-diff, skills-diff | Pass | `modules/eval/*.ts`; `scoring.ts:28-194`; 27 scoring and 16 frozen-input tests |
| 7 | Repository holds all persistence, workspace-scoped, cascade helper, links | Pass | `repository.ts:79-538` (`deleteByAgent` :434, `caseLinks` :304, `reapRunning` :421, `insertRun` :334); `pnpm arch` clean |
| 8 | Executor: parsed diff, `reviewPullRequest`, no enrichments, zero files means errored | Pass | `executor.ts:41-83`; `executor.test.ts` (10 tests) |
| 9 | Service (a)-(e) | Pass | `service.ts:78,138-208,208-340,341-462`; check order at `service.ts:78-95`; detached promise at `:240`; log messages carry no content |
| 10 | Routes (11 routes), `getContext` first, Zod schemas, registered in `modules/index.ts:46` | Pass | `routes.ts:40-133`; `eval.it.test.ts` route tests |
| 11 | EC-9 cascade in one transaction; `evalRepo` getter | Pass | `agents/repository.ts:83-92`, `agents/service.ts:78-82`, `container.ts:114`; `eval.it.test.ts:997` |
| 12 | Boot reap | Pass | `app.ts:88-94`; `eval.it.test.ts:1021` |
| 13 | `verify:l06` script (only the scripts line changed) | Pass | `package.json:17`; run above; no lockfile in the diff |
| 14 | Client hooks, polling hook, 409 handled as a success state | Pass | `lib/hooks/eval.ts:28-391` (`EVAL_RUN_POLL_MS` :275, timeout :278); `eval.test.tsx` (7 tests) |
| 15 | Formatters and i18n keys | Pass | `lib/eval-format.ts:20-111`; `messages/en/eval.json` (+304), `prReview.json` (+17), `agents.json:52` already has `editor.tabs.evals` |
| 16 | Evals tab (tab after Context, KPIs, list, modal, delete dialog, Run all, dashboard link) | Pass | `AgentEditor/constants.ts:16`, `AgentEditor.tsx:30`, `page.tsx:15`; `EvalsTab.test.tsx`, `RunAllEvals.test.tsx` |
| 17 | PR page FindingCard button and states | Pass | `FindingCard.tsx:122`, `FindingsPanel.tsx:42-65`, `EvalCaseButton.test.tsx` |
| 18 | UI-5/UI-3 escaped text; NFR-7 targets | Pass for UI-3/UI-5; targets Pass (see S22) | UI-3 at `EvalsTab.test.tsx:201`, `CaseBody` (shared DiffViewer). Contrast and focus: see NFR-7 |
| 19 | Dashboard page and nav one-liner | Pass | `nav.ts:36` (1 line), `app/eval/page.tsx`, `EvalDashboardView.test.tsx`, `app-shell/helpers.test.ts` |
| 20 | Agent detail (header, KPIs, trend, runs table, run modal, Compare modal) | Pass (S20 deviation) | `EvalAgentDetailView.test.tsx`, `AgentRunsTable.test.tsx`, `CompareModal.test.tsx`, `RunDetailModal.test.tsx` |
| 21 | Server tests (W5) | Pass | scoring, frozen-input, executor, prompt-diff, skills-diff, helpers, parity and `eval.it.test.ts` (38 tests) exist and pass |
| 22 | Client tests (W6), including a11y >= 24x24 | Pass, with the limit stated under S22 | All files listed above pass |

**Acceptance criteria**

| IDs | Status | Evidence |
|---|---|---|
| AC-1, AC-8, AC-9 | Pass | `EvalCaseButton.test.tsx:30,66,72`; `eval.test.tsx:163` |
| AC-2..AC-7 | Pass | `eval.it.test.ts:400-467`, `scoring.ts`, `helpers.ts` (`slugify`, `uniqueCaseName`) |
| AC-10, AC-11, AC-12 | Pass | `EvalsTab.test.tsx:143,160` |
| AC-13 | Pass (deviation, counts from the current case list) | `EvalsTab.test.tsx:160` |
| AC-14..AC-17 | Pass | `EvalsTab.test.tsx:201,247`; `eval.it.test.ts:689,723` |
| AC-18 | Pass | `eval.it.test.ts:723` |
| AC-19..AC-24 | Pass | `eval.it.test.ts:782` (202 first, snapshot, case set, one review per case, metrics) |
| AC-25, AC-26 | Pass | `RunAllEvals.test.tsx:86,98`; `eval.test.tsx:58` |
| AC-27..AC-34 | Pass | `scoring.ts:28-193`, `scoring.test.ts` (27 tests) |
| AC-35, AC-36 | Pass | `EvalsTab.test.tsx:160`, `EvalKpiCards` |
| AC-37 | Pass (adopted reading) | `RunDetailModal.test.tsx:80` |
| AC-38 | Pass | `eval.it.test.ts:1047` |
| AC-39..AC-41 | Pass | `EvalAgentDetailView.test.tsx:96` |
| AC-42 | Pass (thinned labels) | `MetricTrend/helpers.test.ts` |
| AC-43, AC-44 | Pass | `AgentRunsTable.test.tsx:47,73` |
| AC-45..AC-50 | Pass (AC-46 and AC-48 deviations) | `CompareModal.test.tsx:69,109`; `eval.it.test.ts:1167,1196` |
| AC-51 | Pass | `nav.ts:36`, `helpers.test.ts` |
| AC-52..AC-54 | Pass | `EvalDashboardView.test.tsx:57` |
| AC-55, AC-56, AC-57 | Pass | `eval.it.test.ts:643,672,1047` |
| AC-58 | Pass (`cases_done`/`cases_total` shape) | `eval.it.test.ts:782` |
| AC-59 | Pass | `eval.it.test.ts:1097` |
| AC-60 | Pass (client computes deltas) | `eval.it.test.ts:1167` |
| AC-61 | Pass (array with `agent_id`) | `eval.it.test.ts:617` |

**Edge cases**

| IDs | Status | Evidence |
|---|---|---|
| EC-1..EC-8 | Pass | `eval.it.test.ts:444-615`; `EvalCaseButton.test.tsx:43,54,77` |
| EC-9 | Pass | `eval.it.test.ts:997` |
| EC-10, EC-37 | Pass | `eval.it.test.ts:914` with `eval_runs_one_running_uq` |
| EC-11 | Pass | `eval.it.test.ts:771`, `RunAllEvals.test.tsx:77` |
| EC-12, EC-13 | Pass | `eval.it.test.ts:871,884`; `RunDetailModal.test.tsx:120,130` |
| EC-14 | Pass | `eval.it.test.ts:1021` |
| EC-15, EC-16 | Pass | `eval.test.tsx:106,124`; `RunAllEvals.test.tsx:106,114` |
| EC-17, EC-18 | Pass | `eval.it.test.ts:914` (snapshot at start). EC-18 is covered by `eval.it.test.ts:723` (delete leaves past results) and by `casesForRun` reading the inputs up front (`service.ts:208`). Pass 1 judged this sufficient; I did not find a dedicated mid-run-delete test. |
| EC-19, EC-20, EC-21 | Pass | `scoring.test.ts`, `eval-format.test.ts:17-49`, `CompareModal.test.tsx:146` |
| EC-22, EC-23, EC-24 | Pass | `EvalsTab.test.tsx:132,143`; `EvalDashboardView.test.tsx:98` |
| EC-25, EC-26, EC-34 | Pass | `eval.it.test.ts:1214,1196`; `CompareModal.test.tsx:121,167` |
| EC-27 | Pass | `AgentRunsTable.test.tsx:37` |
| EC-28 | Pass | `eval.it.test.ts:963`; `EvalAgentDetailView.test.tsx:135` |
| EC-29 | Pass | `RunDetailModal.test.tsx:113` |
| EC-30, EC-32 | Pass | `eval.it.test.ts:689,707` |
| EC-31 | Pass | `eval.it.test.ts:1254` |
| EC-33 | Pass | `eval.it.test.ts:975` |
| EC-35 | Pass | `eval.it.test.ts:541` |
| EC-36 | Pass | `EvalDashboardView.test.tsx:110`; `GapSparkline/helpers.test.ts`; `MetricTrend/helpers.test.ts` |

**Non-functional requirements**

| NFR | Status | Evidence |
|---|---|---|
| NFR-1 | Pass | `eval.it.test.ts:1321` |
| NFR-2 | Pass | `eval.it.test.ts:782`; `executor.test.ts` |
| NFR-3 | Pass | `eval.it.test.ts:1254`; every handler starts with `getContext` (`routes.ts:44-133`) |
| NFR-4 | Pass | `eval.it.test.ts:782` (no writes to review tables) |
| NFR-5 | Unverified (carried from pass 1) | The immutability of snapshot, case set and results after finish has no dedicated assertion. The only run-update paths are `saveProgress` and `finalizeRun`, guarded by `isRunning`. I did not prove this by test. |
| NFR-6 | Pass | `EvalsTab.test.tsx:267` (no missing intl keys); strings in `eval.json` and `prReview.json` |
| NFR-7 | **Partial: Unverified for contrast and focus** | See the closure table |
| NFR-8 | Pass | `eval-format.test.ts:26` |
| NFR-9 | Pass | `eval-contract-parity.test.ts`; client uses types only |
| NFR-10 | Pass | `verify:l06` run, `eval.it` ran |
| NFR-11 | Pass | migrations 0020 and 0021 generated, no edits to existing ones |
| NFR-12 | Pass | `service.ts` log calls carry ids, version, count, status and duration only (`constants.ts` `LOG`) |
| NFR-13 | Pass | `eval.it.test.ts:1369` ran and passed |
| NFR-14 | Pass | Fixtures use placeholder secrets (pass 1 check, not re-grepped) |

**Untrusted inputs**

| UI | Status | Evidence |
|---|---|---|
| UI-1, UI-2 | Pass | `executor.ts:56-65` (body as `prDescription`, title only in the task line); `executor.test.ts` |
| UI-3 | Pass | `EvalsTab.test.tsx:201`; `CaseBody/helpers.ts`; diff drawn by the shared DiffViewer as escaped text |
| UI-4 | Pass | `executor.ts:67-75` (kept findings only); response schema on the routes |
| UI-5 | Pass | `RunDetailModal.test.tsx:105` |
| UI-6, UI-7 | Pass | `eval.it.test.ts:467,707` |
| UI-8 | Pass | `CompareModal.test.tsx:98` |
| UI-9 | Pass | fixtures use placeholders |
| UI-10 | Pass | `eval.it.test.ts:1304` |

Method note: for ACs and ECs I re-ran the gates and spot-read the key server and client code in this pass. Row-level evidence is mostly the named passing tests plus the pass-1 matrix. I did not re-read every client component line by line.

### Non-Pass rows with the smallest fix
- **NFR-7 contrast and focus (Unverified).** Run a manual keyboard and contrast pass, or an axe check, on `/eval`, `/eval/agents/:id` and the Evals tab, or record it as an accepted manual item. No code fix is proposed.
- **NFR-5 (Unverified).** Optional. Add an it-test that a finished run's `snapshot`, `case_set` and `case_results` are unchanged after a later case delete or agent edit. `eval.it.test.ts:723` already covers the delete half for results and metrics.
- **S22 residual.** Optional. Add min-size assertions for the kit buttons (Compare, Turn into eval case, Run all evals, Run eval). The sizes are inherent to the kit.

### Not covered by the plan (out of scope for this check)
- `specs/.08-eval-pipeline.md.swp` is a stray editor swap file (untracked). Delete it, do not commit it.
- `server/README.md` has no entries for the 11 new routes (`grep -c eval-runs` returns 0). Root `CLAUDE.md` says to read it when adding routes, so updating it is worthwhile but no plan step requires it.
- `specs/eval-pipeline.md` (the hand-in copy) is untracked and byte-identical to `specs/08-eval-pipeline.md`, as the plan said the main session would make it.
- The hand-in experiment (at least 8 cases, Compare screenshot) is manual and outside the code.

### Verdict
All gates pass except the 5 unrelated pre-existing skills failures. All plan steps and spec IDs are Pass or Pass with a noted deviation accepted by the plan, except NFR-7 (contrast and focus cannot be proven by tests, and no measurement was done) and NFR-5 (Unverified, no dedicated assertion). S22 and B1 are closed.

### Spec status
Recommendation: I would not mark `Status: implemented` until NFR-7 contrast and focus has a manual check and the user explicitly accepts NFR-5. If the user accepts both as manual or implicit, every other spec ID is Pass and `specs/08-eval-pipeline.md` can then be set to `implemented`. I never edit the spec myself.