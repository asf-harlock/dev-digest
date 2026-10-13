## Hand-back 1

## Fix mode: SPEC-09 review round 1 (B1, B2, B3)

| id | status | evidence file:line |
|---|---|---|
| B1 | fixed | `client/src/app/skills/_components/SkillEditor/use-skill-eval-flow.ts:28-37` (new `flowSkillId` state; when the skill id changes, `dialogOpen`, `startedRunId` and `finished` are reset during render). Test: `use-skill-eval-flow.test.tsx` ("B1: switching skill id drops…") |
| B2 | fixed | `client/src/components/eval-case-editor/helpers.ts:~318-352` (new `comparable()`, `isDirty` rewritten on it, new `hasUpdate()`; the duplicate `emptyToNull` was moved above them). `client/src/components/eval-case-editor/EditorModal/EditorModal.tsx:~102-107` (an empty `buildCaseUpdate` result now calls `onClose()` and sends no request). Tests: 3 new in `helpers.test.ts` (B2/AC-14) and 1 in `CaseEditor.test.tsx` (B2/AC-14) |
| B3 | fixed | `server/src/modules/eval/repository.ts:~423-441` (`replaceCase`: delete the old row first with `.returning({id})` and throw `NotFoundError(NOT_FOUND.case)` on 0 rows; then insert). Imports on L16-17. Tests: new `server/test/eval-cases-race.it.test.ts` |

Notes per finding:
- **B1:** I did not key `<SkillEditor key={skill.id}>` in `skills/[id]/page.tsx`. I reset inside the hook instead (your fallback), because that behaviour can be tested directly with `renderHook`. `page.tsx` is unchanged. The test also checks that the state is kept when the id does not change.
- **B2:** `isDirty` now compares the same normalised values `buildCaseUpdate` uses: trimmed name and title, `parseLine` for line numbers, empty description or notes as null, the resolved file, and no severity or category on `must_not_flag`. A half-typed line such as "abc" still counts as dirty, so the discard prompt (EC-8) is kept. A whitespace-only edit or "5" to "05" leaves Save disabled and does not trigger the discard prompt. No contract or vendor change.
- **B3, why no `FOR UPDATE`:** the delete-first statement takes the row lock itself. A racing delete or replace blocks until the first transaction commits, then deletes 0 rows, throws and rolls back.
- **B3, 404 mapping:** `NotFoundError` is thrown straight through `service.updateCase`. That is the same 404 and message ("Eval case not found") an unknown case gets, so `service.ts` needed no change.
- **B3, tests:** three Docker tests in the new file. They cover two concurrent replacing PATCHes (one 200, one 404, exactly one row), a `replaceCase` after a DELETE (rejects with 404, no rows), and a PATCH and a DELETE racing (never both succeed). I temporarily removed the zero-row check and all three tests failed; I then restored the real code.
- **B3, no hermetic test:** the hermetic `service.test.ts` stub (`replaceCase`) never models the transaction, and the service code did not change, so there was nothing meaningful to add there.

Gates:
- PASS `check.sh client typecheck`
- PASS `check.sh client lint` (on the changed files)
- PASS `check.sh client arch`
- PASS `check.sh client related` (70 passed; an earlier run on the B1 files passed 21 and one on the B2 files passed 68)
- PASS `check.sh server typecheck`
- PASS `check.sh server lint` (`repository.ts` and the new test)
- PASS `check.sh server arch`
- PASS `check.sh server related` (`repository.ts`, 30 passed)
- PASS `cd server && pnpm exec vitest run test/eval-cases-race.it.test.ts` (3 passed)
- PASS `cd server && pnpm exec vitest run test/eval-cases.it.test.ts` (24 passed; the existing replace/PATCH cases are not regressed)

Files touched:
- `/Users/harlock/Downloads/Sites/devdigest/client/src/app/skills/_components/SkillEditor/use-skill-eval-flow.ts`
- `/Users/harlock/Downloads/Sites/devdigest/client/src/app/skills/_components/SkillEditor/use-skill-eval-flow.test.tsx` (new)
- `/Users/harlock/Downloads/Sites/devdigest/client/src/components/eval-case-editor/helpers.ts`
- `/Users/harlock/Downloads/Sites/devdigest/client/src/components/eval-case-editor/helpers.test.ts`
- `/Users/harlock/Downloads/Sites/devdigest/client/src/components/eval-case-editor/EditorModal/EditorModal.tsx`
- `/Users/harlock/Downloads/Sites/devdigest/client/src/components/eval-case-editor/CaseEditor/CaseEditor.test.tsx`
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/repository.ts`
- `/Users/harlock/Downloads/Sites/devdigest/server/test/eval-cases-race.it.test.ts` (new)

Nothing in vendor, migrations or lockfiles was touched, and I did not touch the baseline flaky tests listed in `state.json`. The working tree has no fix baseline commit, so these changes sit on top of the other uncommitted SPEC-09 changes in the same files.