# Spec: Skill Evals — Case Editor, skill eval runs and metric trend
Spec ID: SPEC-09
Status: draft
Supersedes: —

## Проблема й користувач

Every `file:line` reference in this spec is at branch `L06-homework-stretch`
(cut from `L06-homework`, SPEC-08 shipped).

The person who writes or edits a review skill (Skills Lab → Skills) has no way
to tell whether a change to the skill's body made reviews better or worse. The
skill editor's **Evals** tab is a placeholder (`client/src/app/skills/_components/SkillEditor/_components/EvalsTab/EvalsTab.tsx:10-16`)
and its **Run on evals** button is permanently disabled
(`client/src/app/skills/_components/SkillEditor/SkillEditor.tsx:57`). SPEC-08
built the eval pipeline for agents only and listed skill-owned cases and runs
as a Non-goal (`specs/08-eval-pipeline.md`, Non-goals).

Two further gaps apply to any owner:

- Cases come only from findings an agent already produced and the user
  triaged (`POST /findings/:id/eval-case`, SPEC-08 AC-2/AC-3). A bug no agent
  has seen yet — a colleague's incident, an edge case from a code review —
  cannot become a case. The table already allows a case with no source finding
  (`server/src/db/schema/eval.ts:42-50`), but no route or form creates one, and
  `EvalCaseMeta` requires a PR number and repo name
  (`server/src/vendor/shared/contracts/knowledge.ts:190-195`).
- Comparing two runs shows a jump, not the drift across many versions. A trend
  chart exists only on the agent's Eval Dashboard detail page, without a
  tooltip and without cost (`client/src/app/eval/agents/[agentId]/_components/MetricTrend/MetricTrend.tsx:72-81`;
  `EvalTrendPoint` has no `cost_usd`, `server/src/vendor/shared/contracts/eval-ci.ts:96-103`).

A skill cannot review a diff on its own: it is text injected into an agent's
prompt (`server/src/modules/agents/repository.ts:278-294`,
`enabledSkillsForPrompt`). Measuring a skill therefore needs an agent to carry
it, and measuring what the skill *itself* changes needs the same review with and
without it. The upstream reference implementation (`upstream/full-functionality`,
`specs/15-skill-eval-cases.md`, `specs/12-eval-pipeline.md`) solves this with a
"carrier" agent and two arms per case (researcher R1). This spec adopts that
design for this branch's SPEC-08 schema. The upstream facts are from the
researcher R1 report; spec-creator had no git access to re-check them.

The screenshot of the intended screen (skill `pr-quality-rubric` v5 → Evals:
"Eval cases · 17 / 20 passing", **Run all evals**, **+ New eval case**, rows with
state icon, "expected 1 finding, got 1", `CRITICAL · security` tag, edit and
delete actions; header **Run on evals**) shows controls that are all mock-only
today.

## Goals / Non-goals

**Goals**
- The skill editor's **Evals** tab becomes the primary eval surface for a
  skill: case list with each case's latest result, **+ New eval case**, per-row
  edit and delete, **Run all evals** (and the header **Run on evals**), a lift
  summary and a metric trend chart.
- A **Case Editor** form creates a case from a pasted diff (full unified diff or
  bare hunks) with a live diff preview, an expectation type, a file and a
  new-side line range. The form and its server-side validation are
  owner-agnostic, so the agent Evals tab can adopt them later (Q-2).
- Editing a case's review input (diff, file, range, type, PR title, description)
  saves a new case and deletes the old one; name, notes, severity and category
  edit in place. Past runs never change.
- A skill eval run executes every case of the skill twice inside a chosen
  carrier agent linked to the skill — once with the skill, once without — and
  reports per-arm recall, precision and citation accuracy (SPEC-08 definitions),
  their lift (with − without) and a per-case effect.
- A trend chart on the skill Evals tab shows the with-skill arm's three metrics
  over the skill's finished runs, one point per run, with a tooltip naming the
  skill version, carrier agent, run date and cost.
- This spec amends approved SPEC-08 without editing it:
  - reverses the SPEC-08 Non-goal "Not doing eval cases or runs for skills
    (`owner_kind: 'skill'`)" and the Non-goal "Not doing … **+ New eval case**
    from scratch" for skills;
  - amends SPEC-08 AC-14 (case modal read-only) for manual cases: they open in
    the Case Editor;
  - amends SPEC-08 EC-22 (empty-state copy) only for the skill tab; the agent
    tab copy is unchanged unless Q-2 is accepted;
  - makes `EvalCaseMeta.pr_number` and `repo_full_name` nullish (SPEC-08 AC-4
    still writes both for finding-derived cases).

