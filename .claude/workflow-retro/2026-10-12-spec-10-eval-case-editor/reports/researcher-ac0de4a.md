## Hand-back 1

## Repository Research: every reader/writer of `eval_runs` (server + client) and what a size-1 `scope='case'` run would do to each

### Conclusion
All `eval_runs` access is in `server/src/modules/eval/repository.ts` (plus two delete cascades and the boot reaper). Today every set-level read (overview, trend, dashboard, runs list, compare, KPI) treats "newest finished run" as a full-set run. `latestFinishedRunRow` and `latestFinishedSkillResults` also drive the per-case "latest result", which only works because the newest run contains every case. There is no `scope` column or filter anywhere yet. Both single-flight unique indexes key on `agent_id` / `skill_id` only. The reaper is scope-agnostic.

All paths are under `/Users/harlock/Downloads/Sites/devdigest/`. "S" means `server/src/modules/eval/`, "C" means `client/src/`.

### A. Schema, single-flight, reaper

| Where | What it does | Scope impact |
|---|---|---|
| `server/src/db/schema/eval.ts:61-122` | Table def. No `scope` column. `caseSet` (76) and `caseResults` (77) are jsonb. `ownerKind` (94) is `'skill'\|'agent'`. | Add column here. `rows.ts:24` derives `EvalRunRow` from it. |
| `eval.ts:115-120` and migration `server/src/db/migrations/0024_bouncy_sleepwalker.sql` | Single-flight: `eval_runs_one_running_agent_uq` is UNIQUE(`agent_id`) WHERE `status='running' AND owner_kind='agent'`. `eval_runs_one_running_skill_uq` is UNIQUE(`skill_id`) WHERE `status='running' AND owner_kind='skill'`. Scope is not in either predicate. | A running case run and a running set run for the same agent or skill would collide (409), as would two case runs. A skill run and its carrier's agent run do not collide (`eval.ts:113-114`). |
| `S/repository.ts:566-595` `insertRun` | Catches the unique violation, then `runningRunId` (583) and throws 409 `eval_run_in_progress` with `{run_id}`. | The 409 carries the id of whatever is running, regardless of scope. |
| `S/repository.ts:848-884` `insertSkillRun` | Same pattern via `runningSkillRunId` (872). | Same. |
| `S/repository.ts:701-714` `runningRunId` and `941-954` `runningSkillRunId` | Filter `workspace`, `owner_kind`, `agent_id`/`skill_id`, `status='running'`. No scope filter. They feed `running_run_id` in the overviews (`service.ts:704,747`). | A running case run would be reported as `running_run_id`. The client follows it and disables the run buttons (see section D). Must include it if single-flight is shared. |
| `server/src/app.ts:90-95` → `S/service.ts:723-725` → `S/repository.ts:653-660` `reapRunning` | Boot reaper. `UPDATE eval_runs SET status='errored', error_reason='interrupted' (constants.ts:68), finished_at=now WHERE status='running'`. No workspace, owner or scope filter. | Already covers case runs. `errored` is not in `FINISHED` (`repository.ts:46` = completed, partial), so reaped rows drop out of finished reads. `server/CLAUDE.md` notes it assumes a single API instance. |
| `S/repository.ts:602-613` `saveProgress`, `625-650` `finalizeRun`, `616-622` `isRunning`, `891-939` skill equivalents, predicate `runningRun` (1032-1038) | All keyed by run id and `status='running'`. | Scope-agnostic. A case run reuses them unchanged. |

### B. Server readers and writers (repository, service, helpers)

