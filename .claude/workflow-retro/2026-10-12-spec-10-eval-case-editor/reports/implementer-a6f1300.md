## Hand-back 1

## Implementation report: SPEC-10 Phase B, workstream W3-B (client, steps B11-B16)

All four client gates pass. I ran the inner loop plus one outer pass, since only client files were touched. I added no new test files (a throwaway flow test was deleted).

### Plan step -> change
Skills applied for every step below: frontend-ui-architecture, next-best-practices, react-best-practices, security, typescript-expert. React-testing-library was applied to the edited tests. This matches the routing table.

**B11 carrier dialog move**
- `git mv` of the whole `RunDialog/` folder to `client/src/components/carrier-run-dialog/` (RunDialog.tsx, helpers.ts, styles.ts, index.ts). The folder is kebab-case and the component keeps its name.
- Importers updated: `app/skills/_components/SkillEditor/SkillEditor.tsx` and the skill `EvalsTab.test.tsx`. `use-skill-eval-flow` had no reference to the dialog.
- `RunDialog.tsx`: set-run behaviour is unchanged. New optional props:
  - `confirmDisabled` (AC-49): disables the confirm button and gives it a title hint.
  - `caseId`: the dialog calls `useStartEvalCaseRun` instead, and shows counts for 1 case.
  - `skill` is narrowed to `Pick<Skill, "id"|"enabled"|"injection_flagged">`, so the editor does not need a full `Skill`.

**B12 hooks and flow**
- `lib/hooks/eval.ts`:
  - New `useStartEvalCaseRun()` (`POST /eval-cases/:id/run`). It resolves a 202 as `{kind:'started', run}` and a 409 `eval_run_in_progress` as `{kind:'conflict', runId}` (via `detailsId`). It invalidates the agent and skill overviews.
  - Added `evalKeys.caseAll` and `evalKeys.skillOverviewAll`.
  - Added `EVAL_CASE_RUN_TIMEOUT_MS` (3 min).
  - `useEvalRun` takes a third argument `{timeoutMs?}`. Its onSettled now also invalidates `caseAll` (the case-detail prefix).
- `lib/hooks/skill-eval.ts`: added `SKILL_EVAL_CASE_RUN_TIMEOUT_MS` (6 min), `useSkillEvalRun` takes `{timeoutMs?}`, and onSettled invalidates `caseAll`.
- New `components/eval-case-editor/use-case-run.ts` (`useCaseRun(owner)`):
  - It reads the owner's overview, follows `running_case_run` or the locally started run, and polls with the 3-minute (agent) / 6-minute (skill) cap.
  - It exposes `runningCaseId`, `busy` (set run, case run or start pending), `noAgent`, `startAgentCase`, `onStarted`, `skillOverview`, `finished`, `timedOut`, `pollFailed` and `retry`.
- New `CaseRunStatus/`: an `aria-live="polite"` region, the timeout sentence (`runStatus.timeout`) and a Retry for a failed poll, with no second toast. It is placed under each tab's case-list header.
- Exported from the `eval-case-editor` index: `useCaseRun`, `CaseRunStatus`, `CaseRunFlow`.

**B13 Case Editor Phase B**
- `EditorModal.tsx`:
  - Footer reads: Delete (stored case), a hint area, `RunOnSaveToggle`, Cancel, **Run case** (play icon), Save. Every footer button has `type="button"`.
  - New `RunOnSaveToggle/`: `role="switch"`, off on every open, disabled with "Link this skill to an agent first" (EC-19).
  - **Run case** hints, in priority order: "Save the case to run it", "Save your changes to run it", "A run is in progress", "Link this skill to an agent first". The hint text is also visible in the footer.
  - The result banner slot (`role="status"`, always rendered) now holds `ResultBanner/`: "Running…", or "Last run passed / failed / errored: {reason}" with `{passed}/{total} passed · {duration} · {cost}`.
  - Count and cost rules in the banner: `1/1` or `0/1` is derived from `state` and omitted when errored; cost is "—" when null; skill cases show an effect label.
  - Actual output already reads `latest_result.findings`.
  - A save with Run on save on keeps the editor open: `finish()` resets edits and calls the new `onStay(caseId, owner)`.
    - Agent-owned: the run starts on the saved id, which is the NEW id after a replace (EC-17).
    - Skill-owned: the carrier dialog opens, and cancelling keeps the saved case (EC-31).
    - A rejected or failed save never reaches `finish`, so it starts nothing and the toggle stays on (EC-16).
  - Escape is disabled while the carrier dialog is open.
  - `useCaseRun` and the carrier dialog sit in stable tree slots after the existing children, so the portal position is unchanged.
