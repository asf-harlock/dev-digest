# Spec: Multi-Agent Review and live statuses
Spec ID: SPEC-11
Status: draft
Supersedes: —

## Проблема й користувач

Every `file:line` reference is at branch `l07-lab-multi-agent-review`
(commit `fe3a37a`). Design sources: five mockup screenshots read from the
caller's paths (PR page popover; Configure run empty; Configure run with a PR;
results in Columns; results in Tabs), the user's requirement text, and the
user's added requirement that **View trace** opens the existing
`RunTraceDrawer`. `specs/lessons/L07.md` does not exist. Prior upstream
implementations were reported by researcher R1 (see Inputs and provenance).

One PR can carry security risks, performance problems and domain-rule
violations at once. The **reviewer of a PR** wants several specialised agents
on the same diff, but today cannot get a comparable result:

1. **No way to pick a set.** `POST /pulls/:id/review` takes only `{agentId}`
   or `{all:true}` (`server/src/vendor/shared/contracts/platform.ts:422-425`;
   `server/src/modules/reviews/routes.ts:31-48`). The Run Review menu runs
   all enabled agents or exactly one
   (`client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.tsx:41-82`).
2. **The executor is not parallel.** `executeRuns` awaits one agent after
   another (`server/src/modules/reviews/run-executor.ts:173-200`), and every
   `agent_runs` row is created as `running` up front
   (`server/src/modules/reviews/service.ts:123-133`), so agents 2..N show
   `running` while they only wait. `p-queue` is a dependency
   (`server/package.json:39`) with no import in `server/src`.
3. **Runs are not grouped.** `multi_agent_runs` has only `id`, `workspace_id`,
   `pr_id`, `ran_at`; nothing writes or reads it and `agent_runs` has no link to
   it (`server/src/db/schema/runs.ts:73-82`).
4. **Duplicates and disagreements are invisible.** No grouping heuristic exists
   in code; only a comment on the `Conflict` contract describes one
   (`server/src/vendor/shared/contracts/observability.ts:61-65`). The contracts
   `MultiAgentRun`, `AgentColumn`, `Conflict` exist and nothing uses them.
5. **The cost is hidden before the run.** No endpoint estimates time or cost.
6. **There is no screen.** The sidebar has no Multi-Agent Review entry
   (`client/src/vendor/ui/nav.ts:21-39`); only an i18n key
   (`client/messages/en/shell.json:26`), a `activeKeyFor` case that already
   returns `multi-agent` for any path containing `/multi-agent`
   (`client/src/components/app-shell/helpers.ts:28`) and pre-written strings in
   `client/messages/en/runs.json` exist. The user explicitly allows editing the
   vendored `nav.ts` to add the entry (`key: "multi-agent"`,
   `href: /repos/:repoId/multi-agent`).

What exists and is reused as-is: `LiveLogStream`
(`client/src/vendor/ui/LiveLogStream.tsx`), `RunTraceDrawer` (props `runId`,
`agentName`, `prNumber`, `findings`, `running`, `onClose`;
`.../RunTraceDrawer/RunTraceDrawer.tsx:19-29`), `FindingCard` with Accept,
Dismiss and Turn into eval case (`.../FindingCard/FindingCard.tsx:102-124`),
SSE `GET /runs/:id/events`, `GET /runs/:id/trace`, and the finding actions
`POST /findings/:id/(accept|dismiss)`.

## Goals / Non-goals

**Goals**
- Pick any set of agents on the PR page (popover) or on a Configure run screen,
  see estimated time and cost before spending, and start one multi-agent run.
- Run the selected agents concurrently and group their `agent_runs` under one
  `multi_agent_runs` parent.
- Show a results page with live per-agent status in two views: **Columns** and
  **Tabs + detail** (confidence, suggested fix, Accept, Dismiss, Turn into eval
  case).
- Show **Where agents disagree**: for one place in the code, each agent's take
  including **did not flag**, with a **Show only conflicts** toggle. No original
  finding is lost and every finding keeps its agent.
- Each agent's **View trace** opens the existing `RunTraceDrawer` for that
  agent's `run_id`, while running (live log over its existing SSE) and after it
  settles.

**Non-goals**
- **Learn** and **Reply to author** (both exist in the mockups; the server
  rejects `learn` and `reply` and there is no memory module,
  `server/src/modules/reviews/findings.ts:31-33`). Not in this spec; see Q-5.
- **Compose review** (mockup 1) and the sidebar items Memory, Agent Performance
  and CI Runs (other lessons).
- Changing `ci/` (does not exist) or `agent-runner/`; changing `run-executor.ts`
  or the request and response of `POST /pulls/:id/review`.
- A new drawer: the trace and log UI is `RunTraceDrawer`, unchanged.
- Cancelling one column, browsing earlier multi-agent runs of a PR (the page
  shows the latest), and staleness against a moved PR head.