**Non-goals**
- Not adding the Case Editor or the trend chart to the agent Evals tab in this
  spec — open as Q-2 and Q-3.
- Not doing **Turn into eval case** for skills (a finding becoming a skill-owned
  case). Skill cases are manual only, so `eval_cases_source_finding_uq`
  (`server/src/db/schema/eval.ts:50`) keeps its current definition (Q-11).
- Not doing an "expect no findings at all" expectation type (the mockup's
  `clean-refactor-no-flags` / `empty []` row) — a `must_not_flag` case over the
  hunk's lines covers it (Q-8).
- Not doing a per-row ▷ run of one case (mockup) — the run unit stays the whole
  set, as in SPEC-08 (Q-9).
- Not doing a skill run history table, a run-detail modal or **Compare** for
  skill runs; the trend tooltip and the case list carry the per-run facts
  (Q-14).
- Not doing a cost estimate before a run (upstream `GET /skills/:id/eval/estimate`)
  — the run dialog shows the review count instead (Q-13).
- Not doing **Run all skills** (upstream `POST /eval/skills/runs/all`).
- Not running a skill without a carrier (bare skill text plus a neutral system
  prompt) — considered and rejected because no live review ever runs that
  prompt, so its numbers predict nothing about real reviews (Q-10).
- Not doing a single arm (with-skill only) — considered and rejected because
  without the baseline arm a metric change cannot be attributed to the skill
  rather than the carrier's prompt or model.
- Not doing in-place edits of review input with a case `revision` column
  (approach C) or "edited since last run" markers (approach A) — rejected by
  the user (answer Q3 = B).
- Not doing the other L06 stretch items here: the skill eval file in `evals/`
  (item 1), the PreToolUse commit-gate hook in `.claude/settings.json`
  (item 4) and mutation testing on one module (item 5) are plan/doc tasks with
  no spec.
- Not cherry-picking upstream migrations 0020–0026 — they reshape `eval_runs`
  to `owner_kind`/`owner_id`, which this branch's SPEC-08 schema does not use
  (researcher R1).

## User stories

- **US-1** As a skill author, I want to create an eval case by hand from a pasted diff, an expectation type, a file and a line range, with a live preview of the diff, so that my skill's set covers bugs no agent has produced yet.
- **US-2** As a skill author, I want to see every case of my skill with its latest result, edit it and delete it, so that the set stays correct without corrupting past results.
- **US-3** As a skill author, I want to run all cases of my skill inside an agent that uses it, with and without the skill, so that I see what the skill itself changes.
- **US-4** As a skill author, I want a trend chart of my skill's metrics over all its runs, each point naming the skill version, the carrier agent and the cost, so that I see slow degradation across versions.

## Acceptance criteria (EARS)

### Case list on the skill Evals tab
- **AC-1** (US-2) КОЛИ the user opens `/skills/:id?tab=evals`, the system (shall) show the heading **Eval cases**, a **Run all evals** button and a **+ New eval case** button above the case list.
- **AC-2** (US-2) КОЛИ the skill has a finished run, the system (shall) show next to the heading "{passed} / {scored} passing", counted over the with-skill arm of the skill's latest finished run.
- **AC-3** (US-2) КОЛИ the skill Evals tab loads, the system (shall) list every eval case of the skill, newest first, each row showing the case's result state with an icon and a text label, the case name, "expected {n}, got {m}" for the with-skill arm or `never run`, a `SEVERITY · category` tag for `must_find` or a `must not flag` tag for `must_not_flag`, `file:start_line-end_line`, an edit action and a delete action.
- **AC-4** (US-3) КОЛИ a case has a result in the skill's latest finished run, the system (shall) show on its row the case's effect as one of the text labels `helped`, `hurt`, `no effect · pass`, `no effect · fail` or `errored`.

