# Spec: Eval Pipeline
Spec ID: SPEC-08
Status: approved
Supersedes: —

## Проблема й користувач

Every `file:line` reference in this spec is at branch `L06-homework`, commit
`13a8392`.

The person who tunes a reviewer agent — edits its system prompt, swaps its
model, links or edits a skill — has no way to tell whether the change made the
agent better or worse. The only signal today is re-running the agent on live
PRs and eyeballing the findings. That compares two different inputs: a live run
reads the current PR head, repo-intel, project and PR context and the classified
intent (`server/src/modules/reviews/run-executor.ts:124-170,250-364`), all of
which drift between runs.

The dataset to measure against already exists and is unused: every finding the
user accepted or dismissed in L01–L05 (`findings.accepted_at` /
`findings.dismissed_at`, `server/src/db/schema/reviews.ts:51-52`; accept and
dismiss are mutually exclusive, `server/src/modules/reviews/repository/review.repo.ts:120-144`).
`server/src/modules/reviews/findings.ts:6-10` names these decisions as the
dataset for eval cases.

Pieces exist but nothing connects them:

- tables `eval_cases` and `eval_runs` are migrated
  (`server/src/db/schema/eval.ts:7-35`), but `eval_runs` holds one row per case
  with no suite grouping, agent version, status or `workspace_id`, and
  `eval_cases.owner_id` has no FK to `agents`;
- contracts `EvalCase`, `EvalRun`, `EvalCaseInput`, `EvalRunRecord`,
  `EvalDashboard` exist in both vendor copies
  (`server/src/vendor/shared/contracts/knowledge.ts:167-202`,
  `server/src/vendor/shared/contracts/eval-ci.ts:20-89`) with
  `expected_output: z.unknown()`;
- agents are versioned (`agents.version`, `agent_versions`,
  `server/src/modules/agents/repository.ts:111-213`), but the snapshot stores
  skill ids, not skill bodies (`repository.ts:193-210`), so a skill edit
  changes the prompt without changing the version;
- i18n keys are staged in `client/messages/en/eval.json`; no module, route,
  hook or screen reads or writes the eval tables (Grep over `evalCases|evalRuns`
  outside `db/schema*` finds nothing).

The cost today: a prompt change that silently breaks precision ships unnoticed,
and the user's accept/dismiss work is never reused.

## Goals / Non-goals

**Goals**
- One click on an accepted or dismissed finding turns it into an eval case for
  the agent that produced it: accepted → `must_find`, dismissed →
  `must_not_flag`, with a frozen input (the finding file's diff, PR title, PR
  body).
- An **Evals** tab in the Agent editor: KPI cards, the case list with each
  case's latest result, a read-only case modal with rename, case deletion, and
  **Run all evals**.
- `POST /agents/:id/eval-runs` runs the agent over every case of its set in the
  background, on frozen inputs and a frozen agent snapshot, so runs of
  different agent versions are comparable.
- Scoring entirely in code, zero LLM calls: match = same file + overlapping
  line range; `recall`, `precision`, `citation_accuracy`, pass/fail per case,
  with TP / FP / unlabeled counts shown next to the ratios.
- An **Eval Dashboard** page in the sidebar (Skills Lab): every agent's latest
  metrics and the recent runs across agents; a per-agent detail page with KPI
  cards, metric trend, run history and **Compare** of two runs (metric deltas
  on common cases, cost delta, system-prompt diff, skill changes).
- The course gate `pnpm verify:l06` is defined in `server/package.json` and is
  green.
- Design decisions borrow from the upstream reference implementation SPEC-12
  (`upstream/full-functionality:specs/12-eval-pipeline.md`, researcher R2)
  where they hold; this spec and its code are our own.

**Non-goals**
- Not doing eval cases or runs for skills (`owner_kind: 'skill'`); the skill
  editor's Evals placeholder and disabled **Run on evals** button
  (`client/src/app/skills/_components/SkillEditor/SkillEditor.tsx:57`) stay as
  they are — the upstream reference splits this into a separate spec.
- Not doing **Promote vN** (Compare footer, mockup 4): no restore-version route
  exists (`server/src/modules/agents/routes.ts:86-214`).
- Not doing **Run all agents** (mockup 2), the **30 days** range filter, or the
  alert banner (mockup 3).
- Not doing a per-case run, **Run case**, **Run on save**, or **+ New eval
  case** from scratch with a JSON editor (mockups 5–6): cases come only from
  real triaged findings, per the course brief.
- Not doing the Agent editor's **Stats** and **CI** tabs shown in mockup 5.
- Not doing a line-tolerance window (e.g. ±5 lines) for matching; strict
  inclusive overlap only.
- Not doing a per-run rate limit beyond single-flight per agent (EC-10).
- Not repeating a case more than once per run to average model variance —
  temperature is already 0 in every adapter (researcher R3).