- A model-generated reason for **did not flag**: the mockup texts such as "Not a
  security concern." are not reproduced.
- Not doing the top-level route `/multi-agent-review` and the "failed agent
  counts as ignored" behaviour of upstream V1 — considered and rejected because
  the silence of a failed agent is not agreement (researcher R1).
- Not doing a client-only fan-out of N `POST /pulls/:id/review {agentId}` calls
  — considered and rejected because it has no parent run, repeats the diff load
  and hits the 10 per minute route limit.
- Not doing a rewrite of `executeRuns` to run in parallel — considered and
  rejected because it edits a file and a contract outside the multi-run service
  and changes CI and MCP behaviour (see Q-2).
- The mockup copy "fan-out via worktrees": no worktrees are used; the UI says
  "parallel".

## User stories

- **US-1** As a PR reviewer, I want to pick agents in a popover on the PR page
  and see each agent's estimated time, so that I can start a multi-agent review
  without leaving the PR.
- **US-2** As a PR reviewer, I want a Configure run screen where I choose a PR
  and the agents and see the estimated total time and cost, so that I know the
  price before I run.
- **US-3** As a PR reviewer, I want one click to start all chosen agents in
  parallel as one grouped run, so that I get the results together.
- **US-4** As a PR reviewer, I want to see each agent's live status, result and
  failure reason, so that I know what is still running and what failed.
- **US-5** As a PR reviewer, I want to see where agents disagree, including the
  agents that did not flag a place, so that I notice conflicts and duplicates
  without losing any original finding.
- **US-6** As a PR reviewer, I want Columns and Tabs views with confidence,
  suggested fix and the actions Accept, Dismiss and Turn into eval case, so that
  I can triage findings from the results page.
- **US-7** As a PR reviewer, I want each agent's View trace to open the same
  drawer as on the PR page, so that I can read its live log, configuration,
  stats, prompt and raw output.
- **US-8** As a PR reviewer, I want runs that belong to a multi-agent run marked
  in the PR timeline, so that I can find their comparison.

## Acceptance criteria (EARS)

### PR page popover

- **AC-1** (US-1) КОЛИ the user opens the Run Review control on the PR page, the
  system (shall) show a "Pick agents to run" popover with every agent of the
  workspace as a row (checkbox, name, estimated duration), a Clear link, the
  primary button "Run multi-agent review (N)" where N is the number of checked
  agents, and a "Configure agents…" link to `/agents`.
- **AC-2** (US-1) ДЕ an agent is enabled, the system (shall) show its checkbox
  checked when the popover opens, and show a disabled agent unchecked with a
  "disabled" label.
- **AC-3** (US-1) КОЛИ the user clicks Clear, the system (shall) uncheck every
  agent and show N as 0.
- **AC-4** (US-1) The system (shall) keep the existing "Run all enabled agents"
  and single-agent actions of the Run Review control working through
  `POST /pulls/:id/review`.
- **AC-47** (US-1, US-3) ПОКИ fewer than 2 agents are checked in the popover, the
  system (shall) keep its "Run multi-agent review (N)" button disabled.

### Estimates

- **AC-5** (US-1, US-2) КОЛИ the client requests `GET /multi-agent/estimates`,
  the system (shall) return `{agents: [{agent_id, duration_ms, cost_usd,
  runs_used}]}` with one entry per agent of the workspace, where `duration_ms`
  and `cost_usd` are medians (for an even count, the mean of the two middle
  values) over that agent's last 5 runs with `status='done'` on any PR,
  `source='ci'` runs included, `cost_usd` ignores runs whose cost is `null`,
  a median over zero values is `null`, and `runs_used` counts the `done` runs
  taken.
- **AC-6** (US-1, US-2) The system (shall) show an agent's estimate as seconds
  with one decimal (`8.2s`) and cost with the existing run-cost formatter.
- **AC-7** (US-1, US-2) ПОКИ at least one agent is checked, the system (shall)
  show the run estimate as the maximum of the checked agents' durations and the
  sum of their known costs, labelled "parallel".

### Configure run screen and navigation

- **AC-8** (US-2) The system (shall) show a "Multi-Agent Review" sidebar item
  (`key: "multi-agent"`, `href: /repos/:repoId/multi-agent`, added to `NAV` in the
  vendored `client/src/vendor/ui/nav.ts`, an edit the user explicitly allowed)
  that opens `/repos/:repoId/multi-agent` and is highlighted on every path that
  contains `/multi-agent`, as `activeKeyFor` already returns.
- **AC-9** (US-2) КОЛИ the user opens `/repos/:repoId/multi-agent`, the system
  (shall) show step 1 "Pull request" with a selector of the repository's PRs
  and step 2 "Agents to run" with the placeholder "Pick a pull request first"
  until a PR is selected.