- `CaseEditor.tsx`: holds the `saved {caseId, owner}` state; it switches to the saved case and drops `seed` after a stay.
- `helpers.ts`: `CaseOwner` (re-exported by EditorModal), `runCaseBlock`, `RUN_CASE_HINT_KEY`, `bannerCount`, `effectKey`.
- `styles.ts`: footer wraps and the hint area is right-aligned.
- Closing mid-run (EC-15): the tab's own `useCaseRun` keeps following the run. The reopened editor shows the running banner via `running_case_run`.

**B14 rows and tabs**
- `EvalCaseRow`: optional `run: {onRun, running, disabled, hint}`, exported as `EvalCaseRowRun`. A play-icon **Run** button sits between the tag and **Edit** and reads "Running…" for the running case. Without `run`, no button is shown.
- Agent tab: `EvalsTab`, `EvalCaseList` (`runningCaseId`, `runDisabled`, `onRun`) and `RunAllEvals` (`caseRunning` prop). **Run all evals**, row **Run** and **Run case** are all disabled while any run of the owner runs.
- Skill tab:
  - `EvalsTab` renders its own case-run `RunDialog` for row **Run**, with `confirmDisabled`.
  - `SkillCaseList` takes `runningCaseId`, `busy`, `noAgent` and `onRun`.
  - `use-skill-eval-flow.ts` `block` now also reads `running_case_run`, which disables the header "Run on evals" and **Run all evals**.
- KPI / trend / history stay set-only. EC-14 empty states ("—" KPIs, "No runs yet") were already present and are unchanged.

**B15 i18n**
- `messages/en/eval.json`:
  - New `caseRun.*`: runOnSave, runCase, hints, banner (including `effectLabels`), live, carrierDialog.
  - New `evalsTab.case.run` and `evalsTab.case.running`.
- `i18n-key-coverage.test.ts`: the old RunDialog root is replaced by `components/carrier-run-dialog`. I counted the final root set at 11 roots, 108 files and 201 `t()` uses. The floors are now `files > 100` and `uses > 190`. The plan's 20/80 numbers were already superseded in Phase A (90/160).

**B16 existing tests updated**
- Fixtures: `scope: "set"` added in `test/eval-fixtures.ts` and the skill `EvalsTab.test.tsx`; `running_case_run: null` added in both `EvalsTab.test.tsx` files and `EvalAgentDetailView.test.tsx`.
- Intended behaviour changes, so assertions updated:
  - Both `EvalsTab.test.tsx`: the row buttons now include "Run case {name}" between Open and Edit (AC-39).
  - `CaseEditor.test.tsx`: the two "no request" assertions now filter to non-GET, because the editor reads its owner's overview on open.
- `eval.test`, `skill-eval.test`, `use-skill-eval-flow.test` and `FindingsPanel.test` needed no edits.

### Tests run
- `./scripts/check.sh client typecheck` — PASS client:typecheck 2s
- `./scripts/check.sh client lint` — PASS client:lint 3s
- `./scripts/check.sh client arch` — PASS client:arch 1s
- `./scripts/check.sh client test` — PASS client:test 19s (689 passed (689))
- Outer-loop gates for the client only; server and core not run (W2-B owns the server).

### Self-check (implementation scope only)
- Diff matches the plan: yes, with the deviations below.
- Naming and "Do not touch" rules respected: yes.
  - No vendor, server, migration or lockfile edits.
  - Kebab-case shared folders; PascalCase components; no `_components/` inside `src/components/`.
  - No `fetch` in components; all text through next-intl.
