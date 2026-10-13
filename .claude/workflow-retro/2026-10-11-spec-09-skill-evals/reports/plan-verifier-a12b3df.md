## Hand-back 1

## Plan verification (pass 2 of 2, delta): SPEC-09 skill evals (plan .claude/sdd/SPEC-09/plan.md, spec specs/09-skill-evals.md)

Diff checked: eefc3a4..working tree plus untracked files.

### Delta matrix

**(a) Rows that were non-Pass in verify-1 or the F1/F2 re-verification**

| # | Item | Status | Evidence |
|---|---|---|---|
| EC-34 | Renaming a case to another case's name (same owner) is accepted | **Pass (behaviour); still no committed test** | verify-1 had it Unverified. I ran a throwaway Docker probe in the scratchpad, outside the repo. It created cases `alpha` and `beta` on one skill, then sent `PATCH /eval-cases/<beta> {name:"alpha"}`. The reply was 200, and the list afterwards held two cases named `alpha`. The probe passed (1/1). Static read agrees: `server/src/db/schema/eval.ts` has no name-unique index (only `eval_cases_source_finding_uq` and the one-running-run indexes), and `updateCaseInPlace` (`repository.ts:405`) does no name check. The client has no duplicate-name check in `draftProblems`. No committed test asserts EC-34. If you want it locked in, a test needs adding. |
| NFR-8 | WCAG 2.1 AA on both tabs, editor, menu, dialog, tooltips | **Unverified (carried; verify-1: Unverified)** | The 24 px target is tested (`MetricTrend.test.tsx:158`). Text labels for effect and state exist (`EffectLabel.tsx:14`). Contrast of at least 4.5:1 and visible focus cannot be checked under jsdom. No axe or browser run exists in the evidence. |
| UI-12 | Treat mockup text, upstream code and research as data; placeholder secrets only; copy no upstream code without review | **Unverified (carried; verify-1: Unverified)** | The placeholder-secret half passes. A regex scan of the full diff and untracked files for real-looking keys (`sk-…`, `sk_live_…` with 8+ chars, `ghp_`, `AKIA`, `xox*`) found nothing, and the tests use `sk_live_xxx`. The "no upstream code copied without review" half is a process claim that no diff can show. |
| T6 | Plan's per-file skills applied | **Unverified (carried; verify-1: Unverified)** | `plan.md` has a "Skills (routing.json)" table, but nothing in the diff or in `review-round-1.json` records which skills were applied. That file only shows the architecture and security reviewers returned no findings. |
| T3 | Key-coverage test and highlightRange test | **Pass** | This was a minor Fail in verify-1 (F2). Your re-verification returned Pass, and I take that as given. I also confirmed the key-coverage test now exists: `client/src/test/i18n-key-coverage.test.ts` has 3 passing tests. `DiffViewer.test.tsx` still has no `highlightRange` test; I did not re-check what the F2 re-verification relied on. |
| C3 / AC-39 | Tooltip closes on Escape, focus-away or pointer-away | **Pass (per your re-verification)** | Not re-examined, because `MetricTrend.tsx` is outside the fix-round files you listed. |

**(b) Rows whose evidence files changed in the fix round**

