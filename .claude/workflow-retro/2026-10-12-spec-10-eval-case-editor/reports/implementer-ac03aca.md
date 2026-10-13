## Hand-back 1

## Implementation report: SPEC-10 Phase A, W3-A client (A11-A18)

All client gates pass at the end of the run. The manual browser check (A22) is not done, so the layout is verified only by style unit assertions and height arithmetic.

### Files changed (client only; no server and no vendor edits)
- **Hooks**
  - `lib/hooks/eval.ts`: added `useEvalCaseDraft(findingId, enabled)`, `findingCaseRejection`, a `draft` query key, and an optional `EvalCaseInput` on `useCreateEvalCaseFromFinding`. It now also resolves `rejected` for `validation_error` and `frozen_diff_too_large`, and invalidates `findingSkillsAll`, case links and owner case lists.
  - `lib/hooks/skill-eval.ts`: `useCreateSkillCaseFromFinding` takes an optional input, and `200` resolves as `exists`.
  - `lib/api.ts` (outside your owned list, see deviation 1): added `apiFetchWithStatus` / `api.postWithStatus`.
- **KPI cards (A12):** moved to `components/eval-kpi-cards/` (git mv). It now takes `EvalMetrics | null` props and renders the "Scoring is mechanical…" caption.
- **Case Editor rewrite (A13), `components/eval-case-editor/`**
  - Rewritten: `EditorModal`, `CaseEditor`, `helpers.ts`, `constants.ts`, `styles.ts`, `index.ts`.
  - New sibling folders: `TypeBanner/`, `OwnerPicker/`, `InputTabs/`, `ExpectedOutputPane/`, `ActualOutputPane/`.
  - New file: `use-narrow-viewport.ts`.
  - Deleted: `CaseFields/`, `ReadOnlyCase/`, `DiffPreview/`, `CaseFacts/`.
  - `helpers.ts` holds the parser (10,000-byte cap before parse, one-object array, six-key whitelist, `__proto__`/`constructor` rejected, type from the switch), the skeleton builder, the key-order-insensitive dirty check and the files-from-diff list.
- **Finding card (A14, A15)**
  - `EvalCaseButton` rewritten. It fetches the draft on click, shows the 422 messages next to the control, applies the disabled/tooltip rules, and shows "In eval set" only when the agent and every skill have a case.
  - `FindingCard.tsx`, `FindingCard/helpers.ts` and `FindingCard/constants.ts` updated; `FindingsPanel.tsx` no longer creates cases.
  - `SkillEvalMenu/` deleted, with `skillEval`, `SKILL_REJECTION_KEY`, `skillEvalsTabHref`, `skillMenuState` and the `prReview` `skillEval.*` block removed. A grep of `client/src` and `client/messages` finds none of them.
- **Evals tabs (A16)**
  - `components/eval-case-row/`: new row layout with status icon, badge, result line with recall, tag, **Edit** with icon and text, and delete.
  - `case-state-label`: new `showText` prop.
  - Agent `EvalsTab` and skill `EvalsTab` rebuilt with the "EVAL METRICS" label and shared KPI cards (skill uses the with-skill arm), the "{passed}/{scored} passing" pill, "{n} cases", **Run all evals** secondary then **New eval case** primary. `RunAllEvals` is now secondary.
  - Skill tab: lift line and Metric trend moved under the KPI cards, per AC-31.
- **Messages (A17):** `messages/en/eval.json` and `prReview.json` updated; unused keys of removed UI dropped.
- **Tests (A18, existing files only):** `FindingsPanel.test.tsx` (mock retargeted to `useFindingSkills` and `useEvalCaseDraft`), `FindingCard.test.tsx`, `EvalCaseButton.test.tsx`, both `EvalsTab.test.tsx`, `CaseEditor.test.tsx`, `eval-case-editor/helpers.test.ts`, and `test/i18n-key-coverage.test.ts`. I added a few assertions inside those existing files for the parser, the layout styles and the seeded flow, and created no new test files.
- **i18n coverage test (A17):** removed the `SkillEvalMenu` root and added `EvalCaseButton` and `eval-kpi-cards`. The real count is now 97 files and 173 `t()` uses, so the floors went to `> 90` and `> 160` (were 20 and 80).

### Gate results
- `./scripts/check.sh client typecheck`: PASS
- `./scripts/check.sh client lint`: PASS
- `./scripts/check.sh client arch`: PASS
- `./scripts/check.sh client test`: PASS (684 passed)
- Inner-loop `related` runs were all PASS.
- i18n keys exist: the coverage test passes, and a script resolved every literal key, every dynamic prefix, the `PROBLEM_KEYS` / `REJECTION_KEYS` values and the `expected.reasons.*` and `input.tabs.*` families against `messages/en/eval.json` and `prReview.json` with none missing.