- i18n keys exist: yes. I resolved every literal and dynamic key against `client/messages/en/eval.json` with a Python walk, covering `caseRun.hints.*`, `caseRun.live.*`, `caseRun.banner.*` (including `effectLabels.*` and `stats*`), `caseRun.carrierDialog.*`, `evalsTab.case.run|running`, `evalsTab.run|running` and `runStatus.timeout|pollFailed|retry`. `i18n-key-coverage.test.ts` also passes. The carrier dialog keeps its existing `skills.evals.runDialog.*` keys in `skills.json`; only the case-mode strings are new, in `eval.json`.
- I ran a temporary flow test (since deleted). It covered the agent case: edit, Run case disabled with "Save your changes to run it", Run on save, PATCH replace, run on the new id, "Running…" banner, polling, then "Last run failed / 0/1 passed · 1.5s · —". The skill carrier path has no end-to-end check from me.

### Deviations from plan and ambiguities
1. `useStartEvalCaseRun()` takes variables `{caseId, carrierAgentId?}` instead of `(caseId)`, because one instance has to serve every row. A 409 resolves as `{kind:'conflict'}` and is NOT followed as this case's run, since the running run may be a set run or another case's. The overview invalidation then drives the disabled state. There is no inline 409 message beyond the "A run is in progress" hint.
2. `CaseRunStatus`'s live region has `aria-live="polite"` but no `role="status"`. A second `role="status"` made the existing skill tab test `findByRole("status")` fail with multiple matches, and I did not want to weaken it. The editor's banner slot keeps `role="status"`.
3. The effect labels are duplicated into `eval.caseRun.banner.effectLabels.*` instead of using `skills.evals.effect.*`. The editor tests do not provide a `skills` namespace, and this keeps the editor independent of it.
4. `useCaseRun` lives in `components/eval-case-editor/`, not in `lib/hooks/`, because that is within my owned paths. It is exported from the editor's index.
5. The skill hook's onSettled does not invalidate the dashboard: an existing test asserts that a skill run leaves the agent dashboard untouched. It does invalidate `caseAll`, the case-detail prefix. A case-run finish therefore refetches `GET /eval-cases/:id` and the case list.
6. Both the tab and the open editor call `useCaseRun`, so they each poll the same run key every 2 seconds. React Query dedupes the requests. I accepted this instead of threading one instance down.
7. Finding-route saves (created through `POST /findings/:id/...`) with Run on save show a brief "Loading" skeleton while the new case detail loads. I kept the hook result shapes unchanged (existing `toEqual` tests) and did not seed the cache.
8. EC-20 warnings (disabled skill or link, `injection_flagged`) are inherited from `RunDialog`, which I did not change.

### Handoff note
- **Tests the test-writer should add (B18):**
  - Footer toggle: `role="switch"`, off on open, disabled with the EC-19 reason.
  - **Run case** hints: draft, modified, running, noAgent.
  - ResultBanner states: passed, failed, errored with and without a reason, running, cost "—", and the skill effect label.
  - Run on save, agent: stays open, starts the run on the new id after a replace (EC-17), rejected 422 or 5xx starts nothing and keeps the toggle on (EC-16).
  - Run on save, skill: opens the carrier dialog after the save; cancel starts no run and keeps the saved case (EC-31); confirm posts `{carrier_agent_id}`.
  - Row **Run** on both tabs: the skill tab opens the carrier dialog; the agent tab posts directly; "Running…" shows on the row.
  - Disable-everything-while-running (AC-49), driven by `running_run_id` and by `running_case_run`: **Run all evals**, row **Run**, **Run case**, carrier confirm, and the skill header button.
  - A 409 start (conflict result, no follow).
  - Polling stop, the 3-minute (agent) and 6-minute (skill) timeout sentence, and Retry after a failed poll with no extra toast, using fake timers.
  - The `aria-live` announcement from `CaseRunStatus`.
  - The carrier dialog from its new location: a `caseId` case-mode test, plus the set-mode regression.
  - Escape with the carrier dialog stacked on the editor closes only the dialog.
  - Reopening the editor mid-run shows the running banner (EC-15).
  - EC-14 empty states with only case runs.
- **Architecture-review items:** `use-case-run.ts` sits in a component folder and is imported by both app routes. The cross-component dependency is editor -> carrier-run-dialog and editor -> hooks only.
- **Local-only caveats for review:** the editor reads the owner's overview on open, so `GET /agents|skills/:id/eval-overview` is now a mount-time request for the editor (including from the PR page). Nothing was committed or pushed.
- **Manual browser check B20 (NFR-11) remains.** I did not check the footer and banner at 1280x720 and 768x600. The footer grew a hint area and a toggle, and it wraps (`flexWrap`).

