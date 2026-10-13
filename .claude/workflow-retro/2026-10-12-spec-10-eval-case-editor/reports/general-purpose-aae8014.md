## Hand-back 1

Review of Phase A (git diff 986e61f plus the untracked files). I found one CRITICAL, one reachable WARNING, and two WARNINGs at confidence 0.6. The server side is otherwise clean.

| severity | file:line | defect | failing input |
|---|---|---|---|
| CRITICAL | client/src/components/eval-case-editor/ExpectedOutputPane/ExpectedOutputPane.tsx:59 (inside the `<form>` at EditorModal/EditorModal.tsx:278) | The "+ Finding skeleton" button has no `type`. The kit `Button` (vendor/ui/primitives/Button.tsx) spreads `...rest` onto a bare `<button>`, so it defaults to `type="submit"`. Clicking it fills the skeleton and then fires the form's `onSubmit`, which calls `save()`. | Open the editor from a finding (seeded draft; name, title and expected are all valid) and click "+ Finding skeleton". The case is POSTed and the modal closes, with the owner chosen by default and no review. When editing a stored manual case it sends a PATCH. A changed expectation classifies as `replace`, so the old case id is replaced and its history is lost. On a blank new case with an empty name, the click marks every field as touched and shows validation errors the user did not trigger. The existing test at CaseEditor.test.tsx:146 only passes because the name is empty at that point. |
| WARNING | server/src/modules/eval/service.ts:277-283 (`freezeCaseInput`) vs service.ts:127-133 (`draftFromFinding`) | The draft is grounded with the finding's `kind`, so full-file kinds (`secret_leak`, `lethal_trifecta`, `phantom`, `hook`) only need the file in the diff. Save re-grounds through `freezePastedDiff` with no `kind` (`FreezeTarget.kind` is optional), so the strict hunk-intersection check applies. | A finding with `kind: 'phantom'` or `'secret_leak'` at lines 1-1 in a file whose hunks start at line 40. The draft returns 200, and saving the unedited draft returns 422 `range_outside_diff`. The editor shows "PR changed", although nothing changed. confidence 0.6 |
| WARNING | client/.../EvalCaseButton/EvalCaseButton.tsx:69 (early `return` for `in_set`) together with hooks/eval.ts `useCreateEvalCaseFromFinding.onSuccess` | On a 409 `eval_case_exists`, or a skill 200, the hook invalidates the links and finding-skills queries and the skill hook sets `has_case`. When that owner was the last free one (typical case: an agent with no skills), `everyOwnerHasCase` becomes true. The component then returns the "In eval set" `Link` and unmounts the portaled editor, so the "already has a case" message at EditorModal.tsx:~248 never stays visible. EC-5 says to keep the modal open. `requested` also stays true, so the editor can reopen from the stale seed if the state later returns to `ready`. | Agent-only review. The agent has a case made in another tab. Click Turn into eval case, then Save. The modal disappears and no message is shown. confidence 0.6 |
| WARNING | client/src/components/eval-case-editor/EditorModal/EditorModal.tsx:220 (`setTakenOwners([])` in the picker's `onChange`) | Picking another owner clears the record that an owner already has a case. `isFree` then treats that owner as free again, so it is re-enabled and loses its "In eval set" link. | Owners [agent, skillA, skillB]; the draft says the agent has no case but it does. Save returns 409 and the agent is marked taken. Pick skillB. The agent radio is enabled again, and choosing it and saving returns 409 again. confidence 0.6 |

Checked and found correct (no defect):
- Expected-output parser: the cap is checked before `JSON.parse`, and the key whitelist rejects `__proto__` and `constructor`.
- Dirty check and `buildCaseUpdate` agree with each other.
- `draftFromSeed` and `buildCaseInput`.
- Escape handling: the kit Modal has no Escape handler of its own, so there is no double handling with `useEscapeKey` and the discard dialog.
- Portal wrapper stops click bubbling only.
- `useEvalCaseDraft` (`gcTime: 0`, no refetch on focus): the editor is not unmounted by a background refetch.
- `postWithStatus` and the 200/201 mapping.
- Server `draftFromFinding` check order.
- `createFromFinding` and `createFromFindingForSkill` with `input`: name, notes, `source_finding_id` and `input_meta` are stored correctly.
- `freezeCaseInput` is shared with `createManualCase`. Manual title handling is correct, since `effectiveExpectation(exp, exp.title)` stores the title that used to be dropped.
- `resolveExpectationTitle` and `classifyEdit`: a title the body does not carry does not lock a finding-made case.
- `toLatestResult`, `toSkillDetailLatest` and `findingsOf`.
- The optional-body hand parse in routes.ts: no body gives the old behaviour, and a malformed body gives 422.
- Row result text and recall, and both tabs' pill and KPI derivation.
- `useNarrowViewport`.
- All i18n keys the new code reads exist in eval.json and prReview.json.

```findings-json
{
  "reviewer": "bug",
  "findings": [
    {
      "severity": "CRITICAL",
      "title": "Finding skeleton button submits the editor form and saves",
      "file": "client/src/components/eval-case-editor/ExpectedOutputPane/ExpectedOutputPane.tsx",
      "start_line": 59,
      "end_line": 59,
      "rationale": "The kit Button spreads ...rest onto a bare <button>, so with no type it defaults to submit. The button sits inside the <form onSubmit={save}> in EditorModal.tsx:278. Clicking '+ Finding skeleton' sets the expected text and then triggers save(): a seeded draft is created and closed unreviewed, a stored manual case is PATCHed (an expectation change classifies as replace, which swaps the case id and drops its history), and a blank case gets every field marked touched.",
      "suggestion": "Pass type=\"button\" on the skeleton Button (and on any other kit Button rendered inside the form). Add a test that clicking the skeleton on a valid seeded draft sends no request and leaves the editor open.",
      "confidence": 0.85
    },
    {
      "severity": "WARNING",
      "title": "Draft grounds with finding kind but Save re-grounds without it",
      "file": "server/src/modules/eval/service.ts",
      "start_line": 277,
      "end_line": 283,
      "rationale": "draftFromFinding (service.ts:127-133) calls freezeFileDiff with kind: ctx.finding.kind, so full-file kinds (secret_leak, lethal_trifecta, phantom, hook) only need the file present (grounding.ts FULL_FILE_KINDS). freezeCaseInput calls freezePastedDiff without kind, so the strict hunk-intersection check applies and an unedited seeded draft can be rejected with range_outside_diff.",
      "suggestion": "Carry the finding's kind through for the finding routes: pass ctx.finding.kind into freezePastedDiff's target when insertFindingCase has an input, but only when the expectation's file and lines still equal the finding's.",
      "confidence": 0.6
    },
    {
      "severity": "WARNING",
      "title": "409 on the last free owner unmounts the editor instead of keeping it open",
      "file": "client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/EvalCaseButton/EvalCaseButton.tsx",
      "start_line": 69,
      "end_line": 79,
      "rationale": "After an eval_case_exists 409 (or a skill 200) the hook invalidates the links and finding-skills queries and the skill hook marks has_case. everyOwnerHasCase then turns true and the component returns the In eval set Link early, which unmounts the portaled CaseEditor. The 'already has a case' message (EC-5: keep the modal open) is lost, and requested stays true so the editor can reopen from a stale seed if the state later returns to ready.",
      "suggestion": "Keep rendering the editor portal while requested is true (compute the early In eval set return only when no editor is open), or reset requested when the editor unmounts. Show the exists message in the editor before the card flips.",
      "confidence": 0.6
    },
    {
      "severity": "WARNING",
      "title": "Changing the owner clears the record of owners that already have a case",
      "file": "client/src/components/eval-case-editor/EditorModal/EditorModal.tsx",
      "start_line": 220,
      "end_line": 220,
      "rationale": "onChange calls setTakenOwners([]), but isFree and the OwnerPicker `taken` prop depend on that set. An owner that returned 409 becomes selectable again with no In eval set link, so it can be picked and saved into another 409.",
      "suggestion": "Keep takenOwners across owner changes and clear only the message (for example track the last-taken owner separately, or hide the message when the picked owner differs).",
      "confidence": 0.6
    }
  ]
}
```

---

## Hand-back 2

Round 2 re-review. B1, B2 and B4 are fixed; B3 is still open. I also found no new problems on the lines the fixes added or changed.

| id | status | evidence |
|---|---|---|
| B1 | fixed | `ExpectedOutputPane.tsx:59` now has `type="button"`. The other kit Buttons are outside the form: the footer Buttons at `EditorModal.tsx:254-264` and the `DiscardDialog` buttons are in the Modal footer, not under `<form>` at `EditorModal.tsx:278`. The tab and type-switch buttons already had `type="button"`. The new test `CaseEditor.test.tsx:477` covers the skeleton click. |
| B2 | fixed | `service.ts` `freezeCaseInput(input, finding?)` passes `finding.kind` only when `exp.file`, `start_line` and `end_line` equal the finding's own. `insertFindingCase` passes `ctx.finding` on the input path, and `createManualCase` passes none. An unedited full-file-kind draft now saves; an edited location gets the strict hunk check. |
| B3 | still-open | The editor portal is now rendered in both branches and gated by `requested`, but the two branches have different root elements. `EvalCaseButton.tsx:90-98` returns a Fragment for `in_set`, and `EvalCaseButton.tsx:110-140` returns `<div style={s.wrap}>`. When the state flips from `ready` to `in_set`, React sees a different root type and unmounts and remounts the whole subtree, including the portaled `CaseEditor`. |
| B4 | fixed | `onChange` at `EditorModal.tsx:220` no longer clears `takenOwners`. After an "exists" answer `done` sets `picked` to the taken owner (`EditorModal.tsx:~176`). `chosen` then becomes null, the radio stays disabled with its In eval set link, and Save is disabled until another owner is picked. The message at `EditorModal.tsx:~236` shows only while the taken owner is the picked one. |

**B3 failing input:** an agent-only review where the agent already has a case made in another tab.
1. Click Turn into eval case, then Save.
2. The hook invalidates the links query and the refetch flips the card to `in_set`.
3. The editor is remounted with fresh state: edits, `takenOwners` and `picked` are gone.
4. The "already has a case" message is lost, and the owner picker shows the stale draft where the agent looks free again.

Fix: use the same root element in both branches, for example a single wrapper that holds the Link or the button plus `{editor}`, or a Fragment in both returns with the editor at a fixed position.

```findings-json
{
  "reviewer": "bug",
  "findings": [
    {
      "severity": "WARNING",
      "title": "409 on the last free owner unmounts the editor instead of keeping it open (still open: B3)",
      "file": "client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/EvalCaseButton/EvalCaseButton.tsx",
      "start_line": 90,
      "end_line": 140,
      "rationale": "The editor portal is rendered in every state, but the in_set branch returns a Fragment (line 91) and the other states return <div style={s.wrap}> (line 111). When the 409 refetch flips the state ready -> in_set, the root element type changes, so React remounts the subtree and the CaseEditor loses its edits, takenOwners and picked. The EC-5 message disappears and the picker shows the stale draft.",
      "suggestion": "Give both branches the same root element (one wrapper with the link or button and {editor} as a stable child) so the portal's position in the tree does not change when the state flips.",
      "confidence": 0.75
    }
  ]
}
```

---

## Hand-back 3

Round 3: B3 is resolved, and I found no new problems on the lines the fix touched. I traced it by reading `EvalCaseButton.tsx` only; I did not run the new `EvalCaseButton.test.tsx`.

**B3 trace:**
- **Same root and slots.** Every state now returns one `<div style={s.wrap}>` (`EvalCaseButton.tsx:103`). Its children are a fixed three-slot sequence: the in_set Link or the button span (`:104-132`), the error block or null (`:133-137`), and `{editor}` (`:138`). When the state flips from `ready` to `in_set`, the portal stays at the same position under the same parent type, so React does not remount the portaled `CaseEditor`. The editor keeps its `edits`, `picked`, `takenOwners` and the "already has a case" message.
- **The editor is not gated on the state.** `editor` renders when `seed && editorOpen` (`:74-82`), and `editorOpen = requested && !!seed && !draft.isFetching` (`:52`). None of these read `state`, `evalCase.link` or `skills`.
- **The 409 invalidations do not touch the draft.** The invalidations are `links`, `findingSkillsAll`, `casesAll` and `overview`; none matches `["eval-case-draft", id]`. So `draft.isFetching` stays false and the editor stays open.
- **No other unmount path.** `requested` is only cleared by `closeEditor`. After a successful save, `done` calls `onClose`, which is the intended close.

New-line checks: `hintRef` is null while in_set, but the focus effect uses `?.`, so it is safe. The only side effect is that focus is not restored to the control when the editor closes while the state is in_set. That is cosmetic, not a wrong-behaviour defect.

```findings-json
{
  "reviewer": "bug",
  "findings": []
}
```