- **AC-10** (US-2) КОЛИ a PR is selected, the system (shall) show one card per
  agent with a checkbox, name, description and estimate, a "Select all" link,
  and enabled agents checked.
- **AC-11** (US-2, US-3) ПОКИ no PR is selected or fewer than 2 agents are
  checked, the system (shall) keep the button "Run multi-agent review" disabled
  and show no count.

### Starting a run

- **AC-12** (US-3) КОЛИ the user clicks "Run multi-agent review (N)", the
  system (shall) send `POST /pulls/:id/multi-agent-run` with `{agentIds}` and,
  on success, open `/repos/:repoId/multi-agent/:number`.
- **AC-13** (US-3) КОЛИ `POST /pulls/:id/multi-agent-run` is accepted, the
  system (shall) create, in one transaction, one `multi_agent_runs` row and one
  `agent_runs` row per selected agent with `agent_runs.multi_agent_run_id` set to
  it, and return the `MultiAgentRun` snapshot before any agent finishes.
- **AC-14** (US-3) КОЛИ `POST /pulls/:id/multi-agent-run` is accepted, the
  system (shall) start all selected agents concurrently through a `p-queue`
  whose concurrency is the named constant `MULTI_AGENT_CONCURRENCY`, set to
  `Infinity`, so that no agent waits for another agent to finish.
- **AC-15** (US-3) The system (shall) execute each selected agent through the
  existing review executor, so that each run produces the same `agent_runs`
  row, review, findings and `run_traces` document as a single-agent run.

### Snapshot and live status

- **AC-16** (US-4) КОЛИ the client requests `GET /pulls/:id/multi-agent`, the
  system (shall) return the PR's latest multi-agent run as `MultiAgentRun`: one
  column per child run ordered by agent name then run id, with `status`
  (`running`, `done`, `failed` or `cancelled`), `error`, nullable `agent_id` and
  `agent_name`, `score`, `duration_ms`, `cost_usd` and the run's findings, each
  finding carrying every `FindingRecord` field (including `end_line`,
  `rationale`, `suggestion`, `confidence`, `evidence`, `accepted_at` and
  `dismissed_at`), so that the snapshot alone feeds `FindingCard` and
  `RunTraceDrawer` with no per-column findings request.
- **AC-17** (US-4) The system (shall) derive `agent_count`, `total_cost_usd`
  (sum of known child costs, `null` when none is known) and `total_duration_ms`
  (the maximum of `ran_at` + `duration_ms` over the children minus the minimum
  `ran_at`, or the current time in place of the maximum while a child is
  `running`) from the child runs at read time; `ran_at` is the row creation
  time, so the value is not exactly the start-to-finish time.
- **AC-18** (US-4) ПОКИ any column of the displayed run has status `running`,
  the system (shall) refresh the snapshot every 4 seconds and update the
  statuses without a page reload.
- **AC-19** (US-4) КОЛИ every column has a status other than `running`, the
  system (shall) stop refreshing the snapshot.
- **AC-20** (US-4) КОЛИ one agent finishes while others still run, the system
  (shall) show that agent's score and findings at the next refresh.
- **AC-21** (US-4) The system (shall) show in each column the agent name, the
  status as text and an icon, and, for status `done`, the score ring, duration
  and cost (`—` when `cost_usd` is `null`).
- **AC-22** (US-4) ПОКИ a column has status `failed` or `cancelled`, the system
  (shall) show its `error` text in place of findings.

### Results views

- **AC-23** (US-6) КОЛИ the results page is in Columns view, the system (shall)
  show per column the finding cards (severity icon and label, title, `file:line`),
  the count "N findings" excluding dismissed findings, and a "View trace" button.
- **AC-24** (US-6) КОЛИ the results page is in Tabs view, the system (shall)
  show one tab per agent with its name and score, a summary card (score,
  summary, duration, cost, "View trace") and the agent's findings as expandable
  `FindingCard`s fed from the snapshot.
- **AC-25** (US-6) КОЛИ the user expands a finding card, the system (shall) show
  the rationale, the Suggested fix, the confidence as a percentage, and the
  buttons Accept, Dismiss and Turn into eval case.
- **AC-26** (US-6) The system (shall) show the header "N selected agents ·
  parallel", the PR number and title, the meta "N agents · parallel · Xs total ·
  $Y" taken from the snapshot, and a "Configure run" button that opens
  `/repos/:repoId/multi-agent`.
- **AC-27** (US-6) КОЛИ the user switches the Columns/Tabs toggle, the system
  (shall) keep the choice in the URL query `view`, with Columns as the default,
  so that a reload restores it.
