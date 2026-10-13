## Hand-back 1

## Repository Research: effect of inserting an agent_runs row (source='ci', status done/failed, pr_id NULL, no reviews/run_traces/findings)

### Conclusion
On this branch a PR-less CI row is almost invisible. Only the two skill-stats counters read it (a). Only `GET /runs/:id` and a boot reaper that skips done/failed can reach it, and no per-agent stats or listing reader exists here. No reader filters by `source`. Nothing crashes, but `GET /runs/:id/findings` returns 404 and `GET /runs/:id/trace` 404s too (c).

### Table (reader file:line → effect → note)
| Reader | Effect | Note |
|---|---|---|
| `server/src/modules/reviews/repository/run.repo.ts:73-85` `listRunsForPull` (`GET /pulls/:id/runs`; client `lib/hooks/reviews.ts:43`, RunHistory.tsx) | (d) | `where prId = :prId`, so a NULL pr_id never matches. Both joins are `leftJoin` (agents, run_traces), so a missing trace would not drop a row anyway. |
| `run.repo.ts:43-66` `activeRunsForPull` (`GET /pulls/:id/runs/active`) | (d) | Filters `status='running'` and `prId`. |
| `run.repo.ts:91-103` `getRunSummary` (`GET /runs/:id`, `reviews/routes.ts:123`; mcp `api-client.ts:102`) | (b), reachable by id only | `leftJoin` agents and run_traces, so a row with no trace still returns. `toRunSummary` (`run.repo.ts:12-37`) has no `source` or `pr_id`, and the `RunSummary` contract (`server/src/vendor/shared/contracts/trace.ts:117-140`) has no `source` field either. A CI row shows up in the UI or MCP only if someone passes its id. |
| `run.repo.ts:115-125` `getReviewByRunId` (`GET /runs/:id/findings`, `reviews/service.ts:243-246`) | (c) mild | Reads `reviews`, not agent_runs. With no review row, `service.ts:245` throws `NotFoundError('Review not found')`, so a done CI run 404s here. |
| `mcp/src/tools/get-findings.ts:58` and `run-agent-on-pr.ts:77` | (c) mild | For `status==='done'` they call `getRunFindings`, which 404s with no review, so the tool returns an error result instead of "done, 0 findings". `status==='failed'` is handled without that call (`review-result.ts:85-99`), so a failed CI row is fine. Not fatal, since the error goes through `toToolErrorResult`. |
| `reviews/routes.ts:144-148` `GET /runs/:id/trace` → `run.repo.ts:245` | (c) mild | Returns 404 'Run trace not found' when there is no run_traces row. Only reached from the RunTraceDrawer, and a CI row has no PR page to open it from. |
| `run.repo.ts:136-149` `deleteAgentRun` (`DELETE /runs/:id`) | (d) | Deletes reviews by run_id (none) and then the agent_runs row. Works. |
| `run.repo.ts:152-158` `cancelRunIfRunning` | (d) | Matches `status='running'` only. |
| `run.repo.ts:163-169` `reapStaleRunningRuns`, called from `server/src/app.ts:82` | (d) if inserted as done/failed; **(c) if inserted as 'running'** | The update is `where status='running'` with no `source` or `pr_id` filter and runs on every boot. A 'running' CI row would be flipped to 'failed' at the next boot. Done/failed rows are safe. |
| `server/src/modules/pulls/routes.ts:199-203` (PR-list cost column) | (d) | `inArray(prId, prIds)` plus `status='done'`. NULL pr_id never matches, and `if (!run.prId) continue` at `:204` also guards it. A CI row will NOT change any PR cost number. |
| `server/src/modules/skills/repository.ts:268-278` `countRunsByAgents` (Skill Stats `runs_by_linked_agents`, `skills/service.ts:204-206`) | **(a)** | Plain count over `agent_runs` by workspace, `agentId IN linkedAgents` and `ran_at >= since`. No status, pr_id or source filter, so a CI row (agent_id set) raises the denominator and lowers `pull_frequency` (`service.ts:217`). |
| `skills/repository.ts:251-263` `countRunsWithSkill` | (d) | `innerJoin agent_run_skills`; a CI row has no `agent_run_skills`, so it is dropped. It would count only if skill links were also written. |
| `skills/repository.ts:285-303` `findingRowsForSkillWindow` | (d) | `innerJoin agent_run_skills`, `reviews` and `findings` drops the row. Accept-rate and category numbers are unchanged. |
| `server/src/modules/eval/repository.ts:545` (`innerJoin t.agentRuns`) | (d) | Joins `agent_run_skills` to `agent_runs`, then `skills`, by finding.runId. It is for a finding's skill chips, and a CI run has no findings or run-skills. |
| `eval/repository.ts:763-808`, `:1206` `agentRuns()` helper | (d) | Despite the name it queries `t.evalRuns`, never `agent_runs`. `eval/service.ts:91` says eval runs write nothing to agent_runs. |
| `agents` module (`server/src/modules/agents/repository.ts:80`) | (d) | Only a comment that agent_runs keep history with agent_id set null on agent delete. No agent_runs query. |
| Agent card / agent listing stats (runs count, accept %, avg cost) | (d), not present | No server route or client code computes them. `AgentStats` and `AgentPerfRow` exist only as Zod contracts in `vendor/shared/contracts/observability.ts:95-117` and `productionize.ts:139-164`. The grep found no producer, so these are likely added back by a later lesson. If one is added, it will count CI rows unless it filters `source`. |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:26-41` `outcomeOf` | (d) | Only sees rows returned by the PR-scoped list. For a done row it uses `blockers` and `findings_count` (the denormalized columns), which a CI row would set. |
| `server/src/db/schema/runs.ts:28` | n/a | `source` is `text('source',{enum:['local','ci']}).notNull().default('local')`, so the column already exists. `findings_count`, `blockers`, `score` and `grounding` are nullable. `pr_id` is nullable with `onDelete: set null`, so there is no non-null assumption on it. |

### Findings
- Does any reader filter by `source`? No. `git grep` for `source` in server/client/mcp finds no read of `agentRuns.source`, only the schema definition at `runs.ts:28`. The writer in `run.repo.ts:186-196` relies on the default 'local'; I did not read lines 174-196 closely, so treat the writer as unchecked.
- `pr_id` set to NULL is already possible after a PR delete (`set null`), but every PR-scoped reader filters by `prId`, so none dereferences it. The only place that touches `run.prId` directly is the `if (!run.prId) continue` guard in `pulls/routes.ts:204`.
- Two places would show a CI row if it were written differently:
  - A 'running' status would trigger the boot reaper, which would flip the row to 'failed' on every boot (`run.repo.ts:163-169`, `app.ts:82`).
  - The only unfiltered count is `skills/repository.ts:268`, which is a displayed number (a).
- Client: only `lib/hooks/reviews.ts` and `RunHistory` read these endpoints, and all are PR-scoped. MCP only calls `GET /runs/:id` and `/runs/:id/findings` by id, so it never lists runs.

### Evidence
See file:line in the table. Also `server/src/modules/reviews/service.ts:97-99` (reaper entry point), `server/src/db/schema/runs.ts:36-41` (indexes on `(prId,status)` and `status`), and `server/src/db/schema/reviews.ts:31` (reviews.run_id has no FK to agent_runs, per `run.repo.ts:131`).

### Could not determine
- `run.repo.ts:174-196` (the `createRun` insert) and `:200-235` (the update) were not read in detail, so I did not check whether the writer sets `source`. The grep indicates it does not.
- Whether a later lesson (L07 or later) adds an agents stats or performance reader over `agent_runs`. None exists on this branch (`l07-lab-export-to-ci`); check the specs in `specs/lessons/` if it matters.
- The `e2e/` and `reviewer-core/` dirs had no `agent_runs` matches (the `git grep` covered them).
- `GET /runs/:id/findings` and `/trace` behaviour was derived from reading the code, not run (read-only).