### Case Editor — create
- **AC-5** (US-1) КОЛИ the user clicks **+ New eval case**, the system (shall) open the Case Editor modal with the fields name, PR title, description, diff, file, expectation type (default `must_find`), start line, end line, severity, category and notes, all empty except the type.
- **AC-6** (US-1) КОЛИ the diff field holds text with one or more `diff --git` or `+++` file headers, the system (shall) offer the new-side paths found in it as the file choices, with the first path preselected.
- **AC-7** (US-1) КОЛИ the diff field holds hunks (`@@ … @@`) and no file header, the system (shall) show the file as a required free-text path field and treat the hunks as that file's diff.
- **AC-8** (US-1) ПОКИ the diff field holds text with at least one hunk for the chosen file, the system (shall) show a diff-view preview of only that file's section with the lines from start line to end line highlighted on the new-side line numbers.
- **AC-9** (US-1) КОЛИ the user clicks **Save** on a new case, the system (shall) create it through `POST /skills/:id/eval-cases` and respond `201` with the case, `owner_kind: "skill"`, `owner_id` equal to the skill id and `source_finding_id: null`.
- **AC-10** (US-1) КОЛИ the server creates a case from the Case Editor, the system (shall) store as the frozen diff only the chosen file's section — `diff --git`, `---` and `+++` headers plus every hunk of that file — with headers generated from the file path when the input had none.
- **AC-11** (US-1) КОЛИ the server creates a case from the Case Editor, the system (shall) store `input_meta` with `pr_number: null`, `repo_full_name: null`, `title` from the PR title field and `body` from the description field, or `null` when the description is empty.
- **AC-12** (US-1) КОЛИ `POST /skills/:id/eval-cases` responds `201`, the system (shall) close the editor and show the new case at the top of the list as `never run` without a page reload.

### Case Editor — edit and delete
- **AC-13** (US-2) КОЛИ the user clicks the edit action of a case, the system (shall) open the Case Editor prefilled with the case's stored name, PR title, description, diff, file, type, lines, severity, category and notes.
- **AC-14** (US-2) КОЛИ the user saves an edit that changes only the name, notes, severity or category, the system (shall) update the case in place through `PATCH /eval-cases/:id`, keeping its id and its latest result.
- **AC-15** (US-2) КОЛИ the user saves an edit that changes the diff, file, start line, end line, expectation type, PR title or description of a case without a source finding, the system (shall) create a new case with all edited values and delete the old case in one transaction, and return the new case from `PATCH /eval-cases/:id`.
- **AC-16** (US-2) КОЛИ a case was replaced by an edit, the system (shall) show the new case in the list as `never run` in place of the old row, without a page reload.
- **AC-17** (US-2) КОЛИ the user clicks the delete action of a case on the skill tab, the system (shall) ask for confirmation in a dialog that names the case.
- **AC-18** (US-2) КОЛИ the user confirms the deletion, the system (shall) delete the case through `DELETE /eval-cases/:id` and remove its row without a page reload.
- **AC-19** (US-2) КОЛИ a case without a source finding is shown in any case modal, the system (shall) show "Created manually" in place of the source PR link.