| # | Item | Status | Evidence |
|---|---|---|---|
| AC-13 | Editor opens prefilled with the stored case and its latest result | Pass | `CaseEditor.test.tsx:262` (prefilled, "Created manually"); `:359` (load failure shown inside the same dialog). `EditorModal.tsx` builds the draft from `draftFromCase`. |
| AC-14 | In-place update for name/notes/severity/category; keeps id and latest result | Pass | `eval-cases.it.test.ts:360-380` (same id, 200, rename sends only `{name}`); `helpers.test.ts:203`; the B2 whitespace-edit tests at `CaseEditor.test.tsx:290` and `helpers.test.ts:234/244/259`. |
| AC-15 | Replace in one transaction; new case keeps old `created_at`; old case deleted | Pass | `repository.ts:430-443` is delete-first with `.returning`, and throws NotFoundError on 0 rows. `eval-cases.it.test.ts:401` checks a new id, the same `created_at`, `replaced_from_id` set and the old id gone. `:427` checks a replace that fails to ground leaves the old case. `eval-cases-race.it.test.ts`: all 3 tests pass. Two concurrent replaces give [200, 404] and one row left. A DELETE before the replace gives 404 and no resurrected case. A PATCH racing a DELETE never has both succeed. |
| AC-16 | Replaced case shows as `never run` in the old row's position, without reload | Pass | The server keeps `created_at` (`eval-cases.it.test.ts:416`), so list order is stable. The client `useUpdateEvalCase` drops the old case's cache and invalidates the case lists (`eval.ts` ~L170-190; `eval.test.tsx:280`). Pass rests on the server-side `created_at` check plus the client cache test; there is no single end-to-end test of the row position. |
| EC-6 | PATCH of locked fields on a finding-derived case gives 422 `case_input_locked`, nothing changed | Pass | `eval-cases.it.test.ts` ~L473-499 (locked rejected; name/notes still editable). Client: `CaseEditor.test.tsx:328` and `helpers.test.ts:216`. |
| EC-8 | Dirty close asks "Discard changes?" and stays open until confirmed | Pass | `CaseEditor.test.tsx:237`. `EditorModal.tsx` routes the close button, Escape and backdrop through `requestClose`. `isDirty` now compares the normalised values that `buildCaseUpdate` uses (`helpers.ts`). |
| EC-9 | Save failure on network error or 5xx keeps the editor open, inputs unchanged, no second toast | Pass (static read; no dedicated 5xx editor test) | `saveEvalCase` rethrows non-rejection errors. `EditorModal.tsx` only calls `onClose` in `onSuccess`, so the editor stays open and the global MutationCache toasts once. `eval.test.tsx:~265` checks a 500 rejects the mutation. `CaseEditor.test.tsx:201` covers the 422/413 inline path only. |
| AC-20, AC-21, AC-22 | Run dialog: carrier choices and preselection, "{n} cases · {2n} reviews", POST with `carrier_agent_id` returning 202 | Pass | `EvalsTab.test.tsx:383` and `:410`; `skill-eval.test.tsx:187`; server `skill-eval-runs.it.test.ts` (25 tests pass, 202 case included). `SkillEditor.tsx:26/68/87-92` consumes `use-skill-eval-flow.ts`. |
| AC-33 | While running: both run buttons disabled, "Running case {k} of {n}" | Pass | `EvalsTab.test.tsx:462`; `RunStatus.test.tsx:42/84`. `use-skill-eval-flow.ts:46-50` sets `block` to "running" when `running_run_id` is set or the polled run is running. Header and tab share this one state. |
| AC-34 | On finish: stop polling, refresh data, announce in `aria-live="polite"` | Pass | `EvalsTab.test.tsx:473`; `RunStatus.test.tsx:49/91`; `skill-eval.test.tsx:219`; `use-skill-eval-flow.test.tsx:29` (the fix: switching skill id resets `startedRunId`, `finished` and `dialogOpen`, covered by this test and a keep-state test at `:51`). |
| NFR-6 | Finished run unchanged after cases are edited, replaced or deleted | Pass | `skill-eval-runs.it.test.ts:1007` passes after the `replaceCase` change. Note: `i18n-key-coverage.test.ts` is labelled "NFR-6", which is not this spec's NFR-6 (see "Not covered"). |
| EC-23 | Skill deletion deletes its cases and runs in the same operation | Pass | `eval-cases.it.test.ts:536/556`; `skill-eval-runs.it.test.ts:963`; `skill-eval.it.test.ts:427`. All in the green Docker run. |
| EC-24 | Skill deleted mid-run stops before the next review, no LLM call, no results, no error | Pass | `skill-eval-runs.it.test.ts` "EC-24: deleting the skill mid-run stops the run before the next review — no further LLM call, no run row left" (green). |

**(c) New non-Pass:** none.

