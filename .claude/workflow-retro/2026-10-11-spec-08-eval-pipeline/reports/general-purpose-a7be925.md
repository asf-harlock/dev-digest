## Hand-back 1

Bug review of the SPEC-08 eval pipeline: one WARNING, no CRITICAL. I read the whole of server/src/modules/eval/, the agents deleteById transaction, eval-ci.ts and knowledge.ts, the client hooks, and every eval client component. I ran nothing and edited nothing.

| severity | file:line | defect | failing input |
|---|---|---|---|
| WARNING | client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/CaseModal/_components/CaseBody/helpers.ts:25 (source: server/src/modules/eval/frozen-input.ts:61, service.ts:105) | The case's frozen diff keeps its file headers, but the shared DiffViewer's `parsePatch` expects hunks only. In the case modal the headers render as fake diff lines. | Open a case whose `input_diff` is `diff --git a/f b/f`, `index …`, `--- a/f`, `+++ b/f`, `@@ -1,2 +1,3 @@`, … . `extractFileDiff` stores the headers, and `frozenDiffFile` passes the string unchanged as `patch`. `parsePatch` has no header handling, so `--- a/f` becomes a deletion row "-- a/f", `+++ b/f` an addition row "++ b/f", and `diff --git` and `index` context rows, all above the first hunk. `countPatchLines` skips pre-hunk lines, so the +/- counts stay right and only the display is wrong. |

I checked everything below and found no defect.
- **Scoring:** overlap and labelling, null denominators, precision as (kept − FP)/kept, and citation as Σkept / Σ(kept + dropped). `runCost` returns null when any scored case has no cost.
- **Run lifecycle:** status transitions (all errored gives `errored` with null metrics, some errored gives `partial`), the unique-violation to 409 translation, and an agent deleted mid-run (`isRunning` and `saveProgress` stop the run quietly). The crash handler in `startRun` finalizes the run as `errored`, and the boot reap marks leftover runs `interrupted`.
- **Repository:** workspace scoping, `jsonb_array_length`, and the newest-first ordering of trend, runs and overview. Compare orders old and new by `ran_at`, with id as tiebreak.
- **Client hooks:** `useEvalRun` stops polling on finish, timeout and failed poll, resets the timeout window on retry, and fires `onFinished` once per run. `useCreateEvalCaseFromFinding` maps 409 and the four 422 codes correctly and reads `details` from the same place the server writes it.
- **Client UI:** `RunAllEvals`, `DetailHeader`, `AgentRunsTable` selection, delta formatting, and every i18n key used by the eval and finding-card components exist in `eval.json` and `prReview.json`.
- **Contracts:** the eval and knowledge contracts match between the server and client vendor copies. The only difference is an unrelated `AgentManifest` and provider-enum drift that predates this change.

Low-confidence notes, below the reporting bar:
- Migration 0020 adds NOT NULL columns to `eval_runs` and `eval_cases` without defaults, so it would fail if those tables already held rows.
- In `FindingsPanel`, two `onCreate` clicks in flight at once share one mutation object, so the first click's per-call `onSuccess` is dropped and its inline 422 would not show.

```findings-json
{
  "reviewer": "bug",
  "findings": [
    {
      "severity": "WARNING",
      "title": "Frozen eval diff shown with file headers parsed as diff lines",
      "file": "client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/CaseModal/_components/CaseBody/helpers.ts",
      "start_line": 24,
      "end_line": 26,
      "rationale": "extractFileDiff stores the whole `diff --git`/`index`/`---`/`+++` section (frozen-input.ts:61, service.ts:105). frozenDiffFile passes it verbatim as PrFile.patch, and the shared DiffViewer's parsePatch (components/diff-viewer/helpers.ts:12-38) has no header handling. `--- a/f` renders as a deleted line, `+++ b/f` as an added line, and `diff --git`/`index` as context lines with bogus line numbers, above the first hunk. countPatchLines already skips pre-hunk lines, so the +/- counts are correct while the rendered rows are wrong.",
      "suggestion": "In frozenDiffFile, strip everything before the first line starting with '@@' before assigning `patch` (keep the stored input_diff unchanged for the run).",
      "confidence": 0.8
    }
  ]
}
```