| file:line | What it reads | Treats a size-1 case run as a set run? Needs `scope='set'`? Or must include? |
|---|---|---|
| `S/repository.ts:1012-1020` `agentRuns()` predicate (workspace, `owner_kind='agent'`, `agent_id`, optional finished). Used by `latestFinishedRunRow` (733), `listRunSummaries` (748) and `countFinishedRuns` (757). | Shared predicate for all agent-run reads. | One place to add a scope filter, but it serves both kinds of caller below. |
| `repository.ts:726-737` `latestFinishedRunRow` | Newest finished agent run, full row with `case_results`. | Needs care. A newest case run contains only one case's outcome, so every other case's `latest_result` becomes null in the two callers below. Callers: `service.ts:284` (`listCases`) and `service.ts:326` (`latestResultOf`). |
| `service.ts:280-292` `listCases` (`GET /agents/:id/eval-cases`) | Per-case `latest_result` via `outcomes.get(row.id)` from the single latest run (286-290). `toLatestResult` (`helpers.ts:128-144`) returns null when the outcome is missing. | Per-case "latest result of a case" must INCLUDE case runs, but not via "newest run overall". Without a change, a case run hides all other cases' results. |
| `service.ts:295-330` `getCase` → `latestResultOf` (agent branch 326-329) | Same, for one case (`EvalCaseDetail.latest_result`). | Same: must include case runs. Fails if the newest run does not contain this case. |
| `repository.ts:740-751` `listRunSummaries` | Scalar summaries (`casesTotal`/`casesDone` computed via `jsonb_array_length`), `finishedOnly` switch, `limit`. | See callers below. |
| `service.ts:742-763` `overview` | `latest` and `previous` = first two finished (`TREND_LIMIT` 100). `trend` = finished reversed. `finished_runs` = `countFinishedRuns`. `runs` = unfiltered by status, limit `RUNS_LIMIT` 50. `running_run_id`. | `latest`/`previous` (751, 757-758): yes, would wrongly show a 1-case run as the KPI source and shift `previous`. `trend` (760): would add a 1-case point. `finished_runs` (746/755): would count it. `runs` (749/761): would list it with `cases_total=1`. Needs `scope='set'` unless the history should show case runs. `running_run_id` (747): see section A. |
| `repository.ts:753-759` `countFinishedRuns` | Count of finished agent runs → `finished_runs`. | Would count case runs. Needs the filter. |
| `repository.ts:762-769` `recentRunSummaries` | Workspace-wide newest runs, any status, `owner_kind='agent'`. | Would list case runs in the dashboard "recent runs". Needs the filter, unless recent history should show them. |
| `service.ts:766-799` `dashboard` | `sparkline` = `listRunSummaries` finished, limit `SPARKLINE_LIMIT` 10. `latest` = `finished[0]`. `recent_runs` from `recentRunSummaries`. | `latest` (786, 793) and `sparkline` (794) would take case runs as the agent's latest and add points. Needs the filter. |
| `service.ts:806-855` `compare` (`GET /eval-runs/compare`) | `getRunRow` ×2. Rejects skill runs via `isAgentRunRow` (812), checks same agent (815), checks finished (816-820). Intersects `caseSet` ids (828-830) and scores `caseResults` over the common set (844). | Nothing rejects a case run today. A case run vs a set run would be comparable, with `common_cases` of 0 or 1. Needs a scope check or an explicit rejection. |
| `repository.ts:717-723` `getRunRow` and `service.ts:731-739` `getRun` (`GET /eval-runs/:id`) | Single run by id (workspace-scoped), discriminated by `isSkillRunRow` / `isAgentRunRow`. | Must include case runs. The client polls this endpoint to follow any run. |
| `helpers.ts:174-190` `toRunRecord`, `224-239` `summaryFromRow`, `241-249` `toRunDetail`, `252-263` `toTrendPoint`, `266-268` `recallOf` | Pure mapping of summary rows to DTOs. | No scope field in the DTOs or contracts (`server/src/vendor/shared/contracts/eval-ci.ts`: `EvalRunRecord` 64, `EvalOverview` 247, `EvalDashboard` 277; client copy `client/src/vendor/shared/contracts/eval-ci.ts`; parity test `server/test/eval-contract-parity.test.ts`). |
| `repository.ts:666-678` `deleteByAgent` (called from `server/src/modules/agents/service.ts:82` inside the agent-delete transaction) | `DELETE eval_runs WHERE workspace, owner_kind='agent', agent_id`. No scope filter. | Must include case runs. Already does. A `scope='set'` filter here would orphan rows, since `agent_id` has no FK (`eval.ts:68`). |
| `repository.ts:685-697` `deleteBySkill` (called from `server/src/modules/skills/service.ts:166`) | Same for skills. | Must include. Already does. |
| `service.ts:389-393` `deleteCase` → repo `deleteCase` | Case delete. No `eval_runs` access (comment: past runs keep their own `case_set`/`case_results`). | No cascade from case delete to runs. A case run for a deleted case stays as history. |
| `repository.ts:956-968` `listSkillRunSummaries` and `service.ts:699-720` `skillOverview` | Skill runs via `skillRuns()` (1023-1030: workspace, `owner_kind='skill'`, `skill_id`, finished). `latest`/`previous` = first two (706,709). | Would show a 1-case skill run as `latest`/`previous`. Needs the filter. |
| `repository.ts:971-982` `listSkillTrendRows` (`service.ts:707,718`) | Skill trend, limit 100. | Would add a 1-case point. Needs the filter. |
| `repository.ts:985-1000` `latestFinishedSkillResults` | Newest finished skill run's `caseResults` and `withoutResults`. Callers: `service.ts:236` (`listSkillCases`) and `service.ts:318` (`latestResultOf`, skill branch). | Same per-case problem as the agent side. Must include case runs for a case's latest result, but not as "the newest run". `toSkillListLatest` (`helpers.ts:387-403`) returns null when either arm is missing. |
| `service.ts:420-468` `startRun`, `471+` `executeRun`, `560-690` skill run (`insertSkillRun` call at 581) | Writers. They insert `caseSet` from all cases (`casesForRun`, 426/568) and run them one at a time. | Today the only writers, always for the whole set. They would need an input that restricts the case set. |
| `S/types.ts:12`, `S/repository.ts:37-38` (doc comments) | State that `case_set` / `case_results` jsonb are read only by detail and compare (NFR-13). | Documentation only. |