- **AC-28** (US-6) КОЛИ the user clicks Accept or Dismiss on a finding, the
  system (shall) call `POST /findings/:id/accept` or `/dismiss` and refresh the
  multi-agent snapshot, the PR reviews and the Smart Diff of that PR.
- **AC-29** (US-6) КОЛИ the user clicks Turn into eval case on a decided
  finding, the system (shall) open the Case Editor seeded from that finding, as
  on the PR page.

### Where agents disagree

- **AC-30** (US-5) The system (shall) compute conflicts at read time from the
  persisted findings of the columns with status `done`, never store them, and
  return none when fewer than 2 columns are `done`.
- **AC-31** (US-5) The system (shall) place line-scoped findings of one file
  into one group when their inclusive `[start_line, end_line]` ranges overlap,
  merged by sorting on start line and sweeping.
- **AC-32** (US-5) The system (shall) treat a finding as file-scoped when its
  `kind` is `secret_leak`, `lethal_trifecta`, `phantom` or `hook`, or its span
  is longer than 50 lines, and group file-scoped findings per file and per
  `kind` regardless of their lines.
- **AC-33** (US-5) The system (shall) take, per agent and group, the most severe
  finding, tie-broken by the smallest finding id, as that agent's take, and
  leave every original finding in its agent's column.
- **AC-34** (US-5) The system (shall) give each `done` column one take per
  group, identified by the column's `run_id` (with nullable `agent_id` and
  `persona`): its severity when it flagged the group, `ignored` with an empty
  `note` when it did not, for a flagging column a `note` equal to the first line
  of the representative finding's rationale truncated to 160 characters with an
  ellipsis, and `dismissed` true when that finding is dismissed.
- **AC-35** (US-5) The system (shall) mark a group `contended` when at least one
  agent flagged it and at least one `done` agent did not, or when at least 2
  agents flagged it with at least 2 distinct severities, and return every group
  with at least one flagging agent.
- **AC-36** (US-5) The system (shall) anchor a group at the smallest start line
  among its flagging findings (tie: smallest finding id), take its `title` from
  that finding, and sort groups by file, line and title.
- **AC-37** (US-5) The system (shall) show under the columns (Columns view) and
  under the tab detail (Tabs view) a block "Where agents disagree" with one row
  per group: `file:line`, title, and one cell per `done` column with its agent
  name ("Deleted agent" when `null`), its severity or "did not flag", and its
  note, muted when the take is `dismissed`.
- **AC-38** (US-5) КОЛИ the user turns on "Show only conflicts", the system
  (shall) show only `contended` groups, and, when none exist, show "No conflicts
  — the agents agree on every flagged location."
- **AC-39** (US-5) ПОКИ any column is `running`, the system (shall) label the
  block "Comparing N of M agents" with N the `done` agents and M all columns, and
  show no "Comparison needs at least 2 completed agents" text, also when N is
  below 2.

### View trace and the drawer

- **AC-40** (US-7) КОЛИ the user clicks "View trace" in a column or in the Tabs
  summary card, the system (shall) open `RunTraceDrawer` for that column's
  `run_id` with its agent name, the PR number and that run's findings taken from
  the snapshot.
- **AC-41** (US-7) The system (shall) show in that drawer exactly the content of
  the PR page: tabs "Trace" and "Live log"; in Trace the sections Configuration,
  Stats, Findings, Project context (when present), Prompt assembly, Tool calls
  and Raw output; and the footer button "Copy raw output".
- **AC-42** (US-7) ПОКИ the column's status is `running`, the system (shall) open
  the drawer with `running` set, on the "Live log" tab, streaming that run's
  `GET /runs/:id/events`.
- **AC-43** (US-7) КОЛИ the column's status is `done`, `failed` or `cancelled`,
  the system (shall) open the drawer on the "Trace" tab with the persisted
  trace, and the "Live log" tab shows the persisted log of that run.
- **AC-44** (US-7) КОЛИ the user clicks "View trace" of another column while a
  drawer is open, the system (shall) replace the open drawer with one for the
  new `run_id`, in its initial tab state, so that one drawer is open at a time.
- **AC-45** (US-7) КОЛИ a drawer is open, the system (shall) keep its `run_id` in
  the URL query `trace` and remove it when the drawer closes.

### PR timeline

- **AC-46** (US-8) The system (shall) show, in the PR page timeline row of a run
  whose `multi_agent_run_id` is set, a "Multi-agent run" link to
  `/repos/:repoId/multi-agent/:number`, and show nothing for other runs.

## Edge cases

- **EC-1** ЯКЩО the workspace has no agents, ТОДІ the system (shall) show, in the
  popover and on the Configure run screen, the empty state with a link to
  `/agents` instead of the agent list.
- **EC-2** ЯКЩО `agentIds` is empty, ТОДІ the system (shall) reject the request
  with `422` and create no row.
