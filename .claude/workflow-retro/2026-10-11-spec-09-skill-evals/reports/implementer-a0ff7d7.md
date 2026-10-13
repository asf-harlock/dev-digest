## Hand-back 1

## Implementation report: SPEC-09 Phase A, steps A11–A16 (client, workstream W3)

### Plan step → change
All skills for these files came from routing.json (bucket `frontend`: frontend-ui-architecture, next-best-practices, react-best-practices, security, typescript-expert, plus react-testing-library for `*.test.tsx`). They match the plan's skills table. Everything is under `client/`, absolute prefix `/Users/harlock/Downloads/Sites/devdigest/client/`.

1. **A11 Case Editor and relocations**
   - `src/components/eval-case-editor/` is new. It holds the `CaseEditor` modal in create, edit-manual and edit-finding (read-only) modes. Its parts are sibling folders `CaseEditor/`, `EditorModal/`, `CaseFields/`, `ReadOnlyCase/`, `CaseFacts/`, `DiffPreview/`, `Field/`, `DiscardDialog/`, plus `helpers.ts`, `constants.ts`, `styles.ts`, `use-escape-key.ts`.
   - `helpers.ts` is pure. It covers new-side paths, the chosen file's section, the UTF-8 byte check, validation, the dirty check, and the create/PATCH body builders. The PATCH body sends only the changed top-level keys, so a rename is exactly `{name}`.
   - Moved, behaviour unchanged: `CaseStateLabel` is now `src/components/case-state-label/`, and `DeleteCaseDialog` is `src/components/delete-case-dialog/`. `DeleteCaseDialog` gained an optional `ownerKind` prop for the skill wording.
   - `CaseBody` and `CaseNameForm` are folded into the editor. Their helpers and `helpers.test.ts` moved with only an import-path change; I appended new cases.
   - `DiffViewer`, `FileCard` and `CodeLine` take an additive `highlightRange` that outlines but never scrolls. `highlightLine` is untouched.
   - Case-row UI became shared `src/components/eval-case-row/EvalCaseRow.tsx` (see Decisions).
2. **A12 Hooks**
   - `src/lib/hooks/eval.ts`:
     - Added `useCreateAgentEvalCase`, `useUpdateEvalCase`, `caseSaveRejection`, `saveEvalCase`, and new `evalKeys` entries.
     - `useRenameEvalCase` is removed; `useUpdateEvalCase` replaces it.
     - `useDeleteEvalCase` now also invalidates the skill case lists, the finding→case links and the finding→skills queries.
     - The five 422 codes and a 413 resolve as `{kind:"rejected", code}`. 413 maps to `frozen_diff_too_large`.
     - Network errors, 5xx and 404 still throw, so the global toast fires once.
     - A replacing PATCH drops the cache of the case named in `replaced_from_id`.
   - New `src/lib/hooks/skill-eval.ts`: `useSkillEvalCases`, `useCreateSkillEvalCase`, `useFindingSkills(id, enabled)`, `useCreateSkillCaseFromFinding`.
3. **A13 Agent Evals tab**
   - `EvalsTab.tsx` now has a **+ New eval case** button next to Run all evals, and the empty state has a CTA plus the Pull Requests link.
   - A row click or the edit action opens the shared editor.
   - `EvalCaseList` now maps onto the shared `EvalCaseRow`, which has an edit action before delete.
   - The old `CaseModal` is deleted.
4. **A14 Skill Evals tab**
   - `app/skills/_components/SkillEditor/_components/EvalsTab/` now shows the "Eval cases" heading, "—" for the passing count, a disabled Run all evals with a tooltip, and **+ New eval case**.
   - Below that are the list (`SkillCaseList/`), the empty state (EC-29) and the editor and delete dialog.
   - `SkillEditor.tsx` passes `skill` to the tab. The "Run on evals" tooltip copy is updated.
5. **A15 FindingCard**
   - New `FindingCard/_components/SkillEvalMenu/`: a disclosure panel with a `ul` list, not a kit Dropdown, because items must be links and disabled states need reasons. It is mounted only while the card is expanded.
   - Disabled states: EC-35 (undecided) and EC-36 (no skill shaped the review), with accessible descriptions.
   - A skill that already has a case shows an "In eval set" link to `/skills/:id?tab=evals`. Picking another skill creates its case and flips the item.
   - 422s show inline and reuse the SPEC-08 texts (`SKILL_REJECTION_KEY` in `constants.ts`).
   - Escape closes the panel and returns focus to the trigger.
   - `FindingCard.tsx` and `FindingsPanel.tsx` are wired through a new opt-in `skillEval` prop; `helpers.ts` gained `skillMenuState`.
6. **A16 i18n**
   - `messages/en/eval.json`: the stale `caseEditor` block is replaced by the new keys (fields, problems, rejections, preview, discard, findingNote, createdManually). Also added `evalsTab.case.edit`, `caseModal.delete.bodySkill`, and an amended `evalsTab.empty.body` carrying the EC-45 sentence.
   - `messages/en/skills.json`: `evals.*` replaces the placeholder keys.
   - `messages/en/prReview.json`: new `skillEval.*` block.

### Tests run (inner loop plus a client-only full pass; the plan's outer loop is left to the caller)
- `./scripts/check.sh client typecheck` — PASS
- `./scripts/check.sh client lint` — PASS
- `./scripts/check.sh client arch` — PASS. I first hit `no-private-component-from-outside-app`, which forbids any `_components/` under `src/components/`. I restructured the editor's parts into sibling folders to fix it.
- `./scripts/check.sh client test` — PASS, 612 passed. I ran this once because it only touches client.
- New and extended tests:
  - `eval-case-editor/helpers.test.ts` (22)
  - `eval-case-editor/CaseEditor/CaseEditor.test.tsx` (9)
  - skill `EvalsTab.test.tsx` (4)
  - `SkillEvalMenu.test.tsx` (5)
  - `lib/hooks/skill-eval.test.tsx`
  - added cases in `lib/hooks/eval.test.tsx`, `FileCard.test.tsx` and the agent `EvalsTab.test.tsx`