---

## Hand-back 2

## Fix mode: M1, Case Editor dialog wider than the viewport

| id | status | evidence |
|---|---|---|
| M1 | fixed | `client/src/lib/modal-width.ts` (new: `fitModalWidth`, `useFittedModalWidth`) applied at `client/src/components/eval-case-editor/EditorModal/EditorModal.tsx:98` (`const modalWidth = useFittedModalWidth(MODAL_WIDTH)`) and `:354` (`<Modal width={modalWidth} …>`); unit assertion in `client/src/components/eval-case-editor/CaseEditor/CaseEditor.test.tsx` (new test at the top of the "CaseEditor layout" describe) |

**Fix**
- The new hook returns `min(max, innerWidth - 56)`. 56 is the kit's 28px padding on each side. It follows window `resize` events via `useSyncExternalStore`, and on the server it returns `max`.
- `vendor/ui` is untouched.
- The editor passes `min(1080, viewport - 56)` to the kit `Modal`.
- I also applied the same hook, at their own widths, to the three other dialogs the editor flow opens:
  - `DiscardDialog` at 460, which is in `eval-case-editor`.
  - `RunDialog` at 520, in `components/carrier-run-dialog/RunDialog.tsx`.
  - `DeleteCaseDialog` at 460, in `components/delete-case-dialog/DeleteCaseDialog.tsx`. This file is outside the list I own, and the edit is a three-line change.
- These three would overflow only below roughly 516 to 576px viewports. I did not measure them in the browser.
- Other kit `Modal` users outside this feature have the same latent defect (`CreateAgentModal` 620, `NewSkillModal` 640, `CreateSkillFromConventionsModal` 720). I left them alone.

**Measured in the browser** (Playwright with Chromium, dev server on :3000, agent Evals tab, "New eval case" opened and nothing saved). Bounding rects are `[left, top, right, bottom]`.

| viewport | dialog | Cancel | Run case | Save | Run on save toggle | form (columns) |
|---|---|---|---|---|---|---|
| 1280x720 | 100,90,1180,630 (1080 wide) | 902–971 | 981–1088 | 1098–1155 | 768–892 | 101,174,1179,554, two columns side by side |
| 768x600 | 28,70,740,530 (712 wide) | 462–531 | 541–648 | 658–715 | 328–452 | 29,154,739,454, two columns |
| 700x600 | 28,50,672,550 (644 wide) | 394–463 | 473–580 | 590–647 | 260–384 | 29,133,671,1163, stacked (687px height of columns clipped by the dialog body) |

- In every case the dialog sits at left ≥ 28 and right ≤ viewport − 28.
- At 1280 the dialog stays 1080 wide.
- All four footer controls are fully inside the dialog.
- Footer bottoms are 613, 513 and 533, all inside the viewport; the dialog bottom is at most 550, below the 600 viewport height.
- Scrolling elements inside the dialog:
  - 1280: only a one-row Notes textarea reports `scrollHeight > clientHeight`. I did not check whether it shows a scrollbar.
  - 768: the Diff textarea (a text pane) and the Notes textarea.
  - 700: only the modal body (stacked layout).
  - At 1280 and 768 the modal body itself has no scroll (`bodyScrolls` false); at 700 it does, as intended.
- Page scroll: `scrollWidth`/`scrollHeight` are 1280x720 at 1280, 768x757 at 768 and 700x784 at 700. They are identical with the dialog closed, so this comes from the page content behind the overlay and is not caused by the dialog. There is no horizontal page scroll.
- I did not check overlap pixel by pixel; I only compared bounding boxes.

**Gates**
- `./scripts/check.sh client typecheck`: PASS client:typecheck 4s
- `./scripts/check.sh client lint`: PASS client:lint 6s
- `./scripts/check.sh client arch`: PASS client:arch 2s
- `./scripts/check.sh client test`: PASS client:test 26s (690 passed (690))

**Notes**
- The new unit assertion sets `window.innerWidth` to 1280, 768, 700 and 375 and checks the dialog's inline width is 1080, 712, 644 and 319px.
- I used a throwaway Playwright script in the scratchpad directory (Playwright MCP was not available to me); it is not in the repo.
- I did not touch any new test files from the test-writer.