### Skill eval run
- **AC-20** (US-3) КОЛИ the user clicks **Run all evals** or the header **Run on evals**, the system (shall) open a run dialog listing, as carrier choices, every agent of the workspace linked to the skill, with the carrier of the skill's latest run preselected, or the first agent by name when there is none.
- **AC-21** (US-3) КОЛИ the run dialog is open, the system (shall) show the line "{n} cases · {2n} reviews" for the skill's current case count.
- **AC-22** (US-3) КОЛИ the user confirms the run dialog, the system (shall) call `POST /skills/:id/eval-runs` with `carrier_agent_id`, which responds `202` with the new run's `id` and `status: "running"` before any case is reviewed.
- **AC-23** (US-3) КОЛИ a skill eval run starts, the system (shall) record on the run the skill's `version`, name and body, the carrier's id, name and `version`, and the carrier's `provider`, `model`, `strategy` and `system_prompt` at that moment.
- **AC-24** (US-3) КОЛИ a skill eval run starts, the system (shall) record as the with-skill arm's skill list the carrier's linked skills that are enabled for its prompt, in link order, with the skill under test included at its link position regardless of the skill's own `enabled` flag and the link's `enabled` flag.
- **AC-25** (US-3) КОЛИ a skill eval run starts, the system (shall) record as the without-skill arm's skill list the with-skill arm's list minus the skill under test.
- **AC-26** (US-3) КОЛИ a skill eval run starts, the system (shall) record the ids and names of every case of the skill at that moment as the run's case set.
- **AC-27** (US-3) ПОКИ a skill eval run executes, the system (shall) review each case of the run's case set once per arm, one review at a time, each with the case's parsed frozen diff, a task line built from the frozen PR title, the frozen description as the PR description, the run's snapshotted carrier provider, model, strategy and system prompt, and that arm's recorded skill list, with no repo-intel, project context, PR context, intent or out-of-scope filter.
- **AC-28** (US-3) The system (shall) score each arm of each case with the SPEC-08 rules for `must_find` and `must_not_flag` (AC-27, AC-28) and classify each kept finding as TP, FP or unlabeled (SPEC-08 AC-29).
- **AC-29** (US-3) The system (shall) compute for each arm of a run `recall`, `precision`, `citation_accuracy`, `tp`, `fp`, `unlabeled`, `traces_passed` and `traces_total` with the SPEC-08 definitions (AC-30 to AC-34), over the cases scored in both arms.
- **AC-30** (US-3) The system (shall) compute for each of recall, precision and citation accuracy the lift as the with-skill value minus the without-skill value of the same run.
- **AC-31** (US-3) The system (shall) set each scored case's effect to `helped` when it passed with the skill and failed without, `hurt` when it failed with the skill and passed without, `no_effect_pass` when it passed in both arms, and `no_effect_fail` when it failed in both arms.
- **AC-32** (US-3) КОЛИ every case of a skill run has a result in both arms and at least one case was scored in both, the system (shall) store both arms' metrics and the lifts, set `finished_at`, and set `status` to `completed` when no case errored or to `partial` when one or more cases errored.
- **AC-33** (US-3) ПОКИ the skill has a run with `status: "running"`, the system (shall) disable **Run all evals** and **Run on evals** and show "Running case {k} of {n}", updated by polling `GET /eval-runs/:id`.
- **AC-34** (US-3) КОЛИ a polled skill run leaves `status: "running"`, the system (shall) stop polling, refresh the passing count, the case list, the lift summary and the trend chart, and announce the final status in an `aria-live="polite"` region.
- **AC-35** (US-3) КОЛИ the skill has a finished run, the system (shall) show under the heading the line "Lift vs. without skill — recall {Δ} · precision {Δ} · citation {Δ}" for the latest finished run, each Δ in signed integer points.

### Metric trend
- **AC-36** (US-4) КОЛИ the skill Evals tab loads, the system (shall) show a **Metric trend** line chart with three labelled series — recall, precision and citation accuracy of the with-skill arm — with one point per finished run of the skill, over its last 100 finished runs in chronological order, the x-axis labelled with each run's `v{skill version}`.
- **AC-37** (US-4) КОЛИ the user hovers over or focuses a trend point, the system (shall) show a tooltip with the run date, `v{skill version}`, the carrier agent's name with `v{carrier version}`, the carrier model, the with-skill recall, precision and citation accuracy as integer percentages, each metric's lift in signed integer points, and the run's total cost of both arms.
- **AC-38** (US-4) The system (shall) make every trend point reachable with the Tab key and give it an accessible name that carries the same text as its tooltip.
- **AC-39** (US-4) КОЛИ a tooltip is open and the user presses Escape or moves focus or the pointer away, the system (shall) close the tooltip.

### Read API
- **AC-40** (US-2) КОЛИ the client requests `GET /skills/:id/eval-cases`, the system (shall) return every case of the skill, newest first, each with `latest_result` holding the with-skill state, the without-skill state, the effect and the with-skill expected and got counts from the skill's latest finished run, or `null` when the case was not in that run.
- **AC-41** (US-3, US-4) КОЛИ the client requests `GET /skills/:id/eval-overview`, the system (shall) return `{skill, cases_total, running_run_id, carriers, latest, previous, trend}`, where `carriers` lists the workspace agents linked to the skill, `latest` and `previous` are the two newest finished runs (`null` when absent) and `trend` holds at most 100 finished runs in chronological order.
- **AC-42** (US-3) КОЛИ the client requests `GET /eval-runs/:id` for a skill run, the system (shall) return its owner kind `skill`, skill version, carrier snapshot, both arms' skill lists, both arms' metrics, the lifts, the per-case results of both arms with each case's effect, and the counts `cases_done` and `cases_total`.

## Edge cases