### Deviations and ambiguities
1. **`lib/api.ts` edit (not in your owned list).** `api.post` cannot expose the HTTP status, and the skill route's `200` (existing case) must be told apart from `201`. I refactored it additively into `request` and `readBody`, keeping `apiFetch` identical, and added `apiFetchWithStatus` and `api.postWithStatus`. Revert it if you object; the alternative is a status heuristic, which I judged flaky.
2. **Hook call shapes.** Existing `eval.test.tsx` and `skill-eval.test.tsx` still pass unchanged. The mutation variable is a union (`string | {findingId, input?}` and `string | {skillId, input?}`), so the old `mutate("f1")` calls keep working.
3. **`EvalKpiCards` props.** It now takes `EvalMetrics | null`, not `EvalRunRecord`, so the skill tab can pass `latest.with`. Deltas and captions are unchanged.
4. **Owner picker placement.** I put it in the kit `Modal` `subtitle` slot (the header), so the left column order stays banner, Name, Input per AC-15.
5. **Notes field.** It sits beside Name in the left column, because AC-13 requires notes to stay editable.
6. **Row layout.** I dropped the `file:lines` location from `EvalCaseRow`, because AC-29 lists no location and SPEC-10 overrides the old row. The full name stays in `title`.
7. **Negative banner text.** AC-16 is ambiguous. Positive reads `MUST find "{title}" at {file}:{line}`; negative reads `MUST NOT flag at {file}:{line}` with no title.
8. **Layout approach.** Inline styles cannot hold a media query, so `use-narrow-viewport.ts` (matchMedia, `useSyncExternalStore`) stacks the columns below 768px. Wide, the form has `height: clamp(300px, calc(100vh - 340px), 640px)`, `min-height: 0` and `overflow: hidden`, as do both columns, and each text pane scrolls inside itself. The kit `Modal` is untouched. The 340px deduction is my estimate of header plus footer height at 1280x720, so please confirm it in the browser.
9. **Skill-tab pill.** It counts from the latest run's with-skill arm (existing `passingCounts`) and falls back to "0/0 passing" when there is no run. The row list is not used for the count.
10. **Extra guard in `FindingsPanel.tsx`.** The j/k/a/d window shortcuts now ignore keys typed inside `[role="dialog"]`, so keys pressed in the Case Editor cannot accept or dismiss a finding.
11. **Stash incident.** At one point I ran `git stash` and `git stash pop` in the shared tree, for roughly 2 seconds, to count baseline i18n uses. It restored cleanly (stash list is empty, no conflict markers, W2-A's server changes still present), but if W2-A saw a transient file revert, that was me.

### Handoff note
- **A22 manual browser check is still required:** 1280x720 and 768x600, from a decided finding and from a stored case. Nothing in this run was seen in a browser.
- **Unused keys in `skills.json`.** `skills.json` `evals.noPassing` is now unused; I did not touch it, since it is not an owned file.
- **Unreviewed items.** Architecture and security review are untouched; the new `api.ts` helper and the UI-1/UI-2 parser in `eval-case-editor/helpers.ts` are the spots to look at.
- **Phase B items intentionally absent:** the Run on save toggle, Run case, row **Run**, the banner content, the carrier-dialog move, and the empty banner slot is a `role="status"` div with `data-slot="result-banner"` in the footer.

---

## Hand-back 2

Fix mode, SPEC-10 Phase A: the translucent modal is fixed in code, but I did not check it in a browser. I have no browser tool, so I could not take the screenshot or confirm the modal is opaque with the dimmed page behind it. Please confirm on the PR #11 finding that is already accepted. I did not click Save or touch any finding.

All four client gates pass: `typecheck`, `lint`, `arch` and `test` (685 passed).

**What changed**
- **Modal rendering (the defect).** In `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/EvalCaseButton/EvalCaseButton.tsx`, the `CaseEditor` is now portaled to `document.body` with `createPortal`. It therefore no longer sits inside the card's `opacity: 0.6` / `overflow: hidden` stacking context. `vendor/ui/kit/Modal.tsx` is untouched.
- **Clicks.** The portal content is wrapped in a div with `onClick={(e) => e.stopPropagation()}`. React events still bubble through a portal to the card, so this keeps a click inside the modal from reaching it. The card's expand/collapse toggle is only on its header, not on the body that holds the button.
- **Focus.** An effect on the open/closed transition returns focus to the "Turn into eval case" button when the editor closes. If the save turned the control into the "In eval set" link, the button is gone and there is nothing to focus.
- **Keyboard guard.** I did not change it. `FindingsPanel` uses a window `keydown` listener with `target.closest('[role="dialog"]')`, which is DOM-based, so it still matches after the dialog moves to `<body>`. Escape is also unchanged, since `useEscapeKey` listens on `window`.
- **Owner picker (verifier note).** In `client/src/components/eval-case-editor/OwnerPicker/styles.ts`, the picker now has `maxHeight: 60` and scrolls vertically, so the header holds to about 2 rows however many skills there are.
- **Test.** I added one case to the existing `EvalCaseButton.test.tsx`. It asserts the dialog is not inside the render container and that a click in it does not reach a parent `onClick`.