## Hand-back 1

Bug review of SPEC-09 change (diff vs eefc3a4 plus untracked files). I found 3 WARNINGs and no CRITICALs. I read the server eval module (service, repository, helpers, arms, pasted-diff, routes), the skill-delete changes in `skills/service.ts` and `skills/repository.ts`, migrations 0022-0024, the vendored contracts, and the client hooks and components for Case Editor, skill run flow, MetricTrend and SkillEvalMenu. I also executed `freezePastedDiff`, `canonicalizeDiff` and `diffUnchanged` with tsx from the scratchpad (no repo files changed).

| severity | file:line | defect | failing input |
|---|---|---|---|
| WARNING | client/src/app/skills/_components/SkillEditor/use-skill-eval-flow.ts:26-36 | Run-flow state (`startedRunId`, `finished`, `dialogOpen`) lives in `SkillEditor`, which is not keyed by skill. `[id]/page.tsx` keeps `SkillEditor` mounted when you switch between two skills whose `useSkill` data is already cached, so skill A's `startedRunId` and `finished` leak into skill B. | Start a run on skill A (`startedRunId`=RA), then click a previously visited skill B in the rail. B's Evals tab follows RA, shows "Running case k of n", and both Run buttons stay disabled as "running" (`block` uses `run.isRunning`). After RA finishes, B shows A's finished message and error reason. |
| WARNING | client/src/components/eval-case-editor/helpers.ts:312 (`isDirty`) and :354-370 (`buildCaseUpdate`) | `isDirty` compares raw strings, but `buildCaseUpdate` compares trimmed or parsed values, so a change that is "dirty" but not a change builds `{}`. The server rejects `{}` with 422 `validation_error` ("Provide at least one field", service.ts:341). | Edit a manual or finding case name `"foo"` to `"foo "`, or the start line `"5"` to `"05"`, or add trailing whitespace to the title. Save is enabled, the PATCH body is `{}`, the server returns 422, and the editor shows the generic "invalid" rejection. The user cannot save and can only discard. |
| WARNING | server/src/modules/eval/repository.ts:427-439 (`replaceCase`) | The transaction inserts the replacement, then deletes the old case without checking that a row was deleted. `updateCase` reads the case (service.ts:339) before the transaction, so it can act on a case that is already gone. | Two concurrent `PATCH /eval-cases/:id` that both classify as replace: both insert, the second delete removes 0 rows, and the case is duplicated (two copies with the same `created_at`). Also, a `DELETE` of the case landing between `getCase` and the transaction is undone: the replacement is inserted and returned 200. Suggested fix: use `.returning()` on the delete and throw `NotFoundError` (rolling back) when it removes nothing. |

The areas you listed turned out as follows.
- **`replaceCase`:** `created_at` inheritance is correct. The unique index is not hit because the replacement's `source_finding_id` is null, and `replaced_from_id` is set only on the replace path (null in place). The only defect is the one above.
- **`classifyEdit`:** it compares against the stored case and the echoed-unchanged-fields logic is sound. The client sends only `{name, notes}` for finding cases, so the `locked` branch is not reachable from the UI. Only the whitespace-only case above is wrong.
- **`pasted-diff.ts`:** I ran hunks-only, `+++`-only, `---`/`+++`, git format, CRLF and lone-CR input. All freeze correctly. A missing fallback file returns `no_patch`, a `+++` for a different file returns `no_patch`, and an out-of-range new-side range returns `range_outside_diff`. `diffUnchanged` behaves as intended. The DiffViewer `highlightRange` uses new-side numbers (`add` and `ctx` only), which matches the server's grounding.
- **`startSkillRun` / `executeSkillRun`:**
  - The partial unique index and the 409 path with `run_id` are correct.
  - `isRunning` is checked before each arm's review, and progress is saved once per case.
  - A crash finalizes the run as `errored`.
  - `pairArms`, `computeLift` and `finalStatus` handle nulls correctly: a case errored in either arm is errored in both and drops out of the lifts, and the run is `partial` or `errored` as the spec says.
- **`skillOverview` and trend:** newest-first with limit 100, then reversed to chronological order. Only finished runs are included, and the trend columns match the contract.
- **`useRunPolling` / `useSkillEvalRun`:** the timeout and retry logic, invalidation after finish and the callbacks ref are fine. After a 20-minute timeout the skill `RunStatus` has no Retry, but that matches EC-19 ("reload to check").
- **MetricTrend:** the capture-phase Escape listener is registered only while a tooltip is open, and the pointer-leave and blur guards compare the index correctly.
- **SkillEvalMenu:** the fetch is enabled only when the finding is decided, and the loading, error and disabled states are consistent.
- **`RunDialog`:** closing it while the start request is pending still leaves the run followed, because the hook's `onSettled` refetches the overview and `running_run_id` takes over.

```findings-json
{
  "reviewer": "bug",
  "findings": [
    {
      "severity": "WARNING",
      "title": "Skill run-flow state leaks across skills when SkillEditor is reused",
      "file": "client/src/app/skills/_components/SkillEditor/use-skill-eval-flow.ts",
      "start_line": 26,
      "end_line": 36,
      "rationale": "startedRunId/finished are useState in SkillEditor, which page.tsx does not key by skill id; switching to another cached skill keeps the component mounted, so followId (runningRunId ?? startedRunId) points at the previous skill's run. B shows A's progress, disables its Run buttons as 'running', then shows A's finished status and error reason.",
      "suggestion": "Render <SkillEditor key={skill.id} ...> in skills/[id]/page.tsx, or reset startedRunId/finished/dialogOpen in an effect keyed on skillId inside useSkillEvalFlow.",
      "confidence": 0.65
    },
    {
      "severity": "WARNING",
      "title": "Whitespace-only edit is dirty but sends an empty PATCH that the server rejects",
      "file": "client/src/components/eval-case-editor/helpers.ts",
      "start_line": 312,
      "end_line": 370,
      "rationale": "isDirty compares raw draft strings while buildCaseUpdate compares trimmed/parsed values (name.trim(), parseLine, trimmed title). Changing name 'foo' to 'foo ' or line '5' to '05' enables Save but builds {}; updateCase answers 422 validation_error (hasUpdateFields false), shown as a generic invalid message, so the user can only discard.",
      "suggestion": "Make isDirty compare the same normalised values buildCaseUpdate uses (or treat an empty buildCaseUpdate result as not dirty / close without a request).",
      "confidence": 0.65
    },
    {
      "severity": "WARNING",
      "title": "replaceCase ignores a zero-row delete, so a racing PATCH/DELETE duplicates or resurrects a case",
      "file": "server/src/modules/eval/repository.ts",
      "start_line": 427,
      "end_line": 439,
      "rationale": "The transaction inserts the replacement then deletes oldId without checking the delete count; updateCase read the row before the transaction. Two concurrent replace PATCHes both insert (second delete removes 0 rows) giving duplicate cases; a DELETE between getCase and the transaction is undone because the replacement is inserted and returned 200.",
      "suggestion": "Use .returning({id}) on the delete and throw NotFoundError (rolling the transaction back) when no row was deleted; optionally lock the old row with SELECT ... FOR UPDATE first.",
      "confidence": 0.6
    }
  ]
}
```