- Not doing approach A (group a suite run inside `eval_runs.actual_output`
  jsonb without a migration) — considered and rejected because status,
  single-flight, history and stale-run reaping would all be jsonb queries and
  the run would carry no `workspace_id`.
- Not doing approach C (run cases through `ReviewRunExecutor` on a synthetic
  PR) — considered and rejected because it writes `reviews`, `findings`,
  `agent_runs` and `run_traces` rows that inflate PR counters, cost roll-ups
  and agent stats, and it pulls in the non-frozen enrichments.
- Not editing the course hand-in path here: the course wants
  `specs/eval-pipeline.md`; the main session creates that copy after this spec
  is approved. `verify:l06` checks no spec path (researcher R1).

### Hand-in procedure (manual, not code)

The course acceptance includes an experiment. It is a manual procedure, run
after the feature is built, and its outputs are a screenshot and the numbers
in the PR description:

1. Pick one agent (default: Security Reviewer). On real PRs, run that agent,
   then accept and dismiss its findings until at least 8 decided findings
   exist, with at least 2 of each decision.
2. Click **Turn into eval case** on each of them: the agent's set holds ≥ 8
   cases, both `must_find` and `must_not_flag`.
3. Run evals on the current prompt (run A).
4. Change the system prompt substantively (e.g. add a rule that targets one
   failing `must_find` case), save (version bumps), run evals (run B).