### Existing test edits (NFR-16)
- **Agent `EvalsTab.test.tsx`**, EC-22 test. This is the only existing assertion I changed.
  - Test renamed "EC-22/EC-45".
  - The regex `/accept or dismiss findings on a PR, then click Turn into eval case/` is replaced by an exact match on the EC-45 sentence.
  - Reason: the empty-state copy is amended.
  - The row-click modal, the rename (PATCH body exactly `{name}`) and "Source no longer available" assertions pass unedited. The test's case has a source finding but no source, so it still shows "Source no longer available". Manual cases show "Created manually" and are covered by new tests.
  - Two new tests were added; no other assertion was touched.
- **`FindingsPanel.test.tsx`**: setup only, no assertion edited. It mocks `lib/hooks/eval` wholesale and has no `QueryClientProvider`, so the panel's new `SkillEvalMenu` would throw. I added a `vi.mock` for `lib/hooks/skill-eval`.
- **`FindingCard.test.tsx`** and **`EvalCaseButton.test.tsx`** are untouched and pass.
- **`FileCard.test.tsx`**: one new test appended.

### Self-check
- Diff matches the plan: yes, with the deviations and decisions below.
- Naming and "Do not touch" rules respected: yes. I did not touch `server/**` or the vendored contracts, and I used type imports only from `@devdigest/shared`. The severity and category enum values are mirrored in `eval-case-editor/constants.ts`, because a runtime shared import breaks `next build`.
- i18n keys exist in `messages/en/*.json`:
  - I ran a script over every changed non-test `.ts`/`.tsx` file. It checked each static `t("…")` against `eval.json`, `skills.json` and `prReview.json`, and also checked the key maps `PROBLEM_KEYS`, `REJECTION_KEYS` and `SKILL_REJECTION_KEY`. Result: 160 keys checked, 0 missing.
  - A second script confirmed every key in my three new blocks is referenced in `src`. I removed the one unused key it found.
  - The dynamic `evalsTab.case.state.${state}` key already existed.
  - Only the `en` locale exists.

### Deviations and decisions where the plan was silent
- **Shared `EvalCaseRow`.** The agent row and the skill row would have been near-duplicates, so I promoted the row to `src/components/eval-case-row/` and map both lists onto it. Agent behaviour is unchanged, and its tests pass.
- **Parts as sibling folders.** The plan said shared components may nest `_components/`, but `pnpm arch` forbids any `_components/` under `src/components/`. The editor's parts are therefore plain sibling folders, the same shape as `diff-viewer/`.
- **One dialog element across loading and loaded.** `EditorModal` stays mounted from loading to loaded, and the draft is the user's edits overlaid on the stored values. This keeps the unedited NFR-16 test, which holds a reference to the dialog node across the load, working.
- **Opt-in `skillEval` prop on `FindingCard`.** Without it, the existing `FindingCard` test, which renders an expanded card with `evalCase` and no query provider, would break. Only `FindingsPanel` passes it. Smart Diff cards show neither menu.
- **Editing rules.**
  - A case counts as finding-derived, and therefore read-only apart from name and notes, when it has a `source_finding_id`.
  - "Created manually" is shown only when there is no source finding and no `pr_number`.
  - A finding case whose source PR is gone still reads "Source no longer available".
- **Save button.** It is disabled when nothing changed or when a visible error exists. A click with untouched required fields marks them touched and sends nothing.
- **Save errors.** There is no inline error text for network or 5xx save failures (EC-9, no second toast). The old "Couldn't rename the case" inline message is gone with that change.
- **Skill tab.** It shows "—" for the passing count, with no trend placeholder and no effect label (both Phase B/C). The "Run on evals" tooltip is now "Running skill evals isn’t available yet — you can add and edit eval cases now."
- **Apostrophes.** The EC-3 message keeps the spec's straight apostrophe ("diff's"); the other catalogue strings use ’.

### Anything needed from the server that the contracts don't provide
- Nothing blocking.
- The client reads these ApiError properties:
  - `status`.
  - `code` for the five 422 codes on case writes and for `finding_undecided`, `skill_not_in_run`, `no_patch` and `range_outside_diff` on `POST /findings/:id/skill-eval-case`.
  - A bare 413 status, with no code required.
- It assumes `GET /eval-cases/:id` returns an `EvalCaseDetail` for skill-owned cases, with `source: null` and `latest_result: null` in Phase A.
- It assumes `GET /findings/:id/eval-skills` reflects a freshly created skill case, because the menu invalidates and refetches after the POST.

### Handoff note
- `git status` shows some of my paths as staged renames or deletions. The index changed because I used `git mv` and `git rm`; no commit was made.
- For architecture review:
  - The shared `EvalCaseRow` promotion.
  - The additive `highlightRange`, including the `scrollToHighlight` prop on `CodeLine`.
  - The `eval-case-editor` layout, where the helpers duplicate the server's pasted-diff reading as a preview aid only.
- For security review: every pasted or user-controlled string (diff, title, description, path, notes, skill names) is rendered as escaped React text. There is no `dangerouslySetInnerHTML`. The tests assert that no `<b>`, `<img>` or `<script>` element reaches the DOM.
- The end-of-session `engineering-insights` entry (client) is not written. Two candidates: `src/components/**` may not contain `_components/`, and `FindingsPanel.test.tsx` mocks `lib/hooks/eval` wholesale, so any hook added to the panel path needs its own mock.