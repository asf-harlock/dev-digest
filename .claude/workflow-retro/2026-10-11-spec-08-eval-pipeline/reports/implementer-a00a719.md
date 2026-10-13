## Hand-back 1

## W1b client scaffold (steps 14-15) — done

Gates: `./scripts/check.sh client typecheck` PASS, `client lint` PASS (run on the 3 hook/format files), `client arch` PASS.

### Files
- Created `/Users/harlock/Downloads/Sites/devdigest/client/src/lib/hooks/eval.ts`
- Created `/Users/harlock/Downloads/Sites/devdigest/client/src/lib/eval-format.ts`
- Edited `/Users/harlock/Downloads/Sites/devdigest/client/src/lib/hooks/index.ts`: added `export * from "./eval"`. Every domain hook is already re-exported there except conventions and skills.
- Edited `/Users/harlock/Downloads/Sites/devdigest/client/messages/en/eval.json`: all staged keys kept, new groups added.
- Edited `/Users/harlock/Downloads/Sites/devdigest/client/messages/en/prReview.json`: new `evalCase` group.
- `agents.json`: no change needed, `editor.tabs.evals` ("Evals") already exists.

### Hooks (`@/lib/hooks/eval`, types imported from `@devdigest/shared` only)
- `evalKeys` holds the query keys: `casesAll`, `cases(agentId)`, `case(id)`, `overview(agentId)`, `run(id)`, `dashboard`, `compare(a,b)`, `links(pullId)`.
- `useAgentEvalCases(agentId)` → `EvalCaseListItem[]`
- `useEvalCase(caseId)` → `EvalCaseDetail`. 4xx is not retried.
- `useRenameEvalCase()`: `mutate({caseId, name})`
- `useDeleteEvalCase()`: `mutate({caseId})`
- `usePullEvalCaseLinks(pullId)` → `EvalCaseLinks`
- `useCreateEvalCaseFromFinding(pullId)`: `mutate(findingId)` resolves to `CreateEvalCaseResult`:
  - `{kind:"created", caseId, agentId}`
  - `{kind:"exists", caseId|null}` for 409 `eval_case_exists`
  - `{kind:"rejected", code: "finding_undecided"|"agent_missing"|"no_patch"|"range_outside_diff"}` for 422
  - The mutation resolves instead of throwing for these outcomes. The global MutationCache would otherwise toast them in addition to the inline text. Network, 5xx and 404 still throw and are toasted once.
  - On "created" it writes the link into the links cache, so the card flips to "In eval set" immediately. It then invalidates links, cases and overview.
  - The type `EvalCaseRejection` is exported.
- `useAgentEvalOverview(agentId)` → `EvalOverview`
- `useEvalDashboard()` → `EvalDashboard`
- `useEvalCompare(a, b)` → `EvalCompare`. It is disabled until both ids are set. 4xx surfaces as `error` (an `ApiError`, branch on `status`/`code`), no retry.
- `useStartEvalRun(agentId)`: `mutate()` → `EvalRunStart`. A 409 `eval_run_in_progress` resolves with the running run's id from the error `details`. It is rethrown if the id is absent. `isPending` is not a loading state, as in `intent.ts`.
- `useEvalRunDetail(runId)`: a plain single fetch of `EvalRunDetail`, no polling. Use it for the run-detail modal. This is an addition to the plan.
- `useEvalRun(runId, {onFinished?, onTimeout?, onPollFailed?})` returns `{run, isLoading, isRunning, progress:{done,total}, timedOut, pollFailed, retry(), error}`.
  - It polls every 2 s only while `status==="running"` and stops on its own when the status changes.
  - It times out after 10 minutes (`timedOut`, EC-15).
  - A failed poll sets `pollFailed`, stops polling and raises no second toast. `retry()` resumes with a fresh timeout window (EC-16).
  - When the run leaves `running`, it invalidates overview, cases and dashboard once (AC-26) and calls `onFinished(run)`.
  - A failed first fetch also reports `pollFailed`.
  - "Running case {k} of {n}": k = `progress.done + 1`, n = `progress.total`.
  - W3: the id for `useEvalRun` is the id from `useStartEvalRun`, or `overview.running_run_id`.
  - Exported constants: `EVAL_RUN_POLL_MS`, `EVAL_RUN_TIMEOUT_MS`.