5. Break the prompt deliberately (e.g. "Flag every changed line as a
   finding"), save, run evals (run C) — expect precision to drop through FP
   on `must_not_flag` cases.
6. Select runs A and B (then B and C) on the agent's dashboard page and open
   **Compare**; take the screenshot of the Compare modal with both prompts'
   diff and the metric deltas.
7. Restore the good prompt.

## User stories

- **US-1** As an agent author triaging findings on a PR, I want to turn an accepted or dismissed finding into an eval case with one click, so that my real decisions become the agent's regression set.
- **US-2** As an agent author, I want to see every eval case in my agent's set with its latest result, open it, rename it and delete it, so that I know what the set covers and keep it clean.
- **US-3** As an agent author, I want to run my agent on all cases of its set on frozen inputs, so that results of different prompt, model or skill versions are comparable.
- **US-4** As an agent author, I want to see recall, precision and citation accuracy of a run, with their counts, computed without any LLM, so that I can trust the numbers.
- **US-5** As an agent author, I want to browse an agent's run history and compare two runs side by side with the prompt diff, so that I can see whether the old or the new prompt is better.
- **US-6** As an agent author, I want one dashboard with the latest metrics of every agent and the recent runs across agents, so that I can spot a regression without opening each agent.

## Acceptance criteria (EARS)

### Case from a finding
- **AC-1** (US-1) КОЛИ the user expands a finding card on the PR page, the system (shall) show a **Turn into eval case** button (flask icon) in the card's action row after Accept and Dismiss.
- **AC-2** (US-1) КОЛИ the user clicks **Turn into eval case** on a finding with `accepted_at` set, the system (shall) create, through one `POST /findings/:id/eval-case` request with no further input, an eval case owned by the finding's agent with expectation `{type: "must_find", file, start_line, end_line}` copied from the finding.
- **AC-3** (US-1) КОЛИ the user clicks **Turn into eval case** on a finding with `dismissed_at` set, the system (shall) create, through one `POST /findings/:id/eval-case` request with no further input, an eval case owned by the finding's agent with expectation `{type: "must_not_flag", file, start_line, end_line}` copied from the finding.
- **AC-4** (US-1) КОЛИ the server creates an eval case, the system (shall) store as the case's frozen input the unified diff of the finding's file only — `diff --git`, `---` and `+++` headers plus every hunk of that file — taken from the PR's diff at creation time, together with the PR's title, body, number and repo full name.
- **AC-5** (US-1) КОЛИ the server creates an eval case, the system (shall) store the finding's `severity`, `category` and `title` inside the expectation as display-only fields that scoring never reads.
- **AC-6** (US-1) КОЛИ the server creates an eval case, the system (shall) name it with a slug of the finding title — lowercase `a-z`, `0-9` and `-`, cut to at most 60 characters, `eval-case` when the slug is empty — with `-2`, `-3`, … appended after the cut when the agent already has a case of that name.
- **AC-7** (US-1) КОЛИ the server creates an eval case, the system (shall) store the source finding's id on the case and respond `201` with the created case.
- **AC-8** (US-1) КОЛИ `POST /findings/:id/eval-case` responds `201`, the system (shall) replace the button with a disabled **In eval set** state that links to the agent's Evals tab, without a page reload.
- **AC-9** (US-1) КОЛИ the PR page renders a finding that `GET /pulls/:id/eval-case-links` reports as the source of an existing eval case, the system (shall) show the **In eval set** state instead of the **Turn into eval case** button.

### Agent's case set
- **AC-10** (US-2) КОЛИ the user opens `/agents/:id?tab=evals`, the system (shall) show an **Evals** tab after **Context** in the Agent editor tab bar, selected.
- **AC-11** (US-2) КОЛИ the Evals tab loads, the system (shall) list every eval case of the agent, newest first, each row showing the case name, the expectation type, `file:start_line-end_line`, a `SEVERITY · category` tag for `must_find` or a `must not flag` tag for `must_not_flag`, and the case's result in the agent's latest finished run.
- **AC-12** (US-2) The system (shall) show each case's latest result as one of `passed`, `failed`, `errored` or `never run`, each with an icon and a text label, and for a scored case the text "expected {n}, got {m}", where n is 1 for `must_find` and 0 for `must_not_flag` and m is the number of kept findings of that case overlapping the expectation.
- **AC-13** (US-2) КОЛИ the Evals tab loads, the system (shall) show above the list the heading **Eval cases** with "{passed} / {scored} passing" for the agent's latest finished run.
- **AC-14** (US-2) КОЛИ the user clicks a case row, the system (shall) open a case modal showing, read-only, the frozen diff as a diff view, the frozen PR title and body, the expectation (type, file, lines, severity, category, title), a link to the source PR, and the case's last result with its duration and cost.
- **AC-15** (US-2) КОЛИ the user changes the name in the case modal and clicks **Save**, the system (shall) persist the new name through `PATCH /eval-cases/:id` and show it in the list without a page reload.
- **AC-16** (US-2) КОЛИ the user clicks the delete action of a case, the system (shall) ask for confirmation in a dialog that names the case.
- **AC-17** (US-2) КОЛИ the user confirms the deletion of a case, the system (shall) delete it through `DELETE /eval-cases/:id` and remove it from the list without a page reload.
- **AC-18** (US-2) КОЛИ a case is deleted, the system (shall) keep the per-case results and the metrics of every past run that included it unchanged.

### Running the set
- **AC-19** (US-3) КОЛИ the user clicks **Run all evals** in the Evals tab or **Run eval** on the agent's dashboard page, the system (shall) call `POST /agents/:id/eval-runs`, which responds `202` with the new run's `id` and `status: "running"` before any case is reviewed.
- **AC-20** (US-3) КОЛИ an eval run starts, the system (shall) record on the run the agent's `version` at that moment and a snapshot of its effective inputs: `provider`, `model`, `strategy`, `system_prompt`, and the ordered names and bodies of the skills that are linked and enabled for the prompt.
- **AC-21** (US-3) КОЛИ an eval run starts, the system (shall) record the ids and names of every case in the agent's set at that moment as the run's case set.
- **AC-22** (US-3) ПОКИ an eval run executes, the system (shall) review the run's cases one at a time, each with the case's parsed frozen diff, a task line built from the frozen PR title, the frozen PR body as the PR description, and the run's snapshotted provider, model, strategy, system prompt and skill bodies, and with no repo-intel, project context, PR context, intent or out-of-scope filter.
- **AC-23** (US-3) КОЛИ the review of a case ends, the system (shall) persist that case's result on the run: the kept findings, the grounding kept and total counts, the pass state, the duration and the cost.
- **AC-24** (US-3) КОЛИ every case of a run has a result and at least one case was scored, the system (shall) store the run's aggregate metrics, set `finished_at`, and set `status` to `completed` when no case errored or to `partial` when one or more cases errored.
- **AC-25** (US-3) ПОКИ the agent has a run with `status: "running"`, the system (shall) disable **Run all evals** and **Run eval** for that agent and show "Running case {k} of {n}", updated by polling `GET /eval-runs/:id`.
- **AC-26** (US-3) КОЛИ a polled run leaves `status: "running"`, the system (shall) stop polling, refresh the KPI cards, the case list and the run history, and announce the final status in an `aria-live="polite"` region.

### Scoring and metrics
- **AC-27** (US-4) The system (shall) score a `must_find` case as passed when at least one kept finding of that case has a `file` equal to the expectation's `file` and a line range `[start_line, end_line]` that overlaps the expectation's range inclusively, and as failed otherwise.
- **AC-28** (US-4) The system (shall) score a `must_not_flag` case as passed when no kept finding of that case has a `file` equal to the expectation's `file` with a line range overlapping the expectation's range inclusively, and as failed otherwise.
- **AC-29** (US-4) The system (shall) compare each kept finding only with the expectation of the case it was produced on, and classify it as exactly one of TP (overlaps a `must_find` expectation), FP (overlaps a `must_not_flag` expectation) or unlabeled (overlaps neither).
- **AC-30** (US-4) The system (shall) compute `recall` as passed `must_find` cases ÷ scored `must_find` cases.
- **AC-31** (US-4) The system (shall) compute `precision` as 1 − FP ÷ (number of kept findings across all scored cases).
- **AC-32** (US-4) The system (shall) compute `citation_accuracy` as the sum of grounding-kept findings ÷ the sum of grounding-total findings (kept + dropped) across all scored cases.
- **AC-33** (US-4) The system (shall) compute `traces_passed` as the number of passed scored cases and `traces_total` as the number of scored cases, and store `cases_errored` as the number of errored cases.
- **AC-34** (US-4) The system (shall) return with every run its `tp`, `fp` and `unlabeled` counts and each metric's numerator and denominator next to the ratio.
- **AC-35** (US-4) КОЛИ the Evals tab loads, the system (shall) show four KPI cards — Recall, Precision and Citation accuracy as integer percentages, and Traces passed as `{traces_passed}/{traces_total}` — for the agent's latest finished run, each percentage with its signed delta in integer points against the agent's previous finished run.
- **AC-36** (US-4) КОЛИ the KPI cards show a finished run, the system (shall) show under Precision the line "TP {tp} · FP {fp} · unlabeled {unlabeled}" and under Recall the line "{passed} of {scored} must-find cases".
- **AC-37** (US-4) КОЛИ the user opens a run from any run table, the system (shall) show its per-case results: case name, expectation type, result state, "expected {n}, got {m}", each kept finding's `file:start_line-end_line`, title and TP/FP/unlabeled label, grounding `{kept}/{total}`, duration, cost and error reason.
- **AC-38** (US-4) The system (shall) treat a "finished run" as a run with `status` `completed` or `partial`.

### History and Compare
- **AC-39** (US-5) КОЛИ the user clicks **View full dashboard →** in the Evals tab, the system (shall) open the agent's Eval Dashboard detail page.
- **AC-40** (US-5) КОЛИ the agent's Eval Dashboard detail page loads, the system (shall) show a breadcrumb `Skills Lab > Eval Dashboard > {agent}`, an **All agents** back link, the agent name with its model badge, the line "{finished runs} runs on the {cases}-case set", an agent dropdown that opens another agent's detail page, and a **Run eval** button.
- **AC-41** (US-5) КОЛИ the detail page loads, the system (shall) show three KPI cards — Recall, Precision, Citation accuracy — for the latest finished run, each with its signed delta in integer points against the previous finished run and a sparkline of that metric over the last 10 finished runs.
- **AC-42** (US-5) КОЛИ the detail page loads, the system (shall) show a **Metric trend** line chart with three labelled series (recall, precision, citation) over the agent's last 30 finished runs in chronological order, the x-axis labelled with each run's `v{version}`.
- **AC-43** (US-5) КОЛИ the detail page loads, the system (shall) show a **Recent runs** table of the agent's last 50 runs, newest first, with columns: checkbox, ran at, version `v{n}`, recall, precision, citation (each a bar plus integer percent), pass `{traces_passed}/{traces_total}`, cost, status.
- **AC-44** (US-5) ПОКИ exactly two runs are selected in the Recent runs table, the system (shall) enable the **Compare** button and show "2 selected" next to the table title.
- **AC-45** (US-5) КОЛИ the user clicks **Compare**, the system (shall) open a Compare modal titled "Compare runs · v{old} → v{new}", where old is the selected run that started earlier.
- **AC-46** (US-5) КОЛИ the Compare modal opens, the system (shall) show four cards — Recall, Precision, Citation, Cost — each as "{old} → {new}" with the signed delta (integer points for ratios, dollars with two decimals for cost), the ratios computed by `GET /eval-runs/compare?a=…&b=…` over only the cases present in both runs and the Cost card showing each whole run's `cost_usd`.
- **AC-47** (US-5) КОЛИ the Compare modal opens, the system (shall) show the line "{n} common cases · {a} only in v{old} · {b} only in v{new}".
- **AC-48** (US-5) КОЛИ the Compare modal opens, the system (shall) show a line-based diff of the two runs' snapshotted system prompts under **System prompt diff**, each removed line marked `−` with the label v{old} and each added line marked `+` with the label v{new}.
- **AC-49** (US-5) КОЛИ the two compared runs' snapshotted skill lists differ by name, order or body, the system (shall) list under the prompt diff the skills added, removed and changed between v{old} and v{new}.
- **AC-50** (US-5) КОЛИ the two compared runs have identical snapshotted system prompts, the system (shall) show "System prompt unchanged" in place of the diff.

### Cross-agent dashboard
- **AC-51** (US-6) The system (shall) show an **Eval Dashboard** item in the sidebar's Skills Lab group after Conventions, linking to the Eval Dashboard page and marked active while that page or one of its agent detail pages is open.
- **AC-52** (US-6) КОЛИ the user opens the Eval Dashboard page, the system (shall) show the title **Eval Dashboard** with the subtitle "Regression harness across all reviewer agents · pick an agent to see its runs".
- **AC-53** (US-6) КОЛИ the Eval Dashboard page loads, the system (shall) show one card per agent of the workspace with the agent name, model badge, "Last run v{n} · {ran at} · {traces_passed}/{traces_total} pass" of its latest finished run, a recall sparkline over its last 10 finished runs, its latest Recall, Prec and Cite percentages, and a chevron that opens the agent's detail page.
- **AC-54** (US-6) КОЛИ the Eval Dashboard page loads, the system (shall) show a **Recent eval runs · all agents** table of the workspace's last 20 runs, newest first, with columns agent, ran at, version, recall, precision, citation (bar plus integer percent) and pass, where clicking a row opens that agent's detail page.

### Read API
- **AC-55** (US-2) КОЛИ the client requests `GET /agents/:id/eval-cases`, the system (shall) return every eval case of the agent, newest first, each with its `latest_result` from the agent's latest finished run, or `null` when the case was not in that run.
- **AC-56** (US-2) КОЛИ the client requests `GET /eval-cases/:id`, the system (shall) return the full case — name, expectation, frozen diff, frozen PR meta — and `source` as `{repo_id, pr_number}`, or `null` when the source PR no longer exists.
- **AC-57** (US-4, US-5) КОЛИ the client requests `GET /agents/:id/eval-overview`, the system (shall) return `{agent, cases_total, finished_runs, running_run_id, latest, previous, trend, runs}`, where `latest` and `previous` are the two newest finished runs (`null` when absent), `trend` holds at most 30 finished runs in chronological order, and `runs` holds at most 50 runs newest first.
- **AC-58** (US-3, US-4) КОЛИ the client requests `GET /eval-runs/:id`, the system (shall) return the full run with its snapshot, case set, metrics and `case_results`, and the counts `cases_done` and `cases_total` from which the client derives the "case k of n" progress.
- **AC-59** (US-6) КОЛИ the client requests `GET /eval-dashboard`, the system (shall) return one summary per agent of the workspace (latest finished run, last 10 finished runs' recall) and the workspace's last 20 runs, newest first.
- **AC-60** (US-5) КОЛИ the client requests `GET /eval-runs/compare?a=…&b=…` for two finished runs of one agent, the system (shall) return, for recall, precision and citation accuracy, the old and the new value over common cases (the client computes the signed delta, NFR-8), both runs' whole `cost_usd`, the counts of common and run-only cases, the system-prompt line diff, and the skill changes.
- **AC-61** (US-1) КОЛИ the client requests `GET /pulls/:id/eval-case-links`, the system (shall) return a list of `{finding_id, case_id, agent_id}` links, one for every finding of that PR that is the source of an eval case in the caller's workspace (the `agent_id` identifies the agent whose Evals tab AC-8 links to), leaving `FindingRecord` unchanged.

## Edge cases

- **EC-1** ЯКЩО the finding has neither `accepted_at` nor `dismissed_at`, ТОДІ the system (shall) render **Turn into eval case** disabled with the tooltip "Accept or dismiss this finding first" and the server rejects the request with `422` `finding_undecided`.
- **EC-2** ЯКЩО the finding's review has no `agent_id` or that agent no longer exists in the workspace, ТОДІ the system (shall) render the button disabled with the tooltip "The agent that produced this finding was deleted" and the server rejects the request with `422` `agent_missing`.
- **EC-3** ЯКЩО an eval case already exists for the finding (double click, second tab, earlier session), ТОДІ the system (shall) create no second case and respond `409` `eval_case_exists` with the existing case's id, which the client shows as **In eval set**.
- **EC-4** ЯКЩО the finding's file is absent from the PR's current diff or its patch is empty (binary, too large), ТОДІ the system (shall) reject case creation with `422` `no_patch` and show "This file has no diff to freeze".
- **EC-5** ЯКЩО the finding's line range intersects no hunk's new-side lines of the frozen file diff (e.g. the PR was force-pushed after the review), ТОДІ the system (shall) reject case creation with `422` `range_outside_diff` and show "The PR changed since this review — re-run the review and create the case from the new finding".
- **EC-6** ЯКЩО the finding's `kind` is one of `secret_leak`, `lethal_trifecta`, `phantom` or `hook`, ТОДІ the system (shall) require only that its file is present in the frozen diff, matching the grounding gate's full-file exemption (`reviewer-core/src/grounding.ts:16,66-70`).
- **EC-7** ЯКЩО the user flips the finding's decision after the case was created, ТОДІ the system (shall) keep the case's expectation type unchanged.
- **EC-8** ЯКЩО the source finding, its review or its PR is deleted after the case was created, ТОДІ the system (shall) keep the case and its frozen input and show "Source no longer available" in place of the source PR link.
- **EC-9** ЯКЩО the agent is deleted, ТОДІ the system (shall) delete its eval cases and eval runs in the same operation.
- **EC-10** ЯКЩО `POST /agents/:id/eval-runs` arrives while the agent has a run with `status: "running"`, ТОДІ the system (shall) start nothing and respond `409` `eval_run_in_progress` with the running run's id.
- **EC-11** ЯКЩО the agent has zero eval cases, ТОДІ the system (shall) render **Run all evals** and **Run eval** disabled with the hint "Add eval cases from PR findings first" and the server rejects a run start with `422` `no_eval_cases`.
- **EC-12** ЯКЩО a case's review fails (provider error, missing API key, structured-output failure after retries, frozen diff that parses to zero files), ТОДІ the system (shall) store that case's result as `errored` with the error reason and `pass: null`, and exclude it from every metric's numerator and denominator.
- **EC-13** ЯКЩО every case of a run errored, ТОДІ the system (shall) set the run's `status` to `errored`, store all metrics as `null`, and show the first case's error reason on the run.
- **EC-14** ЯКЩО the API process restarts while a run has `status: "running"`, ТОДІ the system (shall) set that run's `status` to `errored` with the reason `interrupted` on the next boot.
- **EC-15** ЯКЩО the client has polled a run for 10 minutes and it is still `running`, ТОДІ the system (shall) stop polling and show "The eval run is still in progress — reload to check its status".
- **EC-16** ЯКЩО a polling request fails, ТОДІ the system (shall) stop polling, rely on the global error toast without adding a second one, and show a **Retry** action that resumes polling.
- **EC-17** ЯКЩО the agent's configuration or a linked skill changes while a run executes, ТОДІ the system (shall) finish the run with the snapshot and version recorded at its start.
- **EC-18** ЯКЩО a case is deleted while a run that includes it executes, ТОДІ the system (shall) finish that case from the input read at the start of the run and keep its result under the case name recorded at the start.
- **EC-19** ЯКЩО a metric's denominator is 0 (no scored `must_find` case, no kept finding, no grounding candidate), ТОДІ the system (shall) store that metric as `null` and display it as "—", never as 0%.
- **EC-20** ЯКЩО there is no previous finished run or either side of a delta is `null`, ТОДІ the system (shall) display the delta as "—".
- **EC-21** ЯКЩО any scored case's cost is `null` (model missing from the price table), ТОДІ the system (shall) store the run's `cost_usd` as `null` and display "—", never "$0.00".
- **EC-22** ЯКЩО the agent has no eval cases, ТОДІ the system (shall) show in the Evals tab an empty state "No eval cases yet — accept or dismiss findings on a PR, then click Turn into eval case" with a link to the Pull Requests page.
- **EC-23** ЯКЩО the agent has eval cases but no finished run, ТОДІ the system (shall) show "—" in every KPI card, `never run` on every case, and "No runs yet" in place of the trend chart and the run table.
- **EC-24** ЯКЩО no agent of the workspace has a run, ТОДІ the system (shall) show each agent card with "No runs yet" and "—" metrics, and the recent-runs table with "No eval runs yet".
- **EC-25** ЯКЩО the two runs sent to `GET /eval-runs/compare` belong to different agents or to another workspace, ТОДІ the system (shall) respond `422` `runs_not_comparable` or `404` respectively.
- **EC-26** ЯКЩО the two compared runs share no case, ТОДІ the system (shall) show "—" for every ratio delta and the line "These runs share no cases — metrics are not comparable".
- **EC-27** ЯКЩО a selected run for Compare is not finished, ТОДІ the system (shall) render its checkbox disabled with the tooltip "Only finished runs can be compared".
- **EC-28** ЯКЩО the agent is disabled, ТОДІ the system (shall) still allow eval runs for it and show a `disabled` badge next to its name on the dashboard.
- **EC-29** ЯКЩО a case name, file path or agent name does not fit its cell, ТОДІ the system (shall) truncate it with an ellipsis and expose the full text in a `title` attribute and to screen readers.
- **EC-30** ЯКЩО a rename request carries an empty name or a name longer than 80 characters, ТОДІ the system (shall) reject it with `422` `validation_error` and keep the modal open with the input unchanged.
- **EC-31** ЯКЩО an eval case, run or finding id belongs to another workspace, ТОДІ the system (shall) respond `404` as if it did not exist.
- **EC-32** ЯКЩО the user renames a case to a name another case of the agent already has, ТОДІ the system (shall) accept the rename, because name uniqueness applies only to auto-generated names (AC-6).
- **EC-33** ЯКЩО the agent is deleted while its run executes, ТОДІ the system (shall) stop that run before the next case without another LLM call, without writing results and without logging an error.
- **EC-34** ЯКЩО `GET /eval-runs/compare` receives a run whose `status` is `running` or `errored`, ТОДІ the system (shall) respond `422` `run_not_finished`.
- **EC-35** ЯКЩО a case-creation request fails more than one check, ТОДІ the system (shall) return the first failing one in the order `404` (finding not in workspace) → `422 finding_undecided` → `422 agent_missing` → `409 eval_case_exists` → `422 no_patch` → `422 range_outside_diff`.
- **EC-36** ЯКЩО a run's metric is `null`, ТОДІ the system (shall) leave a gap at that run in every sparkline and trend series instead of drawing a 0.
- **EC-37** ЯКЩО two `POST /agents/:id/eval-runs` requests for the same agent arrive at the same moment (double click, two tabs), ТОДІ the system (shall) create exactly one run and answer the other request `409` `eval_run_in_progress`.

## Non-functional requirements

- **NFR-1** The system (shall) make zero LLM calls while scoring a case or aggregating a run, and zero LLM calls on every read route (`GET /agents/:id/eval-cases`, `/eval-cases/:id`, `/agents/:id/eval-overview`, `/eval-runs/:id`, `/eval-dashboard`, `/eval-runs/compare`, `/pulls/:id/eval-case-links`) and on case create, rename and delete, verified by tests that assert a mock provider received no call.
- **NFR-2** The system (shall) make, per case in a run, exactly one structured LLM review call plus at most 2 structured-output re-prompts, because the frozen input is a single-file diff reviewed single-pass (researcher R3).
- **NFR-3** The system (shall) scope every eval query and mutation to the caller's `workspace_id` obtained through `getContext()`, with `workspace_id` stored on eval cases and eval runs.
- **NFR-4** The system (shall) never write rows to `reviews`, `findings`, `agent_runs`, `agent_run_skills` or `run_traces` during an eval run, and never change `pull_requests.last_reviewed_sha`.
- **NFR-5** The system (shall) keep the run snapshot, the case set and every per-case result immutable once the run is finished.
- **NFR-6** The system (shall) serve every user-visible string of this feature through next-intl keys in `client/messages/en/eval.json` (the existing `eval` namespace) or, for the finding-card button, `client/messages/en/prReview.json`, with no hard-coded copy and no server-composed display text.
- **NFR-7** The system (shall) meet WCAG 2.1 AA on the new screens: every control keyboard-operable with visible focus, text contrast ≥ 4.5:1, every pass/fail/errored state and every delta direction conveyed by text or icon label in addition to colour, and targets ≥ 24×24 px.
- **NFR-8** The system (shall) display ratios as integer percentages and every ratio delta in signed integer points computed as `round(new·100) − round(old·100)` ("▲ 4 pt", "▼ 2 pt") on all screens.
- **NFR-9** The system (shall) keep the eval contracts identical in field names and value types in `server/src/vendor/shared/` and `client/src/vendor/shared/`, changed in the same commit, with the client copy using `.optional()` where the server copy uses `.default()`, and client code importing only types from `@devdigest/shared`.
- **NFR-10** The system (shall) provide a `verify:l06` script in `server/package.json` that runs, and passes: the pure scoring tests (including every zero-denominator case), the frozen-input tests (expectation must intersect a hunk; full-file kinds), the executor test (two runs of one case send byte-identical prompts with no repo-intel, project-context, PR-context or intent section), the vendor contract parity test for the eval contracts, the contract parse tests, and a DB-backed integration test that skips itself without Docker and asserts the routes, single-flight `409`, workspace scoping, zero LLM calls on read routes and in scoring, one case per source finding, and cascade on agent delete.
- **NFR-11** The system (shall) add its schema changes through a generated Drizzle migration (`pnpm db:generate`) without editing any applied migration.
- **NFR-12** The system (shall) log each run start and finish with the run id, agent id, agent version, case count, status and duration, and never log the frozen diff, PR body, prompt or finding text.
- **NFR-13** The system (shall) return `GET /eval-dashboard` and `GET /agents/:id/eval-overview` within 500 ms on a local database holding 10 agents, 50 runs per agent and 50 cases per agent.
- **NFR-14** The system (shall) use only placeholder secrets such as `sk_live_xxx` and `ghp_xxx` in every fixture, seed and test of this feature.

## Inputs and provenance

| Value | Source | Trusted? | Design source |
|---|---|---|---|
| Finding `file`, `start_line`, `end_line`, `kind` | `findings` (model output that passed the grounding gate) | partly — location proven by grounding, text not | mockup 1; `server/src/db/schema/reviews.ts:35-61` |
| Finding `severity`, `category`, `title` (display snapshot, case-name slug) | `findings` (model output) | no | mockups 1, 5; `reviews.ts:43-45` |
| Decision → expectation type | `findings.accepted_at` / `findings.dismissed_at` (user action) | yes | brief; `review.repo.ts:120-144` |
| Owning agent | `reviews.agent_id` → `agents` | yes | brief; `reviews.ts:18` |
| Finding → eval case link ("In eval set") | the case's stored source finding id, read through `GET /pulls/:id/eval-case-links` | yes | mockup 1; plan review |
| Frozen file diff | the PR's diff at creation (`git diff base...head` or `pr_files.patch`, same loader as a review run) | no — PR author content | mockup 6; `server/src/modules/reviews/diff-loader.ts:12-44` |
| Frozen PR title, body, number, repo full name | `pull_requests.title`, `.body`, `.number`; `repos` | no (title, body) / yes (number, repo) | mockup 6 "PR meta"; `server/src/db/schema/pulls.ts:16-27` |
| Case name | slug of the finding title, then user rename | no | mockup 5; mockup 6 "Name" |
| Agent version at run start | `agents.version` | yes | mockups 2–4 "vN"; `server/src/db/schema/agents.ts:37` |
| Snapshot: provider, model, strategy, system prompt | `agents` row at run start | yes (author-written) | mockup 4; `agents.ts:15-24` |
| Snapshot: skill names and bodies | linked enabled skills at run start (`AgentsRepository.enabledSkillsForPrompt`) | partly — imported skills are third-party text | `server/src/modules/agents/repository.ts:264-284` |
| Kept findings per case | `reviewPullRequest(...).review.findings` (model output, grounded, redacted) | no | `reviewer-core/src/review/run.ts:218-259` |
| Grounding kept / total per case | `reviewPullRequest(...)` `review.findings.length` and `dropped.length` | yes (computed) | `reviewer-core/src/grounding.ts:52-90` |
| Case duration | measured by the server | yes | mockup 6 "1.8s" |
| Case cost | `reviewPullRequest(...).costUsd` (price table; `null` for unknown models) | yes | mockups 3, 4, 6; researcher R3 |
| Pass, TP / FP / unlabeled, recall, precision, citation accuracy, traces passed | computed by the scorer from the values above | yes (computed) | brief p.4; mockups 2–5; researcher R2 (SPEC-12 definitions); researcher R4 |
| Deltas, trend, sparklines | computed from stored runs | yes | mockups 3–5 |
| Prompt diff | line diff of the two runs' snapshotted system prompts | yes (computed) | mockup 4 |
| `verify:l06` contents | course gate; upstream definition | yes | brief; researcher R1 |
| LLM temperature (0) | adapters' defaults | yes | researcher R3 |

## Untrusted inputs

- **UI-1** Frozen file diff (PR author code) → LLM prompt during an eval run: the system (shall) pass it through the same prompt assembly as a live review, which wraps the diff and keeps `INJECTION_GUARD` in the system message (`reviewer-core/src/prompt.ts`), with no eval-specific bypass.
- **UI-2** Frozen PR title and body → LLM prompt: the system (shall) pass the title only through the task line and the body only as `prDescription`, which the engine truncates and wraps as untrusted, exactly as a live review does.
- **UI-3** Frozen diff, PR title and PR body → case modal: the system (shall) render them as escaped plain text in a diff view and text blocks, with no HTML or Markdown interpretation.
- **UI-4** Model output (findings of a case) → stored per-case result: the system (shall) store only findings that passed the engine's schema validation, grounding and secret redaction, and validate the stored per-case result against its Zod contract before returning it.
- **UI-5** Model output (finding title, rationale) → run detail and case list UI: the system (shall) render titles as escaped text and any rationale only through the existing sanitising `Markdown` component with raw HTML disabled.
- **UI-6** Finding title (model output) → default case name: the system (shall) reduce it to a slug of `a-z`, `0-9` and `-` of at most 60 characters before storing it.
- **UI-7** User-entered case name → database and UI: the system (shall) accept 1–80 characters, store it as a bound parameter, and render it as escaped text.
- **UI-8** Snapshotted system prompts and skill bodies (author or third-party skill text) → Compare prompt diff: the system (shall) render both sides as escaped monospace text with no Markdown or HTML interpretation.
- **UI-9** Mockup and research text (including the realistic `sk_live_51H8…` key in mockup 6) → fixtures and tests: the system (shall) treat it as data and use only placeholder secrets (NFR-14), since GitHub push protection rejects a realistic key in any pushed commit.
- **UI-10** Path parameters and query ids (`:id`, `a`, `b`) → database queries: the system (shall) validate them as UUIDs through the route schema (`422` on failure) and query only through Drizzle bound parameters scoped to the caller's workspace.

## Open questions

- **Q-1** Should the seed add fixture eval cases (upstream seeds 7 for Security Reviewer) so a fresh DB reaches ≥ 8 cases without manual triage? — default: no; the course says the user's decisions are the dataset, so ≥ 8 cases come from the manual hand-in procedure, and fixture cases exist only inside tests with placeholder secrets — owner: user.
- **Q-2** Should matching allow a line tolerance window (±5 lines, the only published tolerance, researcher R4)? — default: no, strict inclusive overlap, revisit after the experiment — owner: user.
- **Q-3** Should a run's history keep runs forever or cap them per agent? — default: keep all; the detail page reads the last 50 and the trend the last 30 — owner: user.
- **Q-4** Should Compare also diff the model and strategy when they changed between the two runs? — default: yes as one line each ("model: a → b") above the prompt diff, no separate card — owner: user.
