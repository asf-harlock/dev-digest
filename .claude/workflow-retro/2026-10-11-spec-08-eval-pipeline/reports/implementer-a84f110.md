## Hand-back 1

## W3 report: steps 16–18 (Evals tab, PR page, escaped text)

Typecheck, lint and arch pass, but 7 existing `FindingsPanel.test.tsx` tests now fail. The panel calls the new hooks and the test supplies no `QueryClientProvider`; I did not touch the test file. Inner loop only.

### Files created
All under `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/`; each folder also has `index.ts`, and `styles.ts` / `constants.ts` / `helpers.ts` where needed.
- `EvalsTab.tsx`, `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts` — page layout, "View full dashboard →" link, empty/loading/error states, the open-case and delete-target state. Header "Eval cases" with "{passed} / {scored} passing".
- `_components/EvalKpiCards/` — four `MetricCard` tiles, with delta and captions rendered under each tile.
- `_components/EvalCaseList/` — rows with state icon and text, "expected n, got m", truncation with `title`, and a delete button per row.
- `_components/CaseStateLabel/` — icon plus text for passed, failed, errored and never run.
- `_components/CaseModal/` with `_components/CaseBody/` and `CaseBody/_components/CaseNameForm/` — frozen diff, PR title and body, expectation, source link or "Source no longer available", last result, rename with Save.
- `_components/DeleteCaseDialog/` — confirmation that names the case.
- `_components/RunAllEvals/` — start button and `aria-live="polite"` region, plus timeout and poll-failed notices with a Retry button.
- `FindingCard/_components/EvalCaseButton/` — the FlaskConical button, the "In eval set" link and the inline 422 error.

### Files changed
- `AgentEditor/constants.ts` — added the `evals` tab after `context`, with the FlaskConical icon.
- `AgentEditor/AgentEditor.tsx` — added the `evals` branch, rendered as `<EvalsTab key={agent.id} />`.
- `client/src/app/agents/[id]/page.tsx` — outside my ownership; I edited only the `VALID_TABS` constant to add `"evals"`, as you allowed.
- `FindingCard/{FindingCard.tsx,constants.ts,helpers.ts,index.ts}` — new optional `evalCase` prop, so `DiffTab`'s use of the card is unchanged and shows no button. The button state logic follows the server's check order: undecided, then agent missing.
- `FindingsPanel/FindingsPanel.tsx` — new optional `agentId` prop. It wires up `usePullEvalCaseLinks`, `useAgents` and `useCreateEvalCaseFromFinding`, keeps the last 422 per finding, and raises a success toast through `notify.success(t("evalCase.created"))`.
- `ReviewRunAccordion/ReviewRunAccordion.tsx` — outside my ownership; I added one line, `agentId={review.agent_id}`, because `FindingRecord` has no agent id and `FindingsPanel` would otherwise have no source for it. `FindingsTab` needed no change.

### Contract gaps and missing i18n keys
- No missing i18n keys; every key I used exists. The keys `evalsTab.noValue` and `states.error` are used as the em-dash and error title. `evalsTab.case.delete` is used for the list delete button.
- Unused keys, left alone: `errors.start*`, `evalsTab.newCase`, `evalsTab.passed`, `evalsTab.failed` and the `caseEditor.*` group. The start errors surface through the global toast, so I did not add an inline duplicate.
- No contract gaps. `EvalCaseDetail.source` gives the repo id and PR number, so the source link is `/repos/{repo_id}/pulls/{pr_number}`.

### Gates
- `./scripts/check.sh client typecheck` — PASS
- `./scripts/check.sh client lint` — PASS
- `./scripts/check.sh client arch` — PASS
- `./scripts/check.sh client related` on the changed files — FAIL, 7 failed, 16 passed. Log: `.claude/implementer/logs/client-related.log`.
  - All 7 failures are in `FindingsPanel.test.tsx`: `No QueryClient set` raised from `usePullEvalCaseLinks`.
  - W6 needs to mock `lib/hooks/eval` and `lib/hooks/agents` there, or wrap the render in a `QueryClientProvider`.
  - `AgentEditor.test.tsx` and `FindingCard.test.tsx` pass.

### Deviations
- **Step 18:** I did not add `components/diff-view/`. The existing `components/diff-viewer` `DiffViewer` is suitable: it draws every line as React text and has no `dangerouslySetInnerHTML`. The frozen diff is passed as a single `PrFile` with `additions` and `deletions` counted by `CaseBody/helpers.ts`.
- **Modal limits:** the vendored `Modal` has no focus trap, no `aria-labelledby` and no Escape handler. I added an Escape handler in `CaseModal` and `DeleteCaseDialog`; the case modal's handler is suspended while the delete dialog is open. There is no focus trap, because I can't edit the vendor kit.
- **KPI deltas:** `MetricCard`'s `delta` prop prints `abs(delta).toFixed(2)`, which is wrong for whole points. I pass only `label` and `value` to it and render the delta under each tile with `formatDeltaPoints`, plus a screen-reader sentence from `format.delta*`.

### Handoff for W6
- Test cases to cover: the button states (ready, creating, in set, disabled with the EC-1 and EC-2 tooltips), the inline 422 messages, the Evals tab empty state (EC-22), a case list with no finished run (EC-23), the case modal rename and delete, and the run flow with the live region.
- The `evals` tab key is also listed in `VALID_TABS` in `page.tsx`.

---

## Hand-back 2

The Traces card label bug is fixed and the gates pass. I did not edit any message file.

- **Fix:** `_components/EvalKpiCards/helpers.ts` now exports `KPI_LABEL_KEY`, which maps `traces` to the existing `tracesPassed` message key and leaves the other three cards unchanged. `EvalKpiCards.tsx` resolves the label through it: `t(\`evalsTab.kpi.${KPI_LABEL_KEY[k.key]}\`)`. The caption key `kpi.tracesCaption` already existed.
- **Test:** in `EvalsTab.test.tsx` I changed the single `it.fails("NFR-6/AC-35: every KPI…")` to `it(…)`. The stale "SOURCE BUG" comment above it is still there, and W6 can remove it.
- **Gates:** `check.sh client typecheck`, `lint` and `arch` all print PASS.
- **Tests:** `vitest run` on the EvalsTab folder passes, 2 files and 13 tests, including the flipped test.
- **Still open:** the 7 failures in `FindingsPanel.test.tsx` from my first report are not addressed here.

---

## Hand-back 3

| id | status | evidence |
|---|---|---|
| B1 | fixed | `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/CaseModal/_components/CaseBody/helpers.ts:21-37`. New `stripDiffHeaders` drops everything before the first `@@` line and returns the string unchanged when there is no `@@` line. `frozenDiffFile` now passes the stripped patch to `DiffViewer` and counts `+`/`-` lines from it. The stored `input_diff` is not modified, and `countPatchLines` is unchanged. |

I added `CaseBody/helpers.test.ts` with 4 tests. They check that header lines (`diff --git`, `+++ b/`) never reach the viewer's patch and that `additions` and `deletions` are 2 and 1.

Gates:
- `./scripts/check.sh client typecheck` — PASS
- `./scripts/check.sh client lint` — PASS
- `./scripts/check.sh client arch` — PASS
- EvalsTab tests (`vitest run` on the EvalsTab folder) — 3 files and 18 tests pass.