Other server modules (`agents`, `skills`, `pulls`, `ci`, etc.) touch `eval_runs` only through the two delete cascades above. A grep for `eval_runs|evalRuns|evalRepo|EvalService` outside `modules/eval` found only `app.ts`, `container.ts:34,82,114-115`, `rows.ts`, `schema.ts` and those two services. Nothing in `mcp/`, `reviewer-core/` or `e2e/` references the eval run endpoints.

### C. Client consumers of `EvalOverview` / `EvalDashboard` / run detail (agent side)

| file:line | What it reads | Would a size-1 case run be wrongly treated as a set run? |
|---|---|---|
| `C/lib/hooks/eval.ts:295-302` `useAgentEvalOverview` | `GET /agents/:id/eval-overview`. Consumers below. | Inherits the server behaviour. |
| `C/lib/hooks/eval.ts:304-310` `useEvalDashboard` | `GET /eval-dashboard`. | Same. |
| `C/lib/hooks/eval.ts:317-327` `useEvalCompare` | `GET /eval-runs/compare`. | Same as server `compare`. |
| `C/lib/hooks/eval.ts:365-372` `useEvalRunDetail` and `397-414` `useEvalRun` (via `eval-run-polling.ts:41-140`) | `GET /eval-runs/:id`. On settle it invalidates overview, cases and dashboard (407-411). | Must include case runs. Uses `cases_done`/`cases_total` for progress (`eval-run-polling.ts:131`). |
| `C/lib/hooks/eval.ts:145-151` `invalidateCaseViews`; `eval.ts:356-359` `useStartEvalRun` | Invalidation only. | No data read. A new single-case run hook would need its own invalidation of `["eval-overview"]`, the dashboard and cases (compare `eval.ts:407-411`). |
| `C/app/eval/agents/[agentId]/_components/EvalAgentDetailView/EvalAgentDetailView.tsx:22,60-70` | `overview` → `DetailHeader`, `KpiCards`, `AgentMetricTrend trend` (62), `AgentRunsTable runs` (63-67). | Trend and runs table would include case runs. |
| `…/KpiCards/KpiCards.tsx:15-38` | `latest`, `previous`, `trend` via `metricValue(latest/previous, …)` and `metricSeries(trend, …)`. | Yes. KPI numbers, delta and sparkline would come from a 1-case run. |
| `…/DetailHeader/DetailHeader.tsx:32,48,92` | `overview.running_run_id` (follow id), `overview.cases_total`, `overview.finished_runs` ("N runs on M cases"). | `finished_runs` would count case runs. `running_run_id` would be followed as a set run (progress `k of n`, `DetailHeader.tsx:54-58`). |
| `…/AgentRunsTable/AgentRunsTable.tsx:23-135` | `runs[]`: `started_at`, `agent_version`, metrics, `passParts`, `cost_usd`, `status`. Compare picks any two finished runs (`isComparableStatus`, `app/eval/helpers.ts:8-10`). | Would show case runs as rows and let them be picked for compare. |
| `…/CompareModal/CompareModal.tsx:29` | `useEvalCompare`. | Server-determined. |
| `…/RunDetailModal/RunDetailModal.tsx:18,38,67` | `useEvalRunDetail`: `cases_done`, `cases_total`, `snapshot`, `case_results`. | Must include case runs (opening one from history). Shows "x of y" from the run itself. |
| `C/app/eval/_components/EvalDashboardView/EvalDashboardView.tsx:16,57,71-74` | `data.agents[]` → `AgentSummaryCard`, `data.recent_runs` → `RecentRunsTable`. | Case runs would appear in recent runs and as the agent's latest. |
| `…/AgentSummaryCard/AgentSummaryCard.tsx:20,22,40-68` | `summary.latest` (version, `started_at`, pass parts, metrics), `summary.sparkline`. | Wrong if `latest`/`sparkline` include case runs. |
| `…/RecentRunsTable/RecentRunsTable.tsx:17-70` | `runs[]`: agent, version, metrics, status. | Same. |
| `C/app/eval/helpers.ts:13-29` `metricValue`, `passParts` | Run metrics → numbers. | Pure. |
| `C/app/eval/agents/[agentId]/_components/KpiCards/helpers.ts:7` `metricSeries`, `C/components/metric-trend/AgentMetricTrend/AgentMetricTrend.tsx:12` and its `helpers.ts:6` | `EvalTrendPoint[]` (`run_id`, `agent_version`, metrics, `cost_usd`). | A 1-case point would be added if the server trend includes it. |
| `C/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx:25,33,63-64,79-85` (agent EvalsTab) | `overview.data.latest` / `previous` → `EvalKpiCards` (63). `trend` → `AgentMetricTrend` (64). `latest != null` → `hasFinishedRun` (33). `cases_total` and `running_run_id` → `RunAllEvals` (80-84). | KPI and trend would use case runs. `hasFinishedRun` would become true after only a case run. |
| `…/EvalKpiCards/EvalKpiCards.tsx` and `helpers.ts` (`buildKpis`) | `latest`/`previous` run records (recall, precision, citation, traces) and deltas. | Same. |
| `…/EvalsTab/helpers.ts:5-18` `passingCounts(cases)` | Counts `passed`/`scored` over `EvalCaseListItem[]` using each case's `latest_result.state`. It does not read `EvalOverview`. | Correct only if each case's `latest_result` is right (see `listCases`). With the current "newest run" source, a case run would make `scored` be 0 or 1 for the set. |
| `…/EvalCaseList/EvalCaseList.tsx:31-33`, `…/EvalCaseList/helpers.ts:5` | `c.latest_result` (state, expected/got, `error_reason`). | Per-case latest result: must include case runs. |
| `C/components/eval-case-editor/CaseFacts/CaseFacts.tsx:16-45` | `EvalCaseDetail.latest_result`. | Same; reads the output of `latestResultOf`. |
| `…/RunAllEvals/RunAllEvals.tsx` (per `runningRunId` prop, `EvalsTab.tsx:83`) | Follows `running_run_id` via `useEvalRun`. | Would follow a running case run as if it were the set run. |

