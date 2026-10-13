## Hand-back 1

All three round-1 bug findings are fixed, and I found no new problems on the lines the fix added or changed. This was a read-only review and I ran no tests.

| id | status | evidence |
|---|---|---|
| B1 | fixed | `client/src/app/skills/_components/SkillEditor/use-skill-eval-flow.ts:32-38` resets `dialogOpen`, `startedRunId` and `finished` during render when `skillId` changes. |
| B2 | fixed | `client/src/components/eval-case-editor/helpers.ts:316-339` makes `isDirty` compare `comparable()` values, and `EditorModal/EditorModal.tsx:102-106` closes on an empty `buildCaseUpdate` without sending a request. |
| B3 | fixed | `server/src/modules/eval/repository.ts:435-442` deletes with `.returning`, throws `NotFoundError` on 0 rows, then inserts, all in one transaction. |

**B1.** The reset-during-render pattern is correct React: calling `setState` on the component's own state while rendering makes React discard that pass and re-render before any child or effect runs.
- On the re-render, `followId` is `runningRunId ?? startedRunId`. `startedRunId` is now null and `runningRunId` comes from the new skill's overview query, which is keyed by skill id. The followed run and the disabled state cannot come from the previous skill.
- The polling hook's cache (`useRunPolling`) is keyed by run id, so a late response for skill A's run cannot become `run` for skill B.
- A start request still in flight for skill A cannot leak into B. `RunDialog` unmounts when `dialogOpen` resets (`SkillEditor.tsx:88`), and `RunDialog.tsx:44` uses a per-call `mutate` `onSuccess`, which does not fire after unmount.
- The new `use-skill-eval-flow.test.tsx` covers the reset of `followId`, `finished`, `dialogOpen` and `block`.

**B2.**
- `isDirty` now compares the same normalised values `buildCaseUpdate` uses: trimmed name and title, `emptyToNull` on description and notes, `parseLine`, `resolveFile`, and severity/category dropped for `must_not_flag`.
- I checked each field in both directions. Every dirty edit that passes validation builds a non-empty body. The one exception is two different unparseable line strings, which build the same body. `save()` blocks those at `EditorModal.tsx:94`, because `draftProblems` reports `lineInvalid`.
- The `hasUpdate` guard at `EditorModal.tsx:105` is a second safety net.

**B3.**
- Delete-first is safe on every path. A concurrent replace or DELETE that already took the row leaves 0 rows, so the call throws the same 404 `updateCase` gives for an unknown id, and the transaction rolls back.
- If the insert fails, the thrown error rolls back the delete too, so the case is not lost.
- The replacement is built in `service.ts:374-385` with `sourceFindingId: null` and `createdAt: row.createdAt`, so created_at inheritance holds.
- `replaced_from_id` is set by the service from `id` (`service.ts:386`), unchanged by this fix.
- The unique index on `source_finding_id`, owner kind and owner id cannot trip: the replacement carries a null finding id, and the old row is deleted first anyway.
- `insertCase` accepts the transaction handle, so its unique-violation catch is not reached here.
- `server/test/eval-cases-race.it.test.ts` covers two racing replaces, a DELETE landing before the replace, and a PATCH racing a DELETE.

**New findings:** none.

```findings-json
{
  "reviewer": "bug",
  "findings": []
}
```