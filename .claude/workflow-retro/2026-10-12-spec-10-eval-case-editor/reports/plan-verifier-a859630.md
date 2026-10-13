## Hand-back 1

## Plan verification: SPEC-10 Phase B (B1-B20) plus the Phase A rows that lacked tests (pass 1 of 2)

I could not save `verify-3.md`. I have no Write/Edit tool, and my instructions forbid report files, so please persist this message yourself.

### Verdict
- Phase B has 1 Fail (a partial one), 1 Unverified, and 1 row that is Pass only on your word.
- Every other row in B1-B18 and in the Phase A catch-up set is Pass.
- Non-Pass rows:
  - **Fail (partial): EC-23 / EC-24 / AC-42 inside the Case Editor modal.** The timeout sentence "The eval run is still in progress - reload…" and the poll-failure **Retry** are rendered only by `CaseRunStatus` on the two Evals tabs.
    - `rg timedOut|pollFailed|retry` in `client/src/components/eval-case-editor` returns only `use-case-run.ts:100-102` and `CaseRunStatus.tsx`. `EditorModal.tsx` never reads them.
    - When the modal is opened from the finding card on the PR page with Run on save, no tab sits behind it. A timeout or a failed poll then shows no message and no Retry, and the banner stays "Running…".
    - From a tab, the sentence is rendered behind the modal overlay and is not a live region.
    - Tested only on the tabs (`EvalsTab.run.test.tsx` EC-23 and EC-24, `eval-case-run.test.tsx`, `CaseRunStatus.test.tsx`). `CaseEditor.run.test.tsx` has no EC-23/EC-24 test.
    - Severity is low to medium; no data is at risk. The fix is to render `CaseRunStatus` or equivalent in the modal's banner slot.
  - **B19 Unverified.** No Phase B architecture-reviewer or security-reviewer report exists. `.claude/sdd/SPEC-10/review-round-1.json` and `review-round-2.json` are dated 12:10-12:12, before the Phase A commit at 12:15, and are Phase A reports. I gave no architecture or security verdict of my own.
  - **B20 and NFR-11 (layout), AC-23/24, EC-11: Pass on your report, not my evidence.** I did not use the browser.
    - Your 1280×720, 768×600 and 700×600 observations are taken as given.
    - The width fix is `client/src/lib/modal-width.ts`. `CaseEditor.test.tsx` has a unit test that the width is 1080, 712, 644 and 319 px at viewports of 1280, 768, 700 and 375.
    - The case run itself was not exercised in a browser (as you said). The runtime banner, polling and Run-on-save rows are Pass by automated tests only.
  - **NFR-8, literal reading.** The Expected-output parser and row-result-text tests are client tests and cannot be in `verify:l06`, which is a server vitest command. This is the reading the plan's risks section asked the verifier to accept. I accept it. The spec wording could still be tidied by `spec-creator`.
  - **Minor, not a Fail: two assertions edited in `CaseEditor.test.tsx`.** `expect(calls).toHaveLength(0)` became `calls.filter(c => c.method !== "GET")`, because the editor now reads its owner's overview on open. The no-write intent is kept. NFR-15 strictly allows assertion edits only for overridden behaviour. All other existing-test edits are fixtures (`scope`, `running_case_run`) or the overridden row/Run layout.

### Gates re-run (my own runs)
- `./scripts/check.sh all`: all PASS.
  - server:typecheck, lint and arch pass; server:test 848 passed.
  - client:typecheck, lint and arch pass; client:test 787 passed.
  - core:typecheck passes; core:test 69 passed.
- `cd server && pnpm verify:l06`: 10 files, 206 tests passed. The list includes `draft.test.ts`, `eval-draft.it.test.ts`, `case-run.test.ts` and `eval-case-run.it.test.ts`.
- `cd server && pnpm exec vitest run eval-contract-parity`: 5 passed.
- `cd server && pnpm exec vitest run .it.test`:
  - 5 failed, 300 passed, in 2 failing files.
  - The 5 failures are exactly the known baseline: `skills-stats.it.test.ts` x4 and `skills.it.test.ts` "404s for an unknown skill and an unknown version".
  - `onboarding-tour` passed this time.