### D. Client consumers on the skill side (second EvalsTab)

| file:line | What it reads | Impact |
|---|---|---|
| `C/lib/hooks/skill-eval.ts:128-134` `useSkillEvalOverview` (`GET /skills/:id/eval-overview`) | `EvalSkillOverview`. | Inherits `skillOverview` behaviour. |
| `skill-eval.ts:189-209` `useSkillEvalRun` | `GET /eval-runs/:id`, `owner_kind==='skill'` guard (199). On settle it invalidates `skillOverview` and `skillCases` (204-207). | Must include case runs. |
| `skill-eval.ts:25-31` `useSkillEvalCases` | `GET /skills/:id/eval-cases` (`latest_result` with `with_state`, `without_state`, `effect`). | Same per-case issue as `listSkillCases`. |
| `C/app/skills/_components/SkillEditor/use-skill-eval-flow.ts:40-50` | `data.running_run_id` → `followId` (41-43). `block='running'` if a run is running (48). Also `data.carriers`, `data.cases_total`. | A running case run would block the "Run all evals" buttons and be followed as a set run. |
| `C/app/skills/_components/SkillEditor/_components/EvalsTab/EvalsTab.tsx:29-30,78-84` (skill EvalsTab) | `overview.data.latest` → `passingCounts(latest)` (30) and `liftParts(latest)` (79). `cases_total` (83). `trend` → `SkillMetricTrend` (84). | `latest` and `trend` would be a 1-case run: the passing count, the lift line and the chart would all be wrong. |
| `…/EvalsTab/helpers.ts:6-25` `passingCounts(latest)` | From `latest.with.traces_passed` and `traces_total`. It does not read the case list. | Wrong for a size-1 run. Not the same function as the agent `passingCounts`. |
| `…/SkillMetricTrend/SkillMetricTrend.tsx:13` and `helpers.ts:7` | `EvalSkillTrendPoint[]`. | Same. |
| `…/RunDialog/RunDialog.tsx:31,52` | `overview.latest?.carrier.agent_id` (default carrier choice) and `overview.cases_total`. | A case run would set the default carrier. |
| `…/SkillCaseList/SkillCaseList.tsx:33-36`, `helpers.ts:7-14`, `EffectLabel.tsx` | `c.latest_result` (`with_state`, `effect`, counts). | Per-case: must include case runs. |
| `…/RunStatus/RunStatus.tsx` | Uses `flow.run` / `finished` (run detail), not the overview. | Uses `cases_done` and `cases_total` from the run, so a size-1 run shows "case 1 of 1". |