- **EC-3** ЯКЩО `agentIds` contains an id that is not an agent of the caller's
  workspace, ТОДІ the system (shall) answer `404` and create no `multi_agent_runs`
  and no `agent_runs` row.
- **EC-4** ЯКЩО `agentIds` contains the same id twice, ТОДІ the system (shall)
  create one run for it.
- **EC-5** ЯКЩО the PR already has a multi-agent run with a child in status
  `running`, ТОДІ the system (shall) answer `409` without `details` and create no
  row, and a standalone single-agent run of the PR does not trigger it.
- **EC-6** ЯКЩО an agent has no `done` run, ТОДІ the system (shall) show `—` for
  its estimated duration and cost, never `0.0s` or `$0.00`.
- **EC-7** ЯКЩО a checked agent's estimated cost is unknown, ТОДІ the system
  (shall) show the total cost of the known agents with the label "partial".
- **EC-8** ЯКЩО the selected PR has `files_count` 0, ТОДІ the system (shall)
  keep the run button disabled and show a message that the PR has no changed
  files.
- **EC-9** ЯКЩО the PR is merged or closed, ТОДІ the system (shall) show the
  existing "review is informational" warning and still allow the run.
- **EC-10** ЯКЩО one agent run fails (for example a provider `429`), ТОДІ the
  system (shall) keep the other agents running, show the failed column with its
  error and exclude that agent from the conflicts.
- **EC-11** ЯКЩО every agent run fails, ТОДІ the system (shall) show every
  column failed with its error, show no conflicts, and keep the "Configure run"
  button available.
- **EC-12** ЯКЩО fewer than 2 columns have status `done` and no column has status
  `running`, ТОДІ the system (shall) replace the block rows with "Comparison needs
  at least 2 completed agents"; the server already returns no conflicts in that
  case, and while any column is `running` the block shows only "Comparing N of M
  agents".
- **EC-13** ЯКЩО the API restarts while a run is `running`, ТОДІ the system
  (shall) show that column as `failed` at the next refresh, because the boot
  reaper marks it failed.
- **EC-14** ЯКЩО a snapshot refresh fails, ТОДІ the system (shall) stop
  refreshing, keep the last data on screen, and show a Retry button.
- **EC-15** ЯКЩО the run is still `running` 20 minutes after the page started
  refreshing, ТОДІ the system (shall) stop refreshing and show "Status is not
  up to date" with a Refresh button.
- **EC-16** ЯКЩО the PR has no multi-agent run, or all its child runs were
  deleted with `DELETE /runs/:id`, ТОДІ the system (shall) answer `404` and show
  "No multi-agent run yet" with a link to the Configure run screen.
- **EC-17** ЯКЩО one child run was deleted, ТОДІ the system (shall) show the
  remaining columns and exclude the deleted agent from the conflicts.
- **EC-18** ЯКЩО a run's agent was deleted (`agent_runs.agent_id` is `NULL`),
  ТОДІ the system (shall) return its column with `agent_id` and `agent_name`
  `null`, label it "Deleted agent", and still include it in the columns and
  conflicts, keyed by its `run_id`.
- **EC-19** ЯКЩО a title, an agent name or a path exceeds one line, ТОДІ the
  system (shall) truncate it with an ellipsis and show the full text on hover and
  to screen readers.
- **EC-20** ЯКЩО the URL query `trace` names a run that is not a column of the
  displayed run, ТОДІ the system (shall) ignore it and open no drawer.
- **EC-21** ЯКЩО a run has no persisted trace and is not running, ТОДІ the system
  (shall) show the drawer's existing "No trace available yet." state.
- **EC-22** ЯКЩО a run row was written before this feature (`multi_agent_run_id`
  is `NULL`), ТОДІ the system (shall) leave it out of every multi-agent run and
  show no timeline link.
- **EC-23** ЯКЩО a finding has no suggestion, ТОДІ the system (shall) omit the
  Suggested fix block of its card.
- **EC-24** ЯКЩО a finding is dismissed, ТОДІ the system (shall) keep it listed,
  muted, in its column and, through the take's `dismissed` flag, in the conflict
  groups, and exclude it from the column count "N findings".
- **EC-25** ЯКЩО the displayed multi-agent run has a column in status `running`,
  ТОДІ the system (shall) keep the run buttons of the popover and of the
  Configure run screen disabled for that PR.

## Non-functional requirements

- **NFR-1** The system (shall) make zero model calls to compute estimates,
  groups, takes and notes.
- **NFR-2** The system (shall) scope every new read and write to the caller's
  `workspace_id` through `getContext()`, including the child-run joins.
- **NFR-3** The system (shall) store no conflict, no total and no multi-agent
  status; parent aggregates are computed from the child `agent_runs` rows, so
  the PR-list cost sum never counts a run twice.