---

## Hand-back 3

## Fix mode: B5, Case Editor shows "Running…" forever when polling fails or times out

| id | status | evidence |
|---|---|---|
| B5 | fixed | `client/src/components/eval-case-editor/use-case-run.ts:63-69` (new `stalled`, `busyLive`) and `:101-102` (returned). `client/src/components/eval-case-editor/CaseRunStatus/CaseRunStatus.tsx:18-25,31-35` (new `live` prop, default true). `client/src/components/eval-case-editor/EditorModal/EditorModal.tsx` (`caseRunning` and `runBlock` use `!stalled` / `busyLive`; the stalled message renders inside the banner slot; carrier dialog `confirmDisabled={caseRun.busyLive}`). `client/src/components/eval-case-editor/styles.ts` (`stalled`). New tests: describe "CaseEditor stalled run (EC-23, EC-24, AC-42)" at the end of `client/src/components/eval-case-editor/CaseEditor/CaseEditor.run.test.tsx`. |

**What changed**
- `useCaseRun` now returns `stalled` (the 3 / 6 minute cap reached, or a failed poll) and `busyLive`. `busyLive` is the previous `busy` except that a stalled case run no longer counts. A set run of the owner or a start in flight still counts.
- The Evals tabs still use `busy` and `runningCaseId`, because AC-49 still applies there. Their behaviour is unchanged.
- `CaseRunStatus` has a new `live` prop. With `live={false}` it renders only the timeout sentence, the poll-failed message and **Retry**, with no `aria-live` of its own.
- `EditorModal` puts the timed-out sentence and the poll-failed message with **Retry** inside the existing `role="status"` / `aria-live="polite"` banner slot, under the banner and above the buttons. That is still one live region.
- The running banner is not shown as active while stalled. **Run case** and the carrier confirm use `busyLive`, so the "A run is in progress" hint no longer stays forever.
- **Retry** is `run.retry`: it clears the stall and resumes following. When the run finishes, the case detail is invalidated and the banner shows the result.
- No second toast was added. The kit-`Modal` fitted width, `type="button"` on the Retry button, and the editor portal and tree slots are untouched.

**Tests** (in the existing `CaseEditor.run.test.tsx`, three added)
- EC-23: the 3-minute cap is simulated by mocking `Date.now`. The test checks the sentence "The eval run is still in progress — reload to check its status" is shown in the modal, "Running…" is gone, **Run case** is enabled again, and the live-region count is unchanged (the slot is the one region).
- EC-24: a failed poll shows "Couldn’t refresh the run status." and **Retry**, with "Running…" gone and polling stopped (no further reads). After Retry, "Last run passed" is shown, and the message and Retry button are gone.
- A finding-card-like mount (seeded draft, Run on save, no tab behind): the poll fails and the message and **Retry** appear in the modal.

**Gates**
- `./scripts/check.sh client typecheck`: PASS client:typecheck 2s
- `./scripts/check.sh client lint`: PASS client:lint 3s
- `./scripts/check.sh client arch`: PASS client:arch 1s
- `./scripts/check.sh client test`: PASS client:test 20s (790 passed (790))

**Browser check** (Playwright, throwaway script). The agent has no cases, so I faked the case list, case detail, overview (`running_case_run`) and `GET /eval-runs/fake-run` (running once, then 500) with `page.route`. Everything is client-side, so nothing was created or saved in the DB. Rects are `[left, top, right, bottom]`.

| viewport | dialog | banner slot (message + Retry) | Cancel / Run case / Save | form bottom |
|---|---|---|---|---|
| 1280x720 | 100,74,1180,646 | 125,554,1155,587 | 597–629 for all three | 537 |
| 768x600 | 28,54,740,546 | 53,454,715,487 | 497–529 for all three | 437 |
| 700x600 | 28,50,672,550 | 53,459,647,492 | 502–533 for all three | stacked layout, body scrolls |

- The slot text reads "Couldn’t refresh the run status.Retry".
- **Run case** is not disabled in any of the three runs, so the hint was dropped.
- The message sits above the buttons and below the form, with no overlap.
- The dialog stays inside the viewport at every size.
- I did not check the 3-minute timeout sentence in the browser; it is covered only by the unit test.