### ApiError and `details`
`ApiError` exposes `status`, `code` and `details` (`client/src/lib/api.ts:8-19`, `details = body.error.details`). No change was needed.

The hooks read the ids from `details` tolerantly. For the case id they try `case_id`, `caseId`, `id`. For the run id they try `run_id`, `runId`, `id`. **W2 should put the id in `details` under `case_id` / `run_id`.** If the key is missing, the 409 "exists" state still works but `caseId` is null.

### Formatters (`@/lib/eval-format`)
- `EM_DASH` = "—"
- `formatPercent(v: number|null|undefined): string`, e.g. 0.756 → "76%", null → "—"
- `deltaPoints(new, old): number|null` = `round(new·100) − round(old·100)`
- `deltaDirection(points): "up"|"down"|"flat"|"none"`
- `formatDeltaPoints(new, old, unit = "pt"): string` → "▲ 4 pt", "▼ 2 pt", "0 pt", null → "—". The unit can be passed from `eval.format.pointsUnit`.
- `formatCostUsd(v): string` → "$0.12", null → "—"
- `formatCostDeltaUsd(new, old): string` → "▲ $0.12", "▼ $0.03", "$0.00", null → "—"
- `formatDuration(ms): string` → "420ms", "1.8s", "2m 5s", null → "—"
- `formatPassRatio(passed, total): string` → "3/4", null → "—"
- `formatLineRange(file, start, end): string` → "file:start-end"
- `evalCaseState(latest_result|null): "passed"|"failed"|"errored"|"never_run"`. Its output matches the `case.state.*` keys.

### i18n key tree
Namespace `eval` (`useTranslations("eval")`). Existing groups are untouched: `dashboard`, `caseEditor`, `evalsTab`, `page`. `page.*` has the crumbs: `crumbSkillsLab`, `crumbEvalDashboard`, `crumbAgents`, `crumbEvals`, and others.

- `dashboard` (cross-agent page, W4):
  - `title`, `subtitle`
  - `loadErrorTitle`, `loadErrorBody`
  - `noAgentsTitle`, `noAgentsBody`
  - `agentsHeading`
  - `noRunsYet` (EC-24), `noEvalRunsYet` (EC-24)
  - `recentRunsAll`
  - `disabledBadge` (EC-28)
  - `agentCard.{lastRun, recall, precision, citation, sparklineLabel, open}`
  - `table.{agent, version, status, openRun}` added to the existing `ranAt`, `recall`, `precision`, `citation`, `pass`, `cost`
- `evalsTab` (W3): the existing `casesHeading` ("Eval cases") is reused for the heading. New keys:
  - `tabLabel`, `passingSummary`, `viewDashboard`, `runAll`, `starting`
  - `loadCasesError`, `loadMetricsError`, `noValue`
  - `kpi.{groupLabel, recall, precision, citation, tracesPassed, recallCaption, precisionCaption, citationCaption, tracesCaption, noRunYet}`
  - `empty.{title, body, link}` (EC-22)
  - `case.{listLabel, open, expectedGot, mustNotFlagTag, severityCategory, typeMustFind, typeMustNotFlag, delete, erroredReason, state.{passed, failed, errored, never_run}}`