- **NFR-4** The system (shall) open at most one SSE connection on the
  multi-agent page, the one of the open `RunTraceDrawer`, because browsers allow
  6 connections per origin over HTTP/1.1 and the page also polls (researcher R3).
- **NFR-5** The system (shall) create `agent_runs.multi_agent_run_id` as a
  nullable foreign key with `ON DELETE SET NULL`, added by a generated
  migration, with existing rows unchanged.
- **NFR-6** The system (shall) keep `POST /pulls/:id/review`, its request and
  its response unchanged, and rate-limit `POST /pulls/:id/multi-agent-run` at
  10 requests per minute.
- **NFR-7** The system (shall) keep `server/src/vendor/shared/contracts/observability.ts`
  and its `client/` copy identical in shape, with fields that carry `.default()`
  in the server copy declared `.optional()` in the client copy, and client code
  importing only types from `@devdigest/shared`.
- **NFR-8** The system (shall) meet WCAG 2.1 AA on the new screens: every
  control is keyboard operable with a visible focus, status text and icon (never
  colour alone) carry run status and severity, status changes are announced
  through an `aria-live` region, and targets are at least 24 by 24 px.
- **NFR-9** The system (shall) put every new user-facing string into
  `client/messages/en/runs.json` or `prReview.json` as camelCase keys, and
  replace the existing `runs.json` `page.*` strings that contradict the design.
- **NFR-10** The system (shall) leave `agent-runner/`, `ci/` and
  `server/src/modules/reviews/run-executor.ts` unmodified.

## Inputs and provenance

| Value | Source | Trusted? | Design source |
|---|---|---|---|
| Agent list, name, description, `enabled` | `agents` table via `GET /agents` | yes — workspace-authored text, rendered as text | screenshots 1, 3 |
| Selected agent ids | user input, request body `agentIds` | validated: uuid, workspace-scoped | screenshots 1, 3 |
| PR list, title, `files_count`, status | `pull_requests` via `GET /repos/:id/pulls` | no — PR title and author come from GitHub | screenshots 2, 3 |
| Per-agent estimate | `agent_runs.duration_ms`, `cost_usd` of last 5 `done` runs; `null` stays `null` | yes | screenshots 1, 3; user text "за минулими запусками" |
| Run status | `agent_runs.status` (`running`, `done`, `failed`, `cancelled`) | yes | screenshots 1, 4 |
| Failure reason | `agent_runs.error` (provider text) | no — external text | screenshot 1 (429 row) |
| Score | `agent_runs.score`, derived from grounded findings, never the model verdict (`reviewer-core/src/review/reduce.ts:27-30`) | yes | screenshots 4, 5 |
| Findings (every `FindingRecord` field: title, file, lines, severity, kind, rationale, suggestion, confidence, evidence, `accepted_at`, `dismissed_at`) | `findings` joined through `reviews.run_id`, carried whole in each snapshot column | no — model output | screenshots 4, 5 |
| Conflict group, take, note | computed at read time from `done` columns; rule from upstream `15c8506` (researcher R1) | derived from untrusted findings | screenshots 4, 5 |
| `multi_agent_run_id` | `agent_runs.multi_agent_run_id` (new, nullable FK, `ON DELETE SET NULL`; researcher R2) | yes | user text "групування запусків" |
| Totals (cost, wall time, count) | computed from child `agent_runs` (researcher R2: never store) | yes | screenshot 4 meta line |
| Trace, live events | `run_traces`, `RunBus` via `GET /runs/:id/trace`, `GET /runs/:id/events` | no — contains prompts and model output | user's added requirement |
| URL query `view`, `trace` | user-controlled URL | no | derived from the view toggle and the drawer deep link |
| SSE connection limit | 6 per origin over HTTP/1.1 (researcher R3: MDN EventSource, Chromium and Firefox pool settings) | yes | researcher R3 |

Note: the PR page mounts `RunTraceDrawer` without the `running` prop
(`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:206-214`), so its Live
log tab shows the persisted log there. This spec passes `running` for a running
column and leaves the PR page as it is (Q-14).

## Untrusted inputs

- **UI-1** PR title (GitHub PR author) → PR selector, results header: the system
  (shall) render it as escaped text, never as HTML or Markdown.
- **UI-2** Finding `title` and `file` (model output) → column cards, group rows,
  tab list: the system (shall) render them as escaped text.
- **UI-3** Finding `rationale` and `suggestion` (model output) → expanded
  `FindingCard`: the system (shall) render them through the sanitised Markdown
  component with raw HTML disabled.
- **UI-4** Conflict `note` (first line of a model rationale) → disagreement
  cell: the system (shall) render it as plain text, truncated to 160 characters.
- **UI-5** Finding `file` and line (model output) → the GitHub blob link of a
  finding: the system (shall) build the URL with the existing `githubBlobUrl`
  helper, which encodes the path, and open it with `noopener`.