### Evidence notes
- `server/INSIGHTS.md:66-74` (2026-10-11): "nothing but discipline keeps skill runs out of agent reads: every query that lists, counts, or deletes agent runs must filter `owner_kind = 'agent'`". It names `agentRuns()`, `runningRunId`, `recentRunSummaries` and `deleteByAgent`, and notes that no arch rule or type catches a new unfiltered query. This is the same hazard a `scope` column would add.
- Specs: `specs/09-skill-evals.md` NFR-5 (line 267) defines the owner exclusion across the agent reads. There is no spec text on `scope`.
- `server/test/` has `eval.it.test.ts`, `eval-trend.it.test.ts`, `skill-eval-runs.it.test.ts`, `skill-eval.it.test.ts`, `eval-cases*.it.test.ts`. I did not open them.
- The comment at `repository.ts:562` still names the dropped index `eval_runs_one_running_uq`. The live indexes are `_agent_uq` and `_skill_uq`.
- Contract copies: a `scope` field in any DTO touches both `server/src/vendor/shared/contracts/eval-ci.ts` and `client/src/vendor/shared/contracts/eval-ci.ts`, per the root `CLAUDE.md` gotcha.

### Could not determine
- Whether the DB-backed tests under `server/test/*.it.test.ts` assert anything that a `scope` filter would change. I did not read them, and I did not run anything.
- Whether `repository.ts` `deleteCase`/`replaceCase` (lines ~280-540) read `eval_runs`. A grep for `evalRuns` found no hits in that range, so I believe they do not.
- Whether the single-case run should share single-flight with the set run. That is a design decision, so I only recorded the mechanics.