- **EC-1** ЯКЩО the pasted diff is larger than 200 KB, ТОДІ the system (shall) reject the save with `422` `frozen_diff_too_large`, keep the editor open with every input unchanged and show "The diff is larger than 200 KB — paste only the file you need".
- **EC-2** ЯКЩО the pasted diff holds no hunk for the chosen file, ТОДІ the system (shall) reject the save with `422` `no_patch` and show "This diff has no changed lines for the chosen file".
- **EC-3** ЯКЩО the expectation's line range intersects no hunk's new-side lines of the chosen file (for example old-side numbers were entered), ТОДІ the system (shall) reject the save with `422` `range_outside_diff` and show "The line range is outside the diff's changed lines — use new-side line numbers".
- **EC-4** ЯКЩО start line is below 1, end line is below start line or either is not an integer, ТОДІ the system (shall) disable **Save** with an inline message on the line fields and the server rejects the same input with `422` `validation_error`.
- **EC-5** ЯКЩО the name is empty or longer than 80 characters, the PR title is empty or longer than 200 characters, or the file path is longer than 500 characters, ТОДІ the system (shall) reject the save with `422` `validation_error` and keep the editor open with every input unchanged.
- **EC-6** ЯКЩО a `PATCH /eval-cases/:id` request changes the diff, file, lines, type, PR title or description of a case that has a source finding, ТОДІ the system (shall) reject it with `422` `case_input_locked` and change nothing.
- **EC-7** ЯКЩО the Case Editor opens a case that has a source finding, ТОДІ the system (shall) render its diff, file, lines, type, PR title and description read-only with the note "Created from a finding — only the name and notes can be edited".
- **EC-8** ЯКЩО the user closes the Case Editor with unsaved changes (close button, Escape, backdrop), ТОДІ the system (shall) ask "Discard changes to this case?" and keep the editor open unless the user confirms.
- **EC-9** ЯКЩО a save request fails with a network error or a `5xx`, ТОДІ the system (shall) keep the editor open with every input unchanged and rely on the global error toast without adding a second one.
- **EC-10** ЯКЩО a case is edited or deleted while a run that includes it executes, ТОДІ the system (shall) finish that case from the input read at the start of the run and keep its result under the case name recorded at the start.
- **EC-11** ЯКЩО no agent of the workspace is linked to the skill, ТОДІ the system (shall) render **Run all evals** and **Run on evals** disabled with the hint "Link this skill to an agent first" and the server rejects a run start with `422` `no_agent_linked`.
- **EC-12** ЯКЩО `carrier_agent_id` names an agent that is not linked to the skill, ТОДІ the system (shall) start nothing and respond `422` `no_agent_linked`.
- **EC-13** ЯКЩО the skill has zero eval cases, ТОДІ the system (shall) render **Run all evals** and **Run on evals** disabled with the hint "Add an eval case first" and the server rejects a run start with `422` `no_eval_cases`.
- **EC-14** ЯКЩО `POST /skills/:id/eval-runs` arrives while the skill has a run with `status: "running"` (double click, second tab), ТОДІ the system (shall) start nothing and respond `409` `eval_run_in_progress` with the running run's id.
- **EC-15** ЯКЩО a skill run is running while its carrier agent's own eval run starts, or the reverse, ТОДІ the system (shall) let both runs proceed without a `409`.
- **EC-16** ЯКЩО the review of a case fails in either arm (provider error, missing API key, structured-output failure after retries, frozen diff that parses to zero files), ТОДІ the system (shall) store that case as `errored` with the error reason and exclude it from both arms' metrics, the lifts and the effect counts.
- **EC-17** ЯКЩО every case of a skill run errored, ТОДІ the system (shall) set the run's `status` to `errored`, store all metrics and lifts as `null` and show the first case's error reason.
- **EC-18** ЯКЩО the API process restarts while a skill run has `status: "running"`, ТОДІ the system (shall) set that run's `status` to `errored` with the reason `interrupted` on the next boot.
- **EC-19** ЯКЩО the client has polled a skill run for 20 minutes and it is still `running`, ТОДІ the system (shall) stop polling and show "The eval run is still in progress — reload to check its status".
- **EC-20** ЯКЩО a polling request fails, ТОДІ the system (shall) stop polling, rely on the global error toast without adding a second one and show a **Retry** action that resumes polling.
- **EC-21** ЯКЩО the skill, the carrier's configuration or the carrier's skill links change while a skill run executes, ТОДІ the system (shall) finish the run with the snapshot and skill lists recorded at its start.
- **EC-22** ЯКЩО the carrier agent is deleted during or after a skill run, ТОДІ the system (shall) keep the run, finish it from its snapshot when still running, and show the snapshotted carrier name in the trend tooltip.
- **EC-23** ЯКЩО the skill is deleted, ТОДІ the system (shall) delete its eval cases and eval runs in the same operation.
- **EC-24** ЯКЩО the skill is deleted while its run executes, ТОДІ the system (shall) stop that run before the next review without another LLM call, without writing results and without logging an error.
- **EC-25** ЯКЩО a metric's denominator is 0 in an arm, ТОДІ the system (shall) store that metric as `null` and display it as "—", never as 0%.
- **EC-26** ЯКЩО either side of a lift is `null`, ТОДІ the system (shall) store the lift as `null` and display it as "—".
- **EC-27** ЯКЩО any arm of any scored case has a `null` cost (model missing from the price table), ТОДІ the system (shall) store the run's cost as `null` and display "—", never "$0.00".
- **EC-28** ЯКЩО a run's with-skill metric is `null`, ТОДІ the system (shall) leave a gap at that run in that trend series instead of drawing a 0.
- **EC-29** ЯКЩО the skill has no eval cases, ТОДІ the system (shall) show the empty state "No eval cases yet — create one from a diff" with a **+ New eval case** action.
- **EC-30** ЯКЩО the skill has eval cases but no finished run, ТОДІ the system (shall) show `never run` on every case, "—" for the passing count and the lift line, and "No runs yet" in place of the trend chart.
- **EC-31** ЯКЩО the skill has `injection_flagged` set, ТОДІ the system (shall) show in the run dialog the warning "This skill was flagged for prompt injection — its text is sent to the model in every with-skill review" and still allow the run.
- **EC-32** ЯКЩО a skill, case, run or carrier id belongs to another workspace, ТОДІ the system (shall) respond `404` as if it did not exist.
- **EC-33** ЯКЩО a case name, file path or carrier name does not fit its cell or tooltip line, ТОДІ the system (shall) truncate it with an ellipsis and expose the full text in a `title` attribute and to screen readers.
- **EC-34** ЯКЩО the user renames a case to a name another case of the skill already has, ТОДІ the system (shall) accept the rename.