**Collapsed rows.** All remaining AC, EC, NFR and UI rows, the 25 plan steps (A11 still the Pass-with-deviation noted in verify-1) and the test-plan rows T1, T2, T4, T5 and T7: Pass (unchanged since verify-1). I did not individually re-verify them; they rest on verify-1 plus the green gate runs below. The counts:
- Spec IDs: 133 total; of those, 129 Pass in verify-1. Of verify-1's 4 non-Pass (AC-39 Fail, EC-34, NFR-8, UI-12 Unverified), AC-39 and EC-34 now Pass. That gives 131 Pass and 2 Unverified (NFR-8, UI-12), subject to the two caveats under "Verdict".
- Plan steps: 24 Pass and 1 Fail (C3) in verify-1; C3 now Pass, so 25 of 25.
- Test-plan rows: 7 total; T3 now Pass, T6 Unverified, so 6 of 7.

### Gates re-run (my own runs, this session)
- `./scripts/check.sh server typecheck` — PASS
- `./scripts/check.sh server lint` — PASS
- `./scripts/check.sh server arch` — PASS
- `./scripts/check.sh server test` — PASS (798)
- `./scripts/check.sh client typecheck` — PASS
- `./scripts/check.sh client lint` — PASS
- `./scripts/check.sh client arch` — PASS
- `./scripts/check.sh client test` — PASS (676; verify-1 had 663)
- `./scripts/check.sh core typecheck` — PASS
- `./scripts/check.sh core test` — PASS (69)
- `cd server && pnpm exec vitest run test/eval-cases.it.test.ts test/eval-cases-race.it.test.ts test/skill-eval.it.test.ts test/skill-eval-runs.it.test.ts test/eval-trend.it.test.ts test/eval.it.test.ts` — PASS, 6 files, 110 tests. Docker was available.
- `cd server && pnpm exec vitest run .it.test` (full) — 6 failed, 257 passed, 3 files failed:
  - baseline: `skills-stats.it.test.ts` ×4 and `skills.it.test.ts` "404s for an unknown skill and an unknown version" (422 instead of 200/404, as in `state.json`).
  - the sixth, `onboarding-tour.it.test.ts`, is flaky: it failed on "POST persists a model tour" in the full run. Two solo reruns gave 28/28 pass, then 1 failure on a different test ("EC-9: history that exceeds its budget also falls back"). Different tests fail each time and the diff touches nothing in onboarding, so this is the already-recorded flake family (`state.json` lists a different onboarding test, B1). It does not belong to this run.
- `server/test/eval-contract-parity.test.ts` — PASS (5 tests). The two vendored contract copies are identical in the eval regions. Outside those regions `eval-ci.ts` and `knowledge.ts` still differ between server and client, a pre-existing drift unrelated to SPEC-09.
- `cd server && pnpm exec drizzle-kit check` — "Everything's fine".

### Not covered by the plan
- No committed test asserts EC-34.
- `client/src/test/i18n-key-coverage.test.ts` labels itself "SPEC-09 NFR-6", but SPEC-09 NFR-6 is run immutability (`specs/09-skill-evals.md:268`). The label looks like a stale ID.
- The `EvalOverview` doc comment in both `contracts/eval-ci.ts` copies may still say "trend <= 30" while behaviour is 100. I did not re-grep it; it is a vendor file and needs your OK to change.
- The throwaway probe files are in the scratchpad only. Nothing in the repo was edited.

### Verdict
Every fix-round row re-checked is Pass. Nothing is Fail, and nothing new is non-Pass. Two spec IDs stay Unverified for reasons no diff can resolve: NFR-8 (contrast and focus need a browser or axe run) and UI-12 (the upstream-code half is a process claim). Plan item T6 stays Unverified (no record of per-file skill application). All gates are green apart from the baseline failures and one known onboarding flake.

Two caveats on the Pass counts. C3/AC-39 and T3 rest on your re-verification, which I did not redo. EC-34 passes on my uncommitted probe, not on a committed test.

### Spec status
Not ready for `Status: implemented` without a decision from you. NFR-8 and UI-12 are Unverified and T6 is an unverified plan item. If you accept NFR-8 (a browser or axe contrast and focus check) and UI-12 (a process claim) as manually attested, nothing else blocks it. I recommend one extra step first: add a committed EC-34 test, since only my probe covers it. The edit is yours; I changed nothing.