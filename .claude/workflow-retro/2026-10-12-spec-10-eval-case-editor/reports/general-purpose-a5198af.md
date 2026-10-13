## Hand-back 1

Phase B review (bug reviewer): one WARNING. I found no defects in the server changes or the client set-only/any-scope filtering; the client findings are below.

| severity | file:line | defect | failing input |
|---|---|---|---|
| WARNING | client/src/components/eval-case-editor/EditorModal/EditorModal.tsx:299 (banner) and :372-379 (`caseRunning`, `runBlock`); source of the dropped state is client/src/components/eval-case-editor/use-case-run.ts:60,99-102 | The modal never renders the poll-failed or timed-out state of the run it follows. `useCaseRun` returns `timedOut`, `pollFailed` and `retry`, and only `CaseRunStatus` (used by the two Evals tabs) shows them. When a poll fails, `useRunPolling` stops polling and the last cached run status stays `running`, so `inFlight` stays true. The banner then shows "Running…" and **Run case** stays disabled with "A run is in progress", with no message and no Retry. | Open the Case Editor from a finding card (nothing renders `CaseRunStatus` there) or from a tab, click **Run case** or save with **Run on save**, then drop the network. The first failed poll sets `pollFailed`, so polling stops and the banner shows "Running…" forever. The 3-minute cap is silent too (EC-23, EC-24 expect a sentence and Retry). |

Confidence is 0.65. The state clears only when the modal is closed. With a tab behind the modal, its own `CaseRunStatus` shows Retry, but that is hidden under the overlay.

Everything else I traced held up:
- **`repository.ts` scope filters:** every `evalRuns` select is correct.
  - Set-only: `agentRuns`/`skillRuns` (and so `latestFinished*`, `listRunSummaries`, `countFinishedRuns`, the skill summary and trend readers), `recentRunSummaries`, `runningRunId` and `runningSkillRunId`.
  - Any-scope: `getRunRow`, `deleteByAgent`, `deleteBySkill`, `reapRunning`, `saveProgress`, `isRunning` (via `runningRun`), `finalizeRun`, and `anyRunningRunId` behind both 409 lookups.
  - `runningCaseRun` is correct: case scope, running status, `case_set->0->>'id'`.
- **Single-flight:** the unique indexes do not depend on scope, so a case run and a set run of the same owner block each other.
- **`latestResultsByCase`:** the `DISTINCT ON` expression matches the leading `ORDER BY` key and the filters are right. The merge, the tie rule (a tie goes to the set run) and the errored placeholder for a crashed or reaped case run are right. Skill set sources require both arms.
- **Case-run path:** `startCaseRun` reads the frozen case once. A case run finalises as `completed` or `errored` and never `partial`. Cost is null when unpriced. It touches no review tables. `compare` returns 404 for a case run.
- **`POST /eval-cases/:id/run`:** body parsing is right. An absent or null body is accepted, `{}` or a malformed body gives 422, and the client sends no body for agent cases.
- **Client behaviour:**
  - `useStartEvalCaseRun` handles 202 and 409.
  - `useEvalRun` and `useSkillEvalRun` pass `timeoutMs` and invalidate `caseAll`.
  - The Run on save flow is correct: `onStay` (the replace case uses the new id), a rejected save starts nothing, and the skill case goes through the carrier dialog.
  - Escape guarding for the stacked dialog is correct.
  - The row Run disable logic and `use-skill-eval-flow` block are correct.
  - `modal-width.ts` is correct.
- **Contracts:** the two vendor copies are identical in the `scope` and `running_case_run` regions.

Cosmetic only, not reported: after a Run on save of a stored case, the draft briefly reverts to the old values until the case refetch lands.

```findings-json
{
  "reviewer": "bug",
  "findings": [
    {
      "severity": "WARNING",
      "title": "Case Editor modal shows Running forever when polling fails or times out",
      "file": "client/src/components/eval-case-editor/EditorModal/EditorModal.tsx",
      "start_line": 372,
      "end_line": 379,
      "rationale": "useCaseRun exposes timedOut, pollFailed and retry, but only CaseRunStatus (the Evals tabs) renders them. The modal footer renders only ResultBanner(running=caseRunning) and the Run case hint. When a poll fails, useRunPolling stops, the last cached run status stays running, inFlight stays true, and the banner reads Running with Run case disabled (A run is in progress) and no Retry. A modal opened from a finding card has no tab behind it, so there is no other place to recover. EC-23 and EC-24 require a sentence and a Retry action.",
      "suggestion": "Render the timed-out and poll-failed sentences plus a Retry button in the modal footer, for example by reusing CaseRunStatus with the caseRun flow. Stop showing the Running banner as active once pollFailed is true.",
      "confidence": 0.65
    }
  ]
}
```

---

## Hand-back 2

Round 2 re-review: B5 is resolved, and I found no new defects on the lines the fix added or changed.

**B5 trace**
- **Poll fails:** `useRunPolling` stops polling, so `stalled` is true. `caseRunning` becomes false, so the banner no longer shows "Running…". The stalled message plus the **Retry** button render inside the live banner slot (`EditorModal.tsx:296-305`). `runBlock` uses `busyLive`, which drops a stalled case run, so **Run case** is enabled. A set run of the owner (`runningSetRunId`) and a start in flight (`starting`) still count in `busyLive`.
- **Retry:** it clears the halt, resets the poll window and refetches. If the run is still running, following resumes. If the poll fails again, `errorUpdatedAt` is newer than the new window start, so it halts and stalls again, which is correct. After a finished run, `onSettled` invalidates the case detail and the overview, so the banner shows the result.
- **3/6-minute cap:** `timedOut` makes `stalled` true and the sentence shows. There is no Retry for a timeout, but the spec (EC-23) only asks for the sentence.
- **Stale `stalled`:** it cannot stick after Retry or a new run. The halt state is keyed by run id (`halt.runId === runId`), Retry sets it to null, and a different `followId` or an owner change makes it read as not halted.
- **`busyLive` and a second case run:** it does not let the client start a second run unguarded. The server's any-scope single-flight check still returns 409.

Two cosmetic points, neither reported:
- While stalled, the banner can show the previous "Last run …" result next to the stalled message.
- A **Run case** click or carrier-dialog confirm on a stalled-but-still-running run returns 409. The hook resolves that as `conflict` and the UI gives no feedback.

```findings-json
{
  "reviewer": "bug",
  "findings": []
}
```