## Non-functional requirements

- **NFR-1** The system (shall) make zero LLM calls on case create, edit, delete, on every read route of this spec and while scoring or aggregating a skill run, verified by tests that assert a mock provider received no call.
- **NFR-2** The system (shall) make, per case in a skill run, exactly two structured LLM review calls (one per arm) plus at most 2 structured-output re-prompts per call.
- **NFR-3** The system (shall) scope every case and run query and mutation of this spec to the caller's `workspace_id` obtained through `getContext()`.
- **NFR-4** The system (shall) never write rows to `reviews`, `findings`, `agent_runs`, `agent_run_skills` or `run_traces` during a skill eval run.
- **NFR-5** The system (shall) exclude skill runs from every agent eval read (`GET /agents/:id/eval-overview`, `/agents/:id/eval-cases`, `/eval-dashboard`, `/eval-runs/compare`) and from the agent single-flight check.
- **NFR-6** The system (shall) keep a run's snapshot, skill lists, case set, per-case results and metrics unchanged once the run is finished, including after any case is edited, replaced or deleted.
- **NFR-7** The system (shall) serve every user-visible string of this feature through next-intl keys in `client/messages/en/eval.json` or the existing `evals.*` keys of `client/messages/en/skills.json`, with no hard-coded copy and no server-composed display text.
- **NFR-8** The system (shall) meet WCAG 2.1 AA on the skill Evals tab, the Case Editor, the run dialog and the trend tooltip: every control keyboard-operable with visible focus, text contrast ≥ 4.5:1, every result state, effect and lift direction conveyed by text in addition to colour, and targets ≥ 24×24 px.
- **NFR-9** The system (shall) display metrics as integer percentages and every lift as signed integer points computed as `round(with·100) − round(without·100)` ("▲ 4 pt", "▼ 2 pt").
- **NFR-10** The system (shall) keep every changed or new eval contract identical in field names and value types in `server/src/vendor/shared/` and `client/src/vendor/shared/`, changed in the same commit, with `EvalCaseMeta.pr_number` and `repo_full_name` declared `.nullish()` in both copies.
- **NFR-11** The system (shall) add its schema changes through generated Drizzle migrations (`pnpm db:generate`), without editing an applied migration and without changing `eval_cases_source_finding_uq`.
- **NFR-12** The system (shall) log each skill run start and finish with the run id, skill id, skill version, carrier agent id, case count, status and duration, and never log a diff, PR description, prompt, skill body or finding text.
- **NFR-13** The system (shall) return `GET /skills/:id/eval-overview` and `GET /skills/:id/eval-cases` within 500 ms on a local database holding 100 finished runs and 50 cases for the skill.
- **NFR-14** The system (shall) use only placeholder secrets such as `sk_live_xxx` and `ghp_xxx` in every fixture, seed and test of this feature.
- **NFR-15** The system (shall) ship hermetic tests for the lift and effect computation (including every `null` case), the diff section extraction and header wrapping of pasted input, and the edit rule (in-place vs replace), plus a DB-backed integration test that skips itself without Docker and asserts the skill routes, the `409` single-flight, workspace scoping, the agent-read exclusion of NFR-5 and the `case_input_locked` rejection.

