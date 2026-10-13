## Hand-back 1

## Verdict (verify 1b)
AC-25 moves from Fail to Pass. The portal change does not break any of the rows you listed. No non-Pass rows. Delta saved to `/Users/harlock/Downloads/Sites/devdigest/.claude/sdd/SPEC-10/verify-1b.md`.

**AC-25: Pass.**
- `resolveExpectationTitle` in `server/src/modules/eval/helpers.ts` takes the edited title when the body carries it (`null` clears it), otherwise the stored one.
- `updateCase` in `server/src/modules/eval/service.ts` uses it in both the in-place and replace branches. `updateCaseInPlace` writes `expectedOutput`.
- The client sends the title in the PATCH. `buildCaseUpdate` sends the full `expectation`, with `title` defaulting to `null`, whenever `expectedComparable` differs.
- I traced `classifyEdit` and `resolveExpectationTitle` with a tsx script:

| Case | Result |
|---|---|
| manual, title changed | `in_place`, title persisted |
| manual, title `null` | `in_place`, title cleared |
| manual, title omitted | `in_place`, stored title kept |
| finding-sourced, title changed | `locked` |
| finding-sourced, title `null` vs stored | `locked` |
| finding-sourced, unchanged title echoed | `in_place` |
| finding-sourced, title omitted | `in_place` |

- The script exercised only the two helpers. It did not exercise the service or DB persistence path.

**EC-6 / EC-7: Pass.** Finding-sourced cases stay input-locked. In finding mode the client sends only `name` and `notes`.

**Portal change: no break (read-only).**
- `createPortal(<div onClick=stopPropagation><CaseEditor seed onClose onSaved/></div>, document.body)` sits under the same `seed && editorOpen` gate. Props and hooks are unchanged.
- That covers AC-1, AC-5, AC-9, AC-10, AC-11 and EC-1 to EC-5.
- Client vitest on EvalCaseButton, FindingCard, FindingsPanel, CaseEditor and eval-case-editor passes: 6 files, 79 tests. It includes a new test for the portal and the click stop.

**Gate:** `cd server && pnpm exec vitest run eval-cases skill-eval eval.it` passes, 5 files and 107 tests, with Docker up.

**Gap, not a Fail:** no automated test covers the AC-25 title PATCH. `helpers.test.ts` and `eval-cases.it.test.ts` have no case for `expectation.title` changed, omitted or `null` on PATCH. The Pass rests on code reading plus my tsx trace, so adding a regression test is worth considering.