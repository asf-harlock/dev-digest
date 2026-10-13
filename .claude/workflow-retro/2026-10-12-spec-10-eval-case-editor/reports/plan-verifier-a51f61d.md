## Hand-back 1

## Plan verification: SPEC-10 Phase B (B1–B20), delta pass 2 of 2, plus overall Phase A+B

### Verdict
Phase B delta: the one Fail from verify-3 is now Pass. **No Fail remains in Phase B or Phase A+B.** The unchanged rows still pass. What is left is Pass on someone else's evidence or Unverified, not broken (see Remaining non-Pass).

### Delta matrix (rows that were non-Pass, plus rows whose evidence changed)
| Row | verify-3 status | Now | Evidence |
|---|---|---|---|
| EC-23 / EC-24 / AC-42 inside the Case Editor modal | Fail (partial) | **Pass** | `use-case-run.ts:66` defines `stalled = run.timedOut \|\| run.pollFailed`, and `:70` defines `busyLive`. `EditorModal.tsx:301-305` renders `<CaseRunStatus flow live={false}/>` inside the single `role="status"` banner slot. `:284` and `:286` use `busyLive` and `!stalled`. `CaseRunStatus.tsx` has the `live` prop that suppresses a second live region. `CaseEditor.run.test.tsx:629-720` has 3 new tests: the EC-23 timeout sentence in the modal, EC-24 failed poll with Retry resuming and showing the result, and EC-24 from a finding-card mount (seed, Run on save). The EC-23 test also asserts there is no second `aria-live` region. The tests are in the 790-test client gate, which passes. |
| B5 (fix: `stalled`/`busyLive`, `live` prop, `styles.ts:59-60` stalled style) | Pass | **Pass** | As above. The `styles.ts` change is only a `marginTop: 6` entry. |
| B19 (reviewers) | Unverified | **Pass** | Taken from your report, not my own judgment: architecture 0 findings, `pnpm arch` passes for server and client (my `check.sh all` shows `server:arch` and `client:arch` PASS). Security 0 findings. Bug reviewer's one WARNING (B5) is fixed and confirmed on re-review. |
| M1 modal width: `client/src/lib/modal-width.ts` plus EditorModal, DiscardDialog, RunDialog, DeleteCaseDialog | Pass-on-orchestrator | **Pass on the orchestrator's browser evidence; code Pass** | `modal-width.ts` is `min(max, innerWidth - 56)` via `useSyncExternalStore`. All 4 dialogs import it (grep). `EditorModal.tsx:116,362` passes `width={modalWidth}`. **There is no unit test of `fitModalWidth` or the hook** (grep finds no test file referencing them), so the viewport behaviour rests on the browser check alone. |
| B20 / NFR-11 / AC-23 / AC-24 / EC-11 | Pass-on-orchestrator | **Still Pass on the orchestrator's browser evidence, not mine** | I ran no browser. I checked that the code supports it and that the styles test is inside the 790 passing client tests. |
| NFR-8 literal reading | accepted | accepted, unchanged | `verify:l06` is 10 files / 206 tests. The client tests sit outside that list, as before. |
| Low: skill-tab "Run all evals" enabled for about one round trip after a row Run | Known gap | **Still open, deferred** | `use-case-run.ts` `busy` is unchanged for the tabs. The server 409 guards it. |
| NFR-10 contrast / focus | Never measured | **Still Unverified** | No measurement exists. Roles and aria are covered by tests, but 4.5:1 contrast and visible focus were never measured. |
| Minor: two `CaseEditor.test.tsx` assertions edited (`calls` filtered to non-GET) | noted | unchanged | Intent kept. |

Every other B1–B18 row, the Phase A catch-up rows, and the server, contract and migration rows: **Pass (unchanged since verify-3)**. Count: B1–B4 and B6–B18 (17 items) plus A19, A20, AC-2/3/7, EC-1..4/9/29, NFR-1/4/8/13 and AC-25.

### Gates re-run (my own runs)
- `./scripts/check.sh all`: all PASS. Server 848, client 790, core 69. Client grew from 787 to 790 with the 3 new stalled-run tests.
- `cd server && pnpm verify:l06`: 10 files / 206 tests pass.
- `cd server && pnpm exec vitest run eval-contract-parity`: 5/5 pass.
- `cd server && pnpm exec vitest run .it.test`: 9 failed, 296 passed. Baseline: skills-stats x4 and skills 404 (5 failures). On top of that, 3 `onboarding-tour` tests and the SPEC-04 `context-run` EC-18 test failed under load. I re-ran `context-run.it` and `onboarding-tour.it` alone. `context-run` passed, and `onboarding-tour` failed a different test ("POST persists a model tour"), so both are load flakes. None are eval-related. **All 21 `eval-case-run.it` tests and the `eval-draft.it` tests pass.**
- NFR-16 greps are empty: `grep -rn "SkillEvalMenu\|skillEval\b\|skillMenuState\|SKILL_REJECTION_KEY" client/src` and `grep -n skillEval client/messages/en/prReview.json`.
- Migrations: the only new files are `0025_lovely_jamie_braddock.sql` and `meta/0025_snapshot.json`. The `_journal.json` diff is only the idx-25 entry.
- No lockfile, `skills-lock.json` or `client/src/vendor/ui` changes since a4d69df. The vendor changes are `eval-ci.ts` in both shared copies: identical 16-line additions (`EvalRunScope`, `EvalRunningCaseRun`, `running_case_run`).

### Remaining non-Pass across SPEC-10 (Phase A+B)
- **NFR-10 (WCAG contrast and focus): Unverified.** It was never measured. Everything else in NFR-10 that tests can show is covered.
- **NFR-11, AC-23, AC-24, EC-11, B20: Pass only on the orchestrator's manual browser check.** The spec itself requires that check, recorded in the PR description. No unit test covers the viewport fitting in `modal-width.ts`, and the manual check is the only evidence.
- **NFR-8: Pass on the accepted reading only** (client tests not in `verify:l06`).
- **Known low gap (deferred, not an AC/EC failure):** skill-tab "Run all evals" is enabled for about one round trip after a row Run. The server 409 guard covers it.

### Spec status
Not ready for `implemented`: NFR-10 is Unverified, and the NFR-11 family is Pass only on browser evidence that isn't in a durable artifact. Every other AC, EC, NFR and UI row is Pass. I recommend `Status: draft` stays until you either measure NFR-10 (axe or Lighthouse on the Case Editor and both Evals tabs) or accept it as a recorded exception, and record the NFR-11 browser check in the PR description. After that, `implemented` is justified. The edit is yours.

Paths: `/Users/harlock/Downloads/Sites/devdigest/specs/10-eval-case-editor-run.md`, `/Users/harlock/Downloads/Sites/devdigest/.claude/sdd/SPEC-10/plan.md`, `/Users/harlock/Downloads/Sites/devdigest/client/src/components/eval-case-editor/` (`use-case-run.ts`, `EditorModal/EditorModal.tsx`, `CaseRunStatus/CaseRunStatus.tsx`, `CaseEditor/CaseEditor.run.test.tsx`), `/Users/harlock/Downloads/Sites/devdigest/client/src/lib/modal-width.ts`.