- NFR-16 greps (`SkillEvalMenu|skillEval\b|skillMenuState|SKILL_REJECTION_KEY` in `client/src`, `skillEval` in `prReview.json`): no matches.
- Ad hoc timing, using temporary copies of the IT files that I deleted (`git status` is unchanged):
  - `POST /eval-cases/:id/run` took 2.6-6.1 ms, against a 500 ms limit.
  - `GET /findings/:id/eval-case-draft` with a 227 KB diff took 1-7 ms, against a 1 s limit. NFR-13 is therefore Pass, though it is not an automated test.

### Your specific checks
1. **Migration (NFR-6): Pass.**
   - `0025_lovely_jamie_braddock.sql` is exactly `ALTER TABLE "eval_runs" ADD COLUMN "scope" text DEFAULT 'set' NOT NULL;`.
   - The journal has only an appended idx 25 entry, and its `when` is later than 0024's.
   - In the snapshot, `prevId` equals the 0024 `id`. The only diff from 0024 is the `scope` column on `public.eval_runs`.
   - There are no lockfile, client `package.json` or older-migration edits. `server/package.json` changes only the `verify:l06` script text.
2. **Vendor `eval-ci.ts`: Pass.**
   - The region between the "Eval - runs, overview, dashboard, compare (SPEC-08)" banner and the "Compose Review" banner is byte-identical in both copies.
   - The Phase B diffs of the two copies are identical.
   - The `Eval*` export sets are equal.
   - There is no `.default()` in the region.
   - The detail types extend the records, so `scope` is declared once. The extra `EvalRunningCaseRun` type sits inside the region.
   - Whole-file drift outside the region (`AgentManifest`, `CiFailOn`, the `openrouter` enum) predates this work.
3. **NFR-5 readers: all correctly classified.** Every `t.evalRuns` use in the codebase is in `server/src/modules/eval/repository.ts`, plus the `app.ts` reaper call. There is no raw `eval_runs` SQL elsewhere.

| Reader | repository.ts line | Verdict |
|---|---|---|
| `insertRun` / `insertSkillRun`, and the 409 lookup `anyRunningRunId` | 582 / 885 / 1172 | any-scope, unfiltered; writes `scope` |
| `saveProgress`, `isRunning`, `finalizeRun`, `saveSkillProgress`, `finalizeSkillRun` (via `runningRun`) | 623, 637, 646, 932, 950, 1229 | unfiltered |
| `reapRunning` | 674 | unfiltered |
| `deleteByAgent` / `deleteBySkill` | 687 / 706 | unfiltered, so case runs go with the owner |
| `getRunRow` (feeds `getRun` and `compare`) | 747 | any-scope; `compare` returns 404 for a case run (`service.ts:~1003`) |
| `runningRunId` / `runningSkillRunId` | 726 / 983 | set-only via `runningRunOfScope` (1180) |
| `runningCaseRun` | 731 | case-only |
| `latestFinishedRunRow`, `listRunSummaries`, `countFinishedRuns` (via `agentRuns`) | 756, 770, 783, predicate 1206 (scope at 1213) | set-only |
| `recentRunSummaries` | 792 (scope at 801) | set-only, explicit |
| `listSkillRunSummaries`, `listSkillTrendRows`, `latestFinishedSkillResults` (via `skillRuns`) | 988, 1002, 1016, predicate 1219 (scope at 1224) | set-only |
| `latestResultsByCase`, `newestSetRunSources`, `newestCaseRunSources` | 1045, 1064, 1098 | the only any-scope per-case reader; the case half has an explicit `scope='case'` at 1111 |

   - The dashboard goes through `recentRunSummaries` and `listRunSummaries`, both set-only (`service.ts:957-990`).
   - The IT snapshot test (`eval-case-run.it.test.ts:263-290`) asserts that every set-only reader and route is identical before and after a case run, for agent and skill.
4. **NFR-17 / AC-46: Pass.**
   - `newestCaseRunSources` (`repository.ts:1098-1153`) runs a `DISTINCT ON (case_set->0->>'id')` limited to `scope='case'` rows of the owner and to the listed case ids. It orders by `ran_at desc, id desc`, so the newest run wins per case.
   - It then reads `case_results` only for those winners. The set side reads one set run.
   - `case_set->0->>'id'` is equivalent to `@>` containment, because a case run's `case_set` holds exactly one case. NFR-17 does not mandate `@>`.
   - Nothing scans every run's `case_results`.
   - The scan covers the owner's case-scope run headers (an unpruned history, which the spec's Non-goals accept).
   - `pickLatestSource` takes the later-started run, and the set run wins on a tie. Errored and reaped case runs surface as an errored result via `sourceOutcomes`.