- **UI-6** Agent name and description (workspace author) → picker, cards, column
  headers: the system (shall) render them as escaped text.
- **UI-7** `agent_runs.error` (provider text) → failed column: the system
  (shall) render it as escaped text, limited to two lines with the full text on
  hover.
- **UI-8** URL query `trace` → `GET /runs/:id/trace` and `GET /runs/:id/events`
  paths: the system (shall) request them only for a `run_id` that is a column of
  the displayed multi-agent run.
- **UI-9** URL query `view` → view selection: the system (shall) accept only
  `columns` and `tabs` and fall back to Columns for any other value.
- **UI-10** Request body `agentIds` → agent lookup and run creation: the system
  (shall) validate each id as a uuid and resolve it only inside the caller's
  workspace.

## Open questions

Q-1 to Q-18 and Q-25 are RESOLVED: the user confirmed the default shown in each
(Q-17, Q-18 and Q-25 are explicit user decisions). Q-19 to Q-24 are assumed defaults proposed by
`implementation-planner` and adopted here; the user has not confirmed them and
can overturn any of them on review. Q-1 to Q-16 map to the intake questions Q0
to Q11 plus follow-ups.

- **Q-1** (intake Q0) Which prior art to base the rules on? — default: upstream
  V2 (`15c8506` server, `3195be9`, `a7ca030`, `4f2c413`, `d7f2467` client;
  routes `POST /pulls/:id/multi-agent-run`, `GET /pulls/:id/multi-agent`,
  `GET /multi-agent/estimates`; the conflict rule of AC-30 to AC-36), not V1
  (`d65779f`, `cf47df3`) — owner: user. RESOLVED: confirmed by the user.
- **Q-2** (intake Q1) Add the new routes and the multi-run service as new files
  in the `reviews` module, run each agent through the existing executor with
  `p-queue`, and add the link column by migration, instead of changing
  `run-executor.ts` and `RunRequest`? — default: yes; `executeRuns` is called once
  per agent, so the diff and intent load once per agent — owner: user. RESOLVED:
  confirmed by the user.
- **Q-3** (intake Q2) The grouping and take rule of AC-30 to AC-36, with an empty
  `note` and no model-generated reason for **did not flag**. — default: as
  written — owner: user. RESOLVED: confirmed by the user.
- **Q-4** (intake Q3) May both vendor copies of `observability.ts` and
  `trace.ts` be edited in one commit? Needed changes: `AgentColumn.status` gains
  `cancelled` and the column gains `error`; `AgentColumnFinding` becomes a
  superset of `FindingRecord` (`end_line`, `rationale`, `suggestion`,
  `confidence`, `evidence`, `accepted_at`, `dismissed_at` and the other
  `FindingRecord` fields); `Conflict` gains `contended` and its doc comment is
  updated in both copies (a group is no longer always a disagreement, Q-12);
  `RunSummary` gains nullish `multi_agent_run_id`; new request and estimates
  schemas; in the client copy `.default()` fields become `.optional()`
  (root `INSIGHTS.md`). Nullability and take fields: Q-19. — default: yes, both
  copies — owner: user. RESOLVED: confirmed by the user.
- **Q-5** (intake Q4) Learn, and Reply to author, are out of this spec. —
  default: out (Non-goal); Learn needs a memory backend that does not exist —
  owner: user. RESOLVED: confirmed by the user.
- **Q-6** (intake Q5) Routes: `/repos/:repoId/multi-agent` (configure) and
  `/repos/:repoId/multi-agent/:number` (results, the PR's latest multi-agent
  run). The client dependency-cruiser rule `no-cross-route-private-component`
  checks the first segment under `app/` (`client/.dependency-cruiser.cjs:47-57`),
  so a page under `app/repos/[repoId]/multi-agent/` can import the PR route's
  `RunTraceDrawer` and `FindingCard` directly, which a top-level `/multi-agent`
  route could not — default: as written — owner: user. RESOLVED: confirmed by
  the user.
- **Q-7** (intake Q6) Estimate = median of the last 5 `done` runs of the agent on
  any PR; total time = maximum, total cost = sum of known costs, "partial" when
  one is unknown. Response shape and tie rules: Q-21. — default: as written —
  owner: user. RESOLVED: confirmed by the user.
- **Q-8** (intake Q7) The button needs at least 2 checked agents on the client
  while the server accepts at least 1; enabled agents start checked. — default:
  as written — owner: user. RESOLVED: confirmed by the user.
- **Q-9** (intake Q8) `409` while a child of the PR's multi-agent run is
  `running` (scope clarified in Q-23). — default: as written — owner: user.
  RESOLVED: confirmed by the user.