- `caseModal` (W3):
  - `title`, `close`, `loading`, `loadError`
  - `nameLabel`, `namePlaceholder`, `save`, `saving`, `nameRequired`, `nameTooLong`, `saveError`
  - `diffHeading`, `diffLabel`, `prHeading`, `prTitleLabel`, `prBodyLabel`, `noBody`
  - `expectationHeading`, `expectation.{type, file, lines, severity, category, title, mustFind, mustNotFlag}`
  - `source.{heading, link, unavailable}`
  - `lastResult.{heading, neverRun, duration, cost, expectedGot, state.*}`
  - `delete.{action, title, body (uses {name}), confirm, deleting, cancel, error}`
- `runStatus` (shared by W3 and W4):
  - `running`, `completed`, `partial`, `errored`
  - `progress` ("Running case {k} of {n}"), `starting`
  - `live.{started, completed, partial, errored}` (aria-live texts)
  - `timeout` (EC-15), `pollFailed` (EC-16), `retry`, `errorReason`, `interrupted`, `noMetrics`
- `agentDetail` (W4):
  - `allAgents`, `runsOnSet`, `agentSwitcherLabel`, `runEval`
  - `loadError`, `notFoundTitle`, `notFoundBody`, `noRunsYet`
  - `kpi.{recall, precision, citation, sparklineLabel}`
  - `trend.{title, chartLabel, recall, precision, citation, versionLabel}`
  - `runs.{title, selectedCount, compare, selectRun, openRun, columns.{select, ranAt, version, recall, precision, citation, pass, cost, status}}`
- `compare` (W4):
  - `title`, `close`, `loading`, `loadError`
  - `notFinished`, `notComparable`, `notFound`
  - `cards.{recall, precision, citation, cost, fromTo, commonOnly, wholeRun, deltaUp, deltaDown, deltaFlat, deltaNone}`
  - `caseCounts` (EC/AC-47), `noCommon` (EC-26)
  - `modelChange`, `strategyChange`
  - `promptDiff.{heading, unchanged, removedLabel, addedLabel, removedMarker, addedMarker, removedLine, addedLine}`
  - `skills.{heading, added, removed, changed}`
- `runDetail` (W4):
  - `title`, `close`, `loading`, `loadError`
  - `resultsHeading`, `snapshotHeading`
  - `snapshot.{model, strategy, skills, noSkills}`
  - `summary.{cases, duration, cost}`
  - `case.{expectationType.{must_find, must_not_flag}, state.*, expectedGot, grounding, duration, cost, noFindings, findingsHeading, errorReason}`
  - `label.{tp, fp, unlabeled}`, `labelHint.*`
- `tooltips`: `noCases` (EC-11), `runInProgress`, `compareUnfinished` (EC-27), `selectTwo`
- `errors`: `startNoCases`, `startInProgress`, `startFailed`, `generic`
- `states`: `loading`, `empty`, `error`, `retry`
- `format`: `pointsUnit`, `noValue`, `deltaUp`, `deltaDown`, `deltaFlat`, `deltaNone`. The delta ones take `{points}` and are meant for aria-labels.

Namespace `prReview`, new group `evalCase`:
- `turnInto`, `creating`, `inEvalSet`, `inEvalSetLink`, `enabledHint`
- `undecidedTooltip` (EC-1), `agentMissingTooltip` (EC-2)
- `created`
- `errors.{noPatch (EC-4), rangeOutsideDiff (EC-5), undecided, agentMissing, generic}`

Namespace `agents`: `editor.tabs.evals` was already present.

### Deviations and notes
- Added `useEvalRunDetail` (no polling). `useEvalRun` fires `onFinished` and the invalidations for any run it sees finished, so it should not back a plain run-detail view.
- Spec text uses `{ranAt}` in `dashboard.agentCard.lastRun` and `runDetail.title`. The component must pass an already formatted string, for example from `lib/relative-time.ts`.
- The staged `evalsTab` keys (`newCase`, `run`, `edit`, `delete`, and so on) and `caseEditor` stay in the file but nothing new reads them, since the spec drops the "New case" and "Run case" flows. They were not deleted, as instructed.
- Not run: the full client test suite (inner loop only).