## Inputs and provenance

| Value | Source | Trusted? | Design source |
|---|---|---|---|
| Pasted diff | Case Editor (user input; often third-party code) | no | brief item 2; screenshot "+ New eval case" |
| File path, expectation type, start/end line | Case Editor (user input) | no (validated) | brief item 2 |
| PR title, description | Case Editor (user input) | no | `server/src/modules/eval/executor.ts:62-64` (task line, `prDescription`) |
| Case name, notes, severity, category | Case Editor (user input); `eval_cases.notes` column | no | screenshot row tags; `server/src/db/schema/eval.ts:41` |
| `input_meta.pr_number`, `repo_full_name` | `null` for manual cases | yes | `knowledge.ts:190-195`; root `INSIGHTS.md` (`.nullish()` for jsonb) |
| Frozen file section and grounding check | computed from the pasted diff (`extractFileDiff`, `freezeFileDiff`) | yes (computed) | `server/src/modules/eval/frozen-input.ts:17-106` |
| Case owner | route `:id` → `skills` row in the caller's workspace | yes | screenshot; researcher R1 (upstream `POST /skills/:id/eval/cases`) |
| Carrier choices | `agent_skills` links of the skill → `agents` | yes | researcher R1 (carrier design); `server/src/db/schema/agents.ts:64-67` |
| Skill version, name, body at run start | `skills.version`, `.name`, `.body` | partly — imported/community skills are third-party text | screenshot "v5"; `server/src/db/schema/skills.ts:22-23` |
| Carrier version, provider, model, strategy, system prompt | `agents` row at run start | yes (author-written) | SPEC-08 AC-20; `server/src/db/schema/agents.ts:37` |
| With / without skill lists | carrier's enabled prompt skills (`enabledSkillsForPrompt`) ± the skill under test | partly (skill text) | `server/src/modules/agents/repository.ts:278-294`; researcher R1 |
| Kept findings per case per arm | `reviewPullRequest(...).review.findings` (model output, grounded, redacted) | no | `executor.ts:53-79` |
| Grounding kept / total per arm | `reviewPullRequest(...)` kept and dropped counts | yes (computed) | `executor.ts:77-78` |
| Cost per arm | `reviewPullRequest(...).costUsd` (`null` for unknown models) | yes | SPEC-08 EC-21 |
| Pass, TP/FP/unlabeled, recall, precision, citation accuracy per arm | scorer (SPEC-08 definitions) | yes (computed) | SPEC-08 AC-27–AC-34; researcher R1 (upstream same definitions) |
| Lift, per-case effect | computed from both arms | yes (computed) | researcher R1 (upstream `helped`/`hurt`/`no_effect_*`) |
| Trend points, tooltip fields | stored finished skill runs | yes (computed) | brief item 3 ("точка = прогін, тултіп = версія промпта і вартість") |
| Diff size cap 200 KB | upstream value | yes (config) | researcher R1 (`frozen_diff_too_large`) |

## Untrusted inputs