- **Q-10** (intake Q9) Dismissed findings stay in the conflict groups, muted, and
  leave the column counts. — default: as written (root `INSIGHTS.md` Decision on
  counters) — owner: user. RESOLVED: confirmed by the user.
- **Q-11** (intake Q10, Q11) One spec rather than two (server and client), and
  all selected agents run concurrently with no cap. — default: one spec, no cap;
  the cap is the named constant of Q-22 — owner: user. RESOLVED: confirmed by the
  user.
- **Q-12** What does "Show only conflicts" show when off? Only contended groups
  are emitted by upstream V2, so the toggle would have nothing to hide. —
  default: the server returns every group with at least one flagging agent plus
  the `contended` flag; off shows all groups, on shows only contended (AC-35,
  AC-38; matches the existing `runs.json` key `conflicts.empty`) — owner: user.
  RESOLVED: confirmed by the user.
- **Q-13** Keep the existing "Run all enabled agents" and single-agent actions in
  the Run Review control next to the picker (AC-4)? The mockup popover shows only
  the picker. — default: keep, so single-agent runs stay possible — owner: user.
  RESOLVED: confirmed by the user.
- **Q-14** Should the PR page drawer also receive `running` for a running run?
  Today it does not (`page.tsx:206-214`). — default: no, the PR page is
  unchanged — owner: user. RESOLVED: confirmed by the user.
- **Q-15** Polling gives up after 20 minutes (EC-15), refreshes every 4 seconds
  (AC-18), the popover and configure cards show the agent's `description`, not its
  last verdict, and agents have neutral icons and colours (no icon or colour field
  exists in `agents`). — default: as written — owner: user. RESOLVED: confirmed
  by the user.
- **Q-16** Is the timeline link (AC-46, needs `RunSummary.multi_agent_run_id`) in
  scope? — default: yes, because the PR page is inside the worktree boundary —
  owner: user. RESOLVED: confirmed by the user.

- **Q-17** Edit the vendored `client/src/vendor/ui/nav.ts` to add the sidebar entry
  (`key: "multi-agent"`, `href: /repos/:repoId/multi-agent`)? — default: yes —
  owner: user. RESOLVED: the user explicitly allowed this edit (AC-8).
- **Q-18** Does `AgentColumnFinding` carry the whole finding so the snapshot alone
  feeds `FindingCard` and `RunTraceDrawer`, with no per-column
  `GET /runs/:id/findings`? — default: yes, a superset of `FindingRecord`
  (AC-16) — owner: user. RESOLVED: decided by the user.
- **Q-19** Planner recommendation, not confirmed by the user: `AgentColumn.agent_id`
  and `agent_name` become nullable (the UI shows "Deleted agent", EC-18);
  `ConflictTake` gains `run_id` as the take key, which handles several columns with
  a null `agent_id`, and `dismissed: boolean` for the muted rendering (AC-34,
  EC-24); `ConflictTake.agent_id` and `persona` become nullable; the `Conflict`
  doc comment is updated in both copies. — default: as written — owner: user.
- **Q-20** Planner recommendation, not confirmed by the user: the popover button
  is disabled when N is below 2, as on the Configure run screen, and single-agent
  runs stay available through the existing menu actions (AC-47, AC-4). —
  default: as written — owner: user.
- **Q-21** Planner recommendation, not confirmed by the user: the estimates
  response is `{agents: [{agent_id, duration_ms: int|null, cost_usd: number|null,
  runs_used: int}]}`; the median of an even count is the mean of the two middle
  values; `null` costs are ignored for the cost median while `runs_used` counts
  all `done` runs; `source='ci'` runs are included (AC-5). — default: as written —
  owner: user.
- **Q-22** Planner recommendation, not confirmed by the user: concurrency uses
  `p-queue` with a named constant `MULTI_AGENT_CONCURRENCY = Infinity` in
  `server/src/modules/reviews/constants.ts` (AC-14). — default: as written —
  owner: user.
- **Q-23** Assumed, not confirmed by the user: the `409` of EC-5 triggers only for
  running children of a multi-agent run, never for standalone single-agent runs,
  carries no `details`, and the client branches on the status only. — default: as
  written — owner: user.
- **Q-24** Assumed, not confirmed by the user: the wall time of AC-17 is
  max(`ran_at` + `duration_ms`) minus min(`ran_at`); `ran_at` is the row creation
  time, so it is not exactly the start time. — default: as written — owner: user.
- **Q-25** Which text does the block show with fewer than 2 `done` columns while
  another column is still `running`? — default: only "Comparing N of M agents"
  (AC-39); "Comparison needs at least 2 completed agents" (EC-12) appears only when
  no column is `running`; the server returns no conflicts while fewer than 2
  columns are `done` (AC-30) — owner: user. RESOLVED: the user explicitly
  confirmed this clarification.