5. **`startCaseRun`: Pass.**
   - `service.ts:~558` reads the case once into `toFrozenCase`, which gives EC-26.
   - It calls `launchAgentRun` or `launchSkillRun`, the same bodies as the set run, with a `RunTarget`. There is no second path.
   - The 409 comes from the unique index plus the any-scope lookup.
   - 202 returns before the detached executor starts.
   - EC-27: `isRunning` is checked before each review. The skill executor checks it before the second arm, so there is no second call, and it logs at info only.
   - A skill case with an errored arm finishes `errored`, never `partial`.
   - NFR-12: log objects carry ids, scope, status and duration only. `case-run.test.ts:528` and `:601` assert this.
   - The IT tests cover NFR-2 (1 and 2 provider calls), NFR-3 (no rows in the five tables, `last_reviewed_sha` untouched), EC-25, EC-26, EC-27, EC-22 and EC-30.
   - Observation, not a Fail: the crash-path error log (`service.ts` ~625 and ~796) includes the `toErrorReason` text. That code is unchanged from the set run. The start and finish logs carry no reason.
6. **Client: Pass except the EC-23/EC-24 gap above.**
   - Run case, Run on save (agent and skill, with EC-16/17/31) and the row Run on both tabs are implemented and tested. The carrier dialog moved with `git mv` to `components/carrier-run-dialog/`, and `client:arch` passes. It gained additive `caseId` and `confirmDisabled` props, which B11 allows.
   - Disable-while-running (AC-49) covers the row Run, Run case, Run all evals (both tabs), the carrier confirm and the skill header button via `use-skill-eval-flow`.
   - Timeouts are 3 min for an agent and 6 min for a skill (`EVAL_CASE_RUN_TIMEOUT_MS`, `SKILL_EVAL_CASE_RUN_TIMEOUT_MS`), tested.
   - Known gap, severity **Low**. The skill tab's "Run all evals" and the header "Run on evals" use the flow's overview, not `useCaseRun`'s `inFlight`.
     - After a row Run they stay enabled only until the overview refetch that `useStartEvalCaseRun.onSettled` triggers, about one round trip.
     - The server then 409s, which is handled. The row Run buttons and Run case are already disabled by `inFlight` immediately.
   - i18n floors are Pass. My own recount of the 11 roots gives 108 files and 201 uses, against floors of >100 and >190, margins of 8 and 11.
7. **Layout (NFR-11):** see the B20 row above.

### Phase A catch-up rows: all Pass
- A19, AC-2, AC-3, AC-7, EC-1..EC-4, EC-9, EC-29 (draft and run routes), NFR-1 and NFR-4 are covered by `draft.test.ts` (21 tests) and `eval-draft.it.test.ts` (21 tests), which run inside `verify:l06`. NFR-1 is asserted by `llm.calls` being empty (`eval-draft.it.test.ts:228`, `:362`, `:448`).
- AC-25: the PATCH-title tests are in `eval-draft.it.test.ts:539-585` and `draft.test.ts`.
- A20: the new files `TypeBanner.test`, `OwnerPicker.test`, `EvalCaseRow.test`, `EvalKpiCards.test` and the edited `helpers.test` (parser, `__proto__`, 10 KB, key order, skeleton), `CaseEditor.test` (layout styles) and `EvalsTab.test` (header, pill, with-arm KPIs 54% and 3/4) cover it. `EvalCaseButton.test.tsx` was edited in Phase A.
- NFR-8: Pass, with the accepted reading described above.
- NFR-10 contrast and focus were never measured by anyone. I did not re-check them.

### Not covered by the plan
- The previous Phase A rows that depend on the orchestrator's A22 browser evidence (AC-24, EC-11, NFR-11) remain on that evidence.

### Spec status
- Not ready for `implemented`; Status stays `draft`.
- Remaining before it could be:
  - the EC-23/EC-24 modal gap above (a Fail),
  - B19 reviewer reports (Unverified),
  - the browser exercise of an actual case run, which was not performed.