- **UI-1** Pasted diff (user-pasted, often third-party code) → LLM prompt in both arms: the system (shall) pass it through the same prompt assembly as a live review, which wraps the diff and keeps `INJECTION_GUARD` in the system message, with no eval-specific bypass.
- **UI-2** PR title and description from the Case Editor → LLM prompt: the system (shall) pass the title only through the task line and the description only as `prDescription`, which the engine truncates and wraps as untrusted.
- **UI-3** Pasted diff, PR title and description → Case Editor preview and case modal: the system (shall) render them as escaped plain text in the diff view and text blocks, with no HTML or Markdown interpretation.
- **UI-4** Pasted diff size → server memory and token cost: the system (shall) reject a diff larger than 200 KB before parsing it (EC-1).
- **UI-5** File path from the Case Editor → database, prompt and UI: the system (shall) store it as a bound string parameter of at most 500 characters, never use it as a filesystem path, git argument or shell argument, and render it as escaped text.
- **UI-6** Skill body (author-written or imported third-party text) → system prompt of the with-skill arm: the system (shall) inject it exactly as a live review injects linked skills, with the injection-flag warning of EC-31 shown before the run.
- **UI-7** Model output (findings of each arm) → stored per-case results: the system (shall) store only findings that passed the engine's schema validation, grounding and secret redaction, and validate the stored result against its Zod contract before returning it.
- **UI-8** Model output (finding titles) and snapshotted names (skill, carrier) → case list, tooltip and run responses: the system (shall) render them as escaped text.
- **UI-9** User-entered name, notes, severity and category → database and UI: the system (shall) store them as bound parameters within their length limits and render them as escaped text.
- **UI-10** Path and body ids (`:id`, `carrier_agent_id`) → database queries: the system (shall) validate them as UUIDs through the route schema (`422` on failure) and query only through Drizzle bound parameters scoped to the caller's workspace.
- **UI-11** Mockup text, upstream code and research reports → this spec and its tests: the system (shall) treat them as data, use only placeholder secrets (NFR-14) and copy no upstream code without review.

## Open questions

- **Q-1** This spec is large: skill-owned cases, the Case Editor, a two-arm skill runner and a trend chart. Split it into SPEC-09 (skill cases + Case Editor + runner + list) and SPEC-10 (trend chart and tooltip)? — default: keep one spec and have the plan deliver it in three phases (A: cases + Case Editor; B: skill runner + list results + lift; C: trend), each phase green on its own — owner: user.
- **Q-2** Should the agent Evals tab also get **+ New eval case** and per-row edit through the same Case Editor (route `POST /agents/:id/eval-cases`, same edit rule)? — default: yes, as a follow-up spec once this one ships; the editor and `PATCH` rule are already owner-agnostic — owner: user.
- **Q-3** Should the agent Evals tab get the same trend chart and tooltip, with `cost_usd` added to `EvalTrendPoint`, and the dashboard detail page's `MetricTrend` gain the tooltip? — default: yes, in the same follow-up as Q-2, sharing one chart component — owner: user.
- **Q-4** Tooltip contents (AC-37): is run date, skill version, carrier name and version, model, three with-skill metrics, three lifts and total cost the right set? — default: yes — owner: user.
- **Q-5** `Supersedes:` stays `—`, with the amended SPEC-08 items listed in Goals? — default: yes — owner: user.
- **Q-6** Trend window: last 100 finished runs (AC-36) — default: 100; upstream keeps no skill trend series and the client reads the full run list (researcher R1) — owner: user.
- **Q-7** Pasted-diff cap: 200 KB (upstream, researcher R1) or 100 KB (intake default)? — default: 200 KB — owner: user.
- **Q-8** Add an "expect no findings at all" type (mockup `empty []`)? — default: no — owner: user.
- **Q-9** Add a per-row ▷ run of one case (mockup)? — default: no — owner: user.
- **Q-10** Carrier design: keep upstream's carrier + two arms, or run the skill alone with a neutral system prompt? — default: carrier + two arms (see Non-goals) — owner: user.
- **Q-11** Allow **Turn into eval case** for skills? It needs `eval_cases_source_finding_uq` widened to (`owner_kind`, `owner_id`, `source_finding_id`), because one finding could then source both an agent case and a skill case — default: no, skill cases are manual only — owner: user.
- **Q-12** Should the trend chart filter by carrier when runs used different carriers? — default: no filter; each tooltip names its carrier — owner: user.
- **Q-13** Show a cost estimate in the run dialog (upstream `GET /skills/:id/eval/estimate`)? — default: no; show "{n} cases · {2n} reviews" — owner: user.
- **Q-14** Skill run history table, run-detail modal and **Compare** for skill runs? — default: not in this spec — owner: user.
- **Q-15** Polling timeout for a skill run: 20 minutes (EC-19, twice SPEC-08's 10 because every case runs twice)? — default: 20 minutes — owner: user.
- **Q-16** Error codes: this spec keeps this branch's `no_patch` and `range_outside_diff` (SPEC-08) rather than upstream's `expectation_not_grounded`, and adopts upstream's `frozen_diff_too_large`; agree? — default: yes — owner: user.
