# Spec: Eval Case Editor, skill eval runs and metric trends
Spec ID: SPEC-09
Status: implemented
Supersedes: —

## Проблема й користувач

Every `file:line` reference in this spec is at branch `L06-homework-stretch`
(cut from `L06-homework`, SPEC-08 shipped). The filename keeps its first
draft's name (`09-skill-evals.md`, commit `abb2287`); the scope now covers both
eval owners.

Two people tune review behaviour in DevDigest: the **agent author** (system
prompt, model, linked skills) and the **skill author** (a skill's body). Both
need a regression set that tells them whether a change made reviews better or
worse. Three gaps stand in the way today:

1. **Cases only come from history.** The only way to create a case is
   **Turn into eval case** on a triaged finding (`POST /findings/:id/eval-case`,
   SPEC-08 AC-2/AC-3), so a bug the agent has never produced — a colleague's
   incident, an edge case from code review — cannot enter the set. The table
   already allows a case with no source finding (`server/src/db/schema/eval.ts:42-50`),
   but no route or form creates one, and `EvalCaseMeta` requires a PR number
   and repo name (`server/src/vendor/shared/contracts/knowledge.ts:190-195`).
   The agent Evals tab has no **+ New eval case** and no edit action
   (`client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/EvalCaseList/EvalCaseList.tsx:70-77`).
2. **Skills have no evals at all.** The skill editor's **Evals** tab is a
   placeholder (`client/src/app/skills/_components/SkillEditor/_components/EvalsTab/EvalsTab.tsx:10-16`)
   and **Run on evals** is permanently disabled
   (`client/src/app/skills/_components/SkillEditor/SkillEditor.tsx:57`). SPEC-08
   excluded skill-owned cases and runs. A skill cannot review on its own — it is
   text injected into an agent's prompt (`server/src/modules/agents/repository.ts:278-294`)
   — so measuring a skill needs a carrier agent, and measuring what the skill
   itself changes needs the same review with and without it. The upstream
   reference (`upstream/full-functionality`, `specs/15-skill-eval-cases.md`)
   uses a carrier agent and two arms per case (researcher R1; verified
   firsthand by the implementation planner). Which skills shaped a review is
   already recorded per run (`agent_run_skills`, `server/src/db/schema/runs.ts:56-71`).
3. **No trend where the cases live.** A trend chart exists only on the agent's
   Eval Dashboard detail page, capped at 30 runs, without a tooltip and without
   cost (`client/src/app/eval/agents/[agentId]/_components/MetricTrend/MetricTrend.tsx:72-81`;
   `EvalTrendPoint` has no `cost_usd`, `server/src/vendor/shared/contracts/eval-ci.ts:96-103`).

`eval_runs` is agent-shaped today (`agent_id` NOT NULL, one-running-per-agent
unique index, `server/src/db/schema/eval.ts:54-90`), so a skill run cannot be
stored without reshaping it.

The design source is a screenshot of the skill Evals tab (`pr-quality-rubric` v5:
"Eval cases · 17 / 20 passing", **Run all evals**, **+ New eval case**, rows with
state icon, "expected 1 finding, got 1", `CRITICAL · security` tag, edit and
delete actions, header **Run on evals**); every control in it is mock-only today.

## Goals / Non-goals

**Goals**
- One shared **Case Editor** creates and edits eval cases by hand for both owners
  (agent and skill): paste a diff (full unified diff or bare hunks), choose the
  file, set the expectation type and a new-side line range, see a live diff
  preview with the range highlighted. Manual cases live in the same set and run
  through the same run route as cases made from findings.
- Edit rule: changing a manual case's review input (diff, file, lines, type, PR
  title, description) saves a new case that takes the old one's place and
  deletes the old one; name, notes, severity and category edit in place. A case
  made from a finding edits only its name and notes. Past runs never change.
- A finding can also become a **skill**-owned case, for any skill that shaped
  the review that produced it (**Turn into skill eval case** on the finding card).
- A skill eval run executes every case of the skill twice inside a carrier agent
  linked to the skill — with and without the skill — and reports both arms'
  recall, precision and citation accuracy, their lift and a per-case effect.
- A **Metric trend** chart with a tooltip (version, cost, run date; for skills
  also the carrier) on the agent Evals tab, the skill Evals tab and the agent's
  Eval Dashboard detail page, over the last 100 finished runs.
- The user consented to: editing the eval contracts in both
  `server/src/vendor/shared/` and `client/src/vendor/shared/` in the same
  commit, and generating new migrations (Phase A: widen the source-finding
  unique index; Phase B: reshape `eval_runs` for skill runs).
- This spec amends approved SPEC-08 without editing it:
  - reverses the Non-goal "Not doing eval cases or runs for skills
    (`owner_kind: 'skill'`)";
  - reverses the Non-goal "Not doing … **+ New eval case** from scratch";
  - amends AC-14 (read-only case modal): a row click opens the Case Editor —
    editable for manual cases, read-only except name and notes for cases made
    from a finding;
  - amends EC-22 (empty-state copy) on the agent tab (EC-45 here);
  - amends AC-42 and AC-57 (trend capped at 30): the trend holds up to 100
    finished runs and each point carries `cost_usd`;
  - amends AC-4's contract: `EvalCaseMeta.pr_number` and `repo_full_name`
    become nullish (finding-made cases still write both).

### Delivery phases

One spec, three phases, each green on its own (tests, typecheck, lint, arch).

| Phase | Delivers | IDs |
|---|---|---|
| A — Case Editor for both owners | agent tab **+ New eval case** and edit; skill tab list, create, edit, delete (its run buttons stay disabled as today until B); finding → skill case; contract `EvalCaseMeta` nullish, `EvalCaseInput`, `EvalCaseUpdate`; source-finding index widened | AC-1, AC-3, AC-5–AC-19, AC-43–AC-54; EC-1–EC-10, EC-29, EC-32–EC-37, EC-39, EC-41–EC-45; NFR-1, NFR-3, NFR-7, NFR-8, NFR-10, NFR-11, NFR-14, NFR-15, NFR-16; UI-1–UI-3, UI-5, UI-8–UI-12 |
| B — Skill runner | carrier + two arms, `eval_runs` reshape, run dialog, list results, effect, lift | AC-2, AC-4, AC-20–AC-35, AC-40–AC-42, AC-59; EC-11–EC-28, EC-30, EC-31, EC-38, EC-40, EC-46; NFR-2, NFR-4, NFR-5, NFR-6, NFR-9, NFR-12, NFR-13; UI-4, UI-6, UI-7 |
| C — Metric trend | shared chart with tooltip on both tabs and the detail page, `cost_usd` per agent trend point, window 100 | AC-36–AC-39, AC-55–AC-58; EC-28 (gaps), EC-30 (chart part) |

**Non-goals**
- Not doing an "expect no findings at all" expectation type (the mockup's
  `clean-refactor-no-flags` / `empty []` row) — a `must_not_flag` case over the
  hunk's lines covers it (Q-8).
- Not doing a per-row ▷ run of one case (mockup) — the run unit stays the whole
  set (Q-9).
- Not doing a skill run history table, a skill run-detail modal or **Compare**
  for skill runs (Q-14).
- Not doing a cost estimate before a skill run (upstream
  `GET /skills/:id/eval/estimate`) — the dialog shows the review count (Q-13).
- Not doing **Run all skills** (upstream `POST /eval/skills/runs/all`).
- Not running a skill without a carrier (bare skill text plus a neutral system
  prompt) — considered and rejected because no live review runs that prompt,
  so its numbers predict nothing about real reviews (Q-10).
- Not doing a single arm (with-skill only) — considered and rejected because
  without the baseline arm a change cannot be attributed to the skill rather
  than the carrier's prompt or model.
- Not doing in-place edits of review input with a case `revision` column, or
  "edited since last run" markers — rejected by the user in favour of the
  replace rule.
- Not cherry-picking upstream migrations 0020–0026 — they assume an `eval_runs`
  shape this branch does not have (researcher R1).
- Not doing the other L06 stretch items: the skill eval file in `evals/`
  (item 1), the PreToolUse commit-gate hook in `.claude/settings.json`
  (item 4) and mutation testing on one module (item 5) are plan/doc tasks with
  no spec.

## User stories

- **US-1** As an agent or skill author, I want to create an eval case by hand from a pasted diff, an expectation type, a file and a line range, with a live preview of the diff, so that my set covers bugs no agent has produced yet.
- **US-2** As an agent or skill author, I want to see every case of my set with its latest result, edit it and delete it, so that the set stays correct without corrupting past results.
- **US-3** As a skill author, I want to run all cases of my skill inside an agent that uses it, with and without the skill, so that I see what the skill itself changes.
- **US-4** As an agent or skill author, I want a trend chart of the metrics over all runs, each point naming the version and the cost, so that I see slow degradation across versions.
- **US-5** As a skill author triaging findings on a PR, I want to turn a decided finding into a case for a skill that shaped that review, so that my real decisions become the skill's regression set too.

## Acceptance criteria (EARS)

### Skill Evals tab — case list
- **AC-1** (US-2) КОЛИ the user opens `/skills/:id?tab=evals`, the system (shall) show the heading **Eval cases**, a **Run all evals** button and a **+ New eval case** button above the case list.
- **AC-2** (US-2) КОЛИ the skill has a finished run, the system (shall) show next to the heading "{passed} / {scored} passing", where scored counts the cases scored in both arms of the skill's latest finished run and passed counts those that passed in the with-skill arm.
- **AC-3** (US-2) КОЛИ the skill Evals tab loads, the system (shall) list every eval case of the skill, newest first by `created_at`, each row showing the case's result state with an icon and a text label, the case name, "expected {n}, got {m}" for the with-skill arm or `never run`, a `SEVERITY · category` tag for `must_find` or a `must not flag` tag for `must_not_flag`, `file:start_line-end_line`, an edit action and a delete action.
- **AC-4** (US-3) КОЛИ a case has a result in the skill's latest finished run, the system (shall) show on its row the case's effect as one of the text labels `helped`, `hurt`, `no effect · pass`, `no effect · fail` or `errored`.
- **AC-54** (US-2) КОЛИ the client requests `GET /skills/:id/eval-cases`, the system (shall) return every case of the skill, newest first by `created_at`, as `EvalSkillCaseListItem` items with `latest_result: null` when the skill has no finished run that included the case.

### Agent Evals tab — new and edit
- **AC-43** (US-1) КОЛИ the agent Evals tab loads, the system (shall) show a **+ New eval case** button next to **Run all evals**.
- **AC-44** (US-2) КОЛИ the agent Evals tab lists cases, the system (shall) show an edit action on every row before the delete action.
- **AC-45** (US-1) КОЛИ the user clicks **Save** on a new case on the agent Evals tab, the system (shall) create it through `POST /agents/:id/eval-cases` and respond `201` with the case, `owner_kind: "agent"`, `owner_id` equal to the agent id and `source_finding_id: null`.

### Case Editor — create
- **AC-5** (US-1) КОЛИ the user clicks **+ New eval case** on either tab, the system (shall) open the Case Editor modal with the fields name, PR title, description, diff, file, expectation type (default `must_find`), start line, end line, notes, and — only while the type is `must_find` — severity and category, all empty except the type.
- **AC-6** (US-1) КОЛИ the diff field holds text with one or more `diff --git` or `+++` file headers, the system (shall) offer the new-side paths found in it as the file choices, with the first path preselected.
- **AC-7** (US-1) КОЛИ the diff field holds hunks (`@@ … @@`) and no file header, the system (shall) show the file as a required free-text path field and treat the hunks as that file's diff.
- **AC-8** (US-1) ПОКИ the diff field holds text with at least one hunk for the chosen file, the system (shall) show a diff-view preview of only that file's section with the lines from start line to end line highlighted on the new-side line numbers.
- **AC-9** (US-1) КОЛИ the user clicks **Save** on a new case on the skill Evals tab, the system (shall) create it through `POST /skills/:id/eval-cases` and respond `201` with the case, `owner_kind: "skill"`, `owner_id` equal to the skill id and `source_finding_id: null`.
- **AC-10** (US-1) КОЛИ the server creates a case from the Case Editor, the system (shall) store as the frozen diff only the chosen file's section — `diff --git`, `---` and `+++` headers plus every hunk of that file — with headers generated from the file path when the input had none.
- **AC-11** (US-1) КОЛИ the server creates a case from the Case Editor, the system (shall) store `input_meta` with `pr_number: null`, `repo_full_name: null`, `title` from the PR title field and `body` from the description field, or `null` when the description is empty.
- **AC-12** (US-1) КОЛИ a create request responds `201`, the system (shall) close the editor and show the new case at the top of its tab's list as `never run` without a page reload.
- **AC-46** (US-1) КОЛИ the server receives a pasted diff, the system (shall) convert every CRLF line ending to LF before parsing, validating and storing it.

### Case Editor — open, edit and delete
- **AC-13** (US-2) КОЛИ the user clicks a case row or its edit action on either tab, the system (shall) open the Case Editor prefilled with the case's stored name, PR title, description, diff, file, type, lines, severity, category and notes, and its latest result with duration and cost.
- **AC-14** (US-2) КОЛИ the user saves an edit of a manual case that changes only the name, notes, severity or category, the system (shall) update the case in place through `PATCH /eval-cases/:id`, keeping its id and its latest result.
- **AC-15** (US-2) КОЛИ the user saves an edit of a manual case that changes the diff, file, start line, end line, expectation type, PR title or description, the system (shall) replace the case in one transaction: create a new case with all edited values and the old case's `created_at`, then delete the old case.
- **AC-16** (US-2) КОЛИ a case was replaced by an edit, the system (shall) show the new case as `never run` in the old row's position, without a page reload.
- **AC-47** (US-2) КОЛИ `PATCH /eval-cases/:id` succeeds, the system (shall) respond `200` with the resulting case and `replaced_from_id` set to the old id when the case was replaced, or `null` when it was updated in place.
- **AC-17** (US-2) КОЛИ the user clicks the delete action of a case on the skill Evals tab, the system (shall) ask for confirmation in a dialog that names the case.
- **AC-18** (US-2) КОЛИ the user confirms the deletion on the skill Evals tab, the system (shall) delete the case through `DELETE /eval-cases/:id` and remove its row without a page reload.
- **AC-19** (US-2) КОЛИ the Case Editor shows a case without a source finding, the system (shall) show "Created manually" in place of the source PR link.

### Finding → skill case
- **AC-48** (US-5) КОЛИ the user expands a finding card on the PR page, the system (shall) show a **Turn into skill eval case** menu button in the card's action row after **Turn into eval case**.
- **AC-49** (US-5) КОЛИ the user opens the **Turn into skill eval case** menu, the system (shall) list the skills returned by `GET /findings/:id/eval-skills`, each by name, with an **In eval set** label linking to that skill's Evals tab when `has_case` is true.
- **AC-50** (US-5) КОЛИ the user picks a skill without a case in the menu, the system (shall) call `POST /findings/:id/skill-eval-case` with `skill_id` and create a case owned by that skill, with the expectation, frozen input, display fields, name and source finding id produced by the same rules as SPEC-08 AC-2 to AC-7.
- **AC-51** (US-5) КОЛИ `POST /findings/:id/skill-eval-case` creates the case, the system (shall) respond `201` with it.
- **AC-52** (US-5) КОЛИ `POST /findings/:id/skill-eval-case` responds `201` or `200`, the system (shall) show the skill's menu item as **In eval set** linking to the skill's Evals tab, without a page reload.
- **AC-53** (US-5) КОЛИ the client requests `GET /findings/:id/eval-skills`, the system (shall) return `{skills: [{skill_id, name, has_case, case_id}]}`, one entry per skill recorded in `agent_run_skills` for the run of the finding's review, in that run's skill order.

### Skill eval run
- **AC-20** (US-3) КОЛИ the user clicks **Run all evals** or the header **Run on evals** on the skill editor, the system (shall) open a run dialog listing, as carrier choices, every agent of the workspace linked to the skill, with the carrier of the skill's latest run preselected, or the first agent by name when there is none.
- **AC-21** (US-3) КОЛИ the run dialog is open, the system (shall) show the line "{n} cases · {2n} reviews" for the skill's current case count.
- **AC-22** (US-3) КОЛИ the user confirms the run dialog, the system (shall) call `POST /skills/:id/eval-runs` with `carrier_agent_id`, which responds `202` with the new run's `id` and `status: "running"` before any case is reviewed.
- **AC-23** (US-3) КОЛИ a skill eval run starts, the system (shall) record on the run the skill's `version`, name and body, the carrier's id, name and `version`, and the carrier's `provider`, `model`, `strategy` and `system_prompt` at that moment.
- **AC-24** (US-3) КОЛИ a skill eval run starts, the system (shall) record as the with-skill arm's skill list the carrier's linked skills that are enabled for its prompt, in link order, with the skill under test included at its link position regardless of the skill's own `enabled` flag and the link's `enabled` flag, placed after every other linked skill that has the same link `order`.
- **AC-25** (US-3) КОЛИ a skill eval run starts, the system (shall) record as the without-skill arm's skill list the with-skill arm's list minus the skill under test.
- **AC-26** (US-3) КОЛИ a skill eval run starts, the system (shall) record the ids and names of every case of the skill at that moment as the run's case set.
- **AC-27** (US-3) ПОКИ a skill eval run executes, the system (shall) review each case of the run's case set once per arm, one review at a time, each with the case's parsed frozen diff, a task line built from the frozen PR title, the frozen description as the PR description, the run's snapshotted carrier provider, model, strategy and system prompt, and that arm's recorded skill list, with no repo-intel, project context, PR context, intent or out-of-scope filter.
- **AC-28** (US-3) The system (shall) score each arm of each case with the SPEC-08 rules for `must_find` and `must_not_flag` (AC-27, AC-28) and classify each kept finding as TP, FP or unlabeled (SPEC-08 AC-29).
- **AC-29** (US-3) The system (shall) compute for each arm of a run `recall`, `precision`, `citation_accuracy`, `tp`, `fp`, `unlabeled`, `traces_passed` and `traces_total` with the SPEC-08 definitions (AC-30 to AC-34), over the cases scored in both arms.
- **AC-30** (US-3) The system (shall) store for each of recall, precision and citation accuracy the raw lift, the with-skill value minus the without-skill value of the same run as an unrounded fraction, alongside both arms' metrics.
- **AC-31** (US-3) The system (shall) set each case's effect to `helped` when it passed with the skill and failed without, `hurt` when it failed with the skill and passed without, `no_effect_pass` when it passed in both arms, `no_effect_fail` when it failed in both arms, and `errored` when either arm errored.
- **AC-32** (US-3) КОЛИ every case of a skill run has a result in both arms and at least one case was scored in both, the system (shall) store both arms' metrics and the lifts, set `finished_at`, and set `status` to `completed` when no case errored or to `partial` when one or more cases errored.
- **AC-33** (US-3) ПОКИ the skill has a run with `status: "running"`, the system (shall) disable **Run all evals** and **Run on evals** and show "Running case {k} of {n}" with k = `cases_done` + 1 and n = `cases_total`, updated by polling `GET /eval-runs/:id`.
- **AC-34** (US-3) КОЛИ a polled skill run leaves `status: "running"`, the system (shall) stop polling, refresh the passing count, the case list, the lift summary and the trend chart, and announce the final status in an `aria-live="polite"` region.
- **AC-35** (US-3) КОЛИ the skill has a finished run, the system (shall) show under the heading the line "Lift vs. without skill — recall {Δ} · precision {Δ} · citation {Δ}" for the latest finished run, each Δ formatted per NFR-9.

### Read API (skill runs)
- **AC-40** (US-2, US-3) КОЛИ the skill has a finished run, the system (shall) return in each `GET /skills/:id/eval-cases` item a `latest_result` holding the with-skill state, the without-skill state, the effect, the with-skill expected and got counts, the case's cost over both arms and the error reason from the latest finished run, or `null` when the case was not in that run.
- **AC-41** (US-3, US-4) КОЛИ the client requests `GET /skills/:id/eval-overview`, the system (shall) return an `EvalSkillOverview` with `skill`, `cases_total`, `running_run_id`, `carriers` (the workspace agents linked to the skill), `latest` and `previous` (the two newest finished runs, `null` when absent) and `trend` (at most 100 finished runs, chronological).
- **AC-59** (US-2, US-3) КОЛИ the client requests `GET /eval-cases/:id` for a skill-owned case and the skill has a finished run that included the case, the system (shall) return `latest_result` with the with-skill arm's state, expected and got counts and error reason, and the duration and cost summed over both arms, from the skill's latest finished run.
- **AC-42** (US-3) КОЛИ the client requests `GET /eval-runs/:id`, the system (shall) return an `EvalRunDetail` discriminated by `owner_kind`, where a skill run carries the skill version, the carrier snapshot, both arms' skill lists, both arms' metrics, the lifts, the per-case results of both arms with each case's effect, and `cases_done` and `cases_total`.

### Metric trend
- **AC-36** (US-4) КОЛИ the skill Evals tab loads, the system (shall) show a **Metric trend** line chart with three labelled series — recall, precision and citation accuracy of the with-skill arm — with one point per finished run of the skill over its last 100 finished runs in chronological order, the x-axis labelled with each run's `v{skill version}`.
- **AC-37** (US-4) КОЛИ the user hovers over or focuses a point of the skill trend, the system (shall) show a tooltip with the run date, `v{skill version}`, the carrier agent's name with `v{carrier version}`, the carrier model, the with-skill recall, precision and citation accuracy as integer percentages, each metric's lift per NFR-9, and the run's total cost over both arms.
- **AC-55** (US-4) КОЛИ the agent Evals tab loads, the system (shall) show the **Metric trend** line chart with recall, precision and citation accuracy over the agent's last 100 finished runs in chronological order, the x-axis labelled with each run's `v{agent version}`.
- **AC-56** (US-4) КОЛИ the user hovers over or focuses a point of an agent trend, the system (shall) show a tooltip with the run date, `v{agent version}`, recall, precision and citation accuracy as integer percentages and the run's `cost_usd`.
- **AC-57** (US-4) КОЛИ the agent's Eval Dashboard detail page loads, the system (shall) show its **Metric trend** over the agent's last 100 finished runs with the tooltip of AC-56.
- **AC-58** (US-4) КОЛИ the client requests `GET /agents/:id/eval-overview`, the system (shall) return `trend` with at most 100 finished runs in chronological order, each point carrying `cost_usd` (`null` when unknown).
- **AC-38** (US-4) The system (shall) make every point of every trend chart reachable with the Tab key and give it an accessible name that carries the same text as its tooltip.
- **AC-39** (US-4) КОЛИ a trend tooltip is open and the user presses Escape or moves focus or the pointer away, the system (shall) close the tooltip.

## Edge cases

- **EC-1** ЯКЩО the pasted diff is larger than 204,800 UTF-8 bytes, ТОДІ the system (shall) block **Save** on the client and the server rejects the same input with `422` `frozen_diff_too_large` — checked in the service after the owner's `404` check and before the pasted diff is parsed, not by the request schema — both showing "The diff is larger than 200 KB — paste only the file you need" with every input unchanged.
- **EC-42** ЯКЩО a create or edit request body exceeds the server's 1 MiB body limit and the server answers `413`, ТОДІ the system (shall) show the same message as EC-1 with every input unchanged.
- **EC-2** ЯКЩО the pasted diff holds no hunk for the chosen file, ТОДІ the system (shall) reject the save with `422` `no_patch` and show "This diff has no changed lines for the chosen file".
- **EC-3** ЯКЩО the expectation's line range intersects no hunk's new-side lines of the chosen file (for example old-side numbers were entered), ТОДІ the system (shall) reject the save with `422` `range_outside_diff` and show "The line range is outside the diff's changed lines — use new-side line numbers".
- **EC-4** ЯКЩО start line is below 1, end line is below start line or either is not an integer, ТОДІ the system (shall) disable **Save** with an inline message on the line fields and the server rejects the same input with `422` `validation_error`.
- **EC-5** ЯКЩО the name is empty or longer than 80 characters, the PR title is empty or longer than 200 characters, the description is longer than 5,000 characters, the notes are longer than 2,000 characters or the file path is empty or longer than 500 characters, ТОДІ the system (shall) reject the save with `422` `validation_error` and keep the editor open with every input unchanged.
- **EC-41** ЯКЩО a create or edit request sets the type to `must_not_flag` and carries a severity or a category, ТОДІ the system (shall) store both as `null`.
- **EC-6** ЯКЩО a `PATCH /eval-cases/:id` request changes the diff, file, lines, type, PR title, description, severity or category of a case that has a source finding, ТОДІ the system (shall) reject it with `422` `case_input_locked` and change nothing.
- **EC-7** ЯКЩО the Case Editor opens a case that has a source finding (agent- or skill-owned), ТОДІ the system (shall) render its diff, file, lines, type, PR title, description, severity and category read-only with the note "Created from a finding — only the name and notes can be edited" and the source PR link.
- **EC-8** ЯКЩО the user closes the Case Editor with unsaved changes (close button, Escape, backdrop), ТОДІ the system (shall) ask "Discard changes to this case?" and keep the editor open unless the user confirms.
- **EC-9** ЯКЩО a save request fails with a network error or a `5xx`, ТОДІ the system (shall) keep the editor open with every input unchanged and rely on the global error toast without adding a second one.
- **EC-10** ЯКЩО a case is edited, replaced or deleted while a run that includes it executes, ТОДІ the system (shall) finish that case from the input read at the start of the run and keep its result under the case name recorded at the start.
- **EC-35** ЯКЩО the finding has neither `accepted_at` nor `dismissed_at`, ТОДІ the system (shall) render **Turn into skill eval case** disabled with the tooltip "Accept or dismiss this finding first" and the server rejects the request with `422` `finding_undecided`.
- **EC-36** ЯКЩО the finding's review has no run or its run recorded no skill, ТОДІ the system (shall) render **Turn into skill eval case** disabled with the tooltip "No skill shaped this review".
- **EC-37** ЯКЩО `skill_id` is not among the skills recorded for the run of the finding's review, ТОДІ the system (shall) create nothing and respond `422` `skill_not_in_run`.
- **EC-39** ЯКЩО the skill already has a case made from this finding (double click, second tab, earlier session), ТОДІ the system (shall) create no second case and respond `200` with the existing case.
- **EC-43** ЯКЩО the finding already sources an agent-owned case or a case of another skill, ТОДІ the system (shall) still create the skill's case, keeping at most one case per owner and source finding.
- **EC-44** ЯКЩО the finding's file is absent from the PR's current diff or its line range intersects no hunk, ТОДІ the system (shall) reject the skill case with `422` `no_patch` or `422` `range_outside_diff` and show the messages of SPEC-08 EC-4 and EC-5 in the menu.
- **EC-11** ЯКЩО no agent of the workspace is linked to the skill, ТОДІ the system (shall) render **Run all evals** and **Run on evals** disabled with the hint "Link this skill to an agent first" and the server rejects a run start with `422` `no_agent_linked`.
- **EC-12** ЯКЩО `carrier_agent_id` names an agent that is not linked to the skill, ТОДІ the system (shall) start nothing and respond `422` `no_agent_linked`.
- **EC-13** ЯКЩО the skill has zero eval cases, ТОДІ the system (shall) render **Run all evals** and **Run on evals** disabled with the hint "Add an eval case first" and the server rejects a run start with `422` `no_eval_cases`.
- **EC-14** ЯКЩО `POST /skills/:id/eval-runs` arrives while the skill has a run with `status: "running"` (double click, second tab), ТОДІ the system (shall) start nothing and respond `409` `eval_run_in_progress` with the running run's id under the details key `run_id`.
- **EC-15** ЯКЩО a skill run is running while its carrier agent's own eval run starts, or the reverse, ТОДІ the system (shall) let both runs proceed without a `409`.
- **EC-16** ЯКЩО the review of a case fails in either arm (provider error, missing API key, structured-output failure after retries, frozen diff that parses to zero files), ТОДІ the system (shall) store that case as `errored` in both arms with the error reason and exclude it from both arms' metrics, the lifts and the effect counts.
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
- **EC-27** ЯКЩО either arm of any scored case has a `null` cost (model missing from the price table), ТОДІ the system (shall) store the run's cost as `null` and display "—", never "$0.00".
- **EC-38** ЯКЩО the client requests `GET /eval-runs/compare` with a skill run id, ТОДІ the system (shall) respond `404`.
- **EC-40** ЯКЩО a skill run exists for a carrier agent, ТОДІ the system (shall) leave that agent's Evals tab KPI cards, case results, run history, trend and the Eval Dashboard unchanged by it.
- **EC-28** ЯКЩО a run's plotted metric is `null`, ТОДІ the system (shall) leave a gap at that run in that trend series instead of drawing a 0.
- **EC-29** ЯКЩО the skill has no eval cases, ТОДІ the system (shall) show the empty state "No eval cases yet — create one from a diff, or turn a finding into a skill eval case on a PR" with a **+ New eval case** action.
- **EC-45** ЯКЩО the agent has no eval cases, ТОДІ the system (shall) show the empty state "No eval cases yet — create one from a diff, or accept or dismiss findings on a PR and click Turn into eval case" with a **+ New eval case** action and a link to the Pull Requests page.
- **EC-30** ЯКЩО the owner has eval cases but no finished run, ТОДІ the system (shall) show `never run` on every case, "—" for the passing count and the lift line, and "No runs yet" in place of the trend chart.
- **EC-46** ЯКЩО the skill's `enabled` flag is false or the chosen carrier's `link_enabled` (from `EvalSkillOverview.carriers`) is false, ТОДІ the system (shall) show in the run dialog the warning "This skill or its link to {carrier} is disabled — the with-skill arm includes it anyway", updated when the carrier choice changes, and still allow the run.
- **EC-31** ЯКЩО the skill has `injection_flagged` set, ТОДІ the system (shall) show in the run dialog the warning "This skill was flagged for prompt injection — its text is sent to the model in every with-skill review" and still allow the run.
- **EC-32** ЯКЩО a skill, agent, case, finding, run or carrier id belongs to another workspace, ТОДІ the system (shall) respond `404` as if it did not exist.
- **EC-33** ЯКЩО a case name, file path, skill name or carrier name does not fit its cell, menu item or tooltip line, ТОДІ the system (shall) truncate it with an ellipsis and expose the full text in a `title` attribute and to screen readers.
- **EC-34** ЯКЩО the user renames a case to a name another case of the same owner already has, ТОДІ the system (shall) accept the rename.

## Non-functional requirements

- **NFR-1** The system (shall) make zero LLM calls on case create, edit, replace, delete, on finding → skill case creation, on every read route of this spec and while scoring or aggregating a skill run, verified by tests that assert a mock provider received no call.
- **NFR-2** The system (shall) invoke `reviewPullRequest` exactly twice per case in a skill run, once per arm.
- **NFR-3** The system (shall) scope every case, finding and run query and mutation of this spec to the caller's `workspace_id` obtained through `getContext()`.
- **NFR-4** The system (shall) never write rows to `reviews`, `findings`, `agent_runs`, `agent_run_skills` or `run_traces` during a skill eval run.
- **NFR-5** The system (shall) exclude skill runs from every agent eval read (`GET /agents/:id/eval-overview`, `/agents/:id/eval-cases`, `/eval-dashboard`, `/eval-runs/compare`) and from the agent single-flight check, and keep one running run at most per agent and per skill.
- **NFR-6** The system (shall) keep a run's snapshot, skill lists, case set, per-case results, metrics and lifts unchanged once the run is finished, including after any case is edited, replaced or deleted.
- **NFR-7** The system (shall) serve every user-visible string of this feature through next-intl keys in `client/messages/en/eval.json`, the `evals.*` keys of `client/messages/en/skills.json`, or, for the finding-card menu, `client/messages/en/prReview.json`, with no hard-coded copy and no server-composed display text.
- **NFR-8** The system (shall) meet WCAG 2.1 AA on both Evals tabs, the Case Editor, the finding-card skill menu, the run dialog and every trend tooltip: every control keyboard-operable with visible focus, text contrast ≥ 4.5:1, every result state, effect and lift direction conveyed by text in addition to colour, and targets ≥ 24×24 px.
- **NFR-9** The system (shall) display metrics as integer percentages and every lift, at display time only, as signed integer points computed as `round(with·100) − round(without·100)` ("▲ 4 pt", "▼ 2 pt").
- **NFR-10** The system (shall) keep every changed or new eval contract identical in field names and value types in `server/src/vendor/shared/` and `client/src/vendor/shared/`, changed in the same commit, with `EvalCaseMeta.pr_number` and `repo_full_name` declared `.nullish()` in both copies.
- **NFR-11** The system (shall) add its schema changes only through generated Drizzle migrations (`pnpm db:generate`), add-column and drop-column passes generated separately, without editing an applied migration, with the source-finding unique index covering (`owner_kind`, `owner_id`, `source_finding_id`).
- **NFR-12** The system (shall) log each skill run start and finish with the run id, skill id, skill version, carrier agent id, case count, status and duration, and never log a diff, PR description, prompt, skill body or finding text.
- **NFR-13** The system (shall) return `GET /skills/:id/eval-overview`, `GET /skills/:id/eval-cases` and `GET /agents/:id/eval-overview` within 500 ms on a local database holding 100 finished runs and 50 cases for the owner.
- **NFR-14** The system (shall) use only placeholder secrets such as `sk_live_xxx` and `ghp_xxx` in every fixture, seed and test of this feature.
- **NFR-15** The system (shall) ship hermetic tests for the lift and effect computation (every `null` case included), the pasted-diff section extraction, header wrapping and CRLF normalisation, and the edit rule (in place vs replace, `created_at` kept, `case_input_locked`), plus a DB-backed integration test that skips itself without Docker and asserts the new routes, the `409` single-flight per skill, workspace scoping, the agent-read exclusion of NFR-5 and one case per owner and source finding.
- **NFR-16** The system (shall) keep every SPEC-08 behaviour of the agent Evals tab not amended in Goals unchanged, verified by the existing agent Evals tab, Eval Dashboard and finding-card tests passing without edits to their assertions, except the assertions on the amended behaviours — the read-only case modal on row click, rename in that modal, "Source no longer available" for manual cases and the empty-state copy — which are expected to change.

## Inputs and provenance

| Value | Source | Trusted? | Design source |
|---|---|---|---|
| Pasted diff | Case Editor (user input; often third-party code) | no | brief item 2; screenshot "+ New eval case" |
| File path, expectation type, start/end line | Case Editor (user input) | no (validated) | brief item 2 |
| PR title, description | Case Editor (user input) | no | `server/src/modules/eval/executor.ts:62-64` (task line, `prDescription`) |
| Case name, notes, severity, category | Case Editor (user input); `eval_cases.notes`; `Severity` / `FindingCategory` enums | no | screenshot row tags; `server/src/db/schema/eval.ts:41`; `server/src/vendor/shared/contracts/findings.ts:11-15` |
| `input_meta.pr_number`, `repo_full_name` | `null` for manual cases; PR and repo for finding-made cases | yes | `knowledge.ts:190-195`; root `INSIGHTS.md` (`.nullish()` for jsonb) |
| Frozen file section, grounding check | computed from the pasted diff or the PR diff (`extractFileDiff`, `freezeFileDiff`) | yes (computed) | `server/src/modules/eval/frozen-input.ts:17-106` |
| Case owner | route `:id` → `agents` or `skills` row in the caller's workspace | yes | screenshot; researcher R1 |
| Skills that shaped a finding's review | `reviews.run_id` → `agent_run_skills` | yes | `server/src/db/schema/reviews.ts:20`; `server/src/db/schema/runs.ts:56-71`; researcher R1 (upstream `SkillEvalMenu`) |
| Finding decision, location, severity, category, title | `findings` (decision: user; text: model output) | partly | SPEC-08 Inputs; `client/.../FindingCard/_components/EvalCaseButton/EvalCaseButton.tsx` |
| Carrier choices | `agent_skills` links of the skill → `agents` | yes | researcher R1; `server/src/db/schema/agents.ts:64-67` |
| Skill version, name, body at run start | `skills.version`, `.name`, `.body` | partly — imported/community skills are third-party text | screenshot "v5"; `server/src/db/schema/skills.ts:22-23` |
| Carrier version, provider, model, strategy, system prompt | `agents` row at run start | yes (author-written) | SPEC-08 AC-20 |
| With / without skill lists | carrier's enabled prompt skills (`enabledSkillsForPrompt`) ± the skill under test | partly (skill text) | `server/src/modules/agents/repository.ts:278-294`; researcher R1 |
| Kept findings per case per arm | `reviewPullRequest(...).review.findings` (model output, grounded, redacted) | no | `executor.ts:53-79` |
| Grounding kept / total, cost per arm | `reviewPullRequest(...)` | yes (computed) | `executor.ts:77-79`; SPEC-08 EC-21 |
| Metrics per arm, raw lift, effect | scorer (SPEC-08 definitions) and arm pairing | yes (computed) | SPEC-08 AC-27–AC-34; researcher R1 (upstream `pairArms`, effects) |
| Agent trend points with `cost_usd` | `eval_runs.cost_usd`, finished agent runs | yes | `server/src/db/schema/eval.ts:82`; brief item 3 |
| Skill trend points | finished skill runs | yes (computed) | brief item 3 ("точка = прогін, тултіп = версія промпта і вартість") |
| 200 KB cap (204,800 bytes), error codes `no_agent_linked`, `frozen_diff_too_large` | upstream values | yes (config) | researcher R1; planner verification |

### Contracts (proposed names; both vendor copies)

```text
EvalCaseMeta            { pr_number?: int|null, repo_full_name?: string|null, title: string, body: string|null }   // nullish
EvalCaseInput           // body of POST /agents/:id/eval-cases and POST /skills/:id/eval-cases
  { name: string(1..80), notes?: string(..2000)|null,
    input_diff: string,            // no size cap in the schema: the 204,800-byte cap is a service
                                   // check after the owner 404, before parsing → 422 frozen_diff_too_large (EC-1)
    input_meta: { title: string(1..200), body?: string(..5000)|null },
    expectation: { type: 'must_find'|'must_not_flag', file: string(1..500),
                   start_line: int>=1, end_line: int>=start_line,
                   severity?: Severity|null, category?: FindingCategory|null } }
EvalCaseUpdate          // body of PATCH /eval-cases/:id — every top-level key optional;
                        // input_meta / expectation, when present, are complete objects
EvalCase                += replaced_from_id?: string|null   // PATCH response only
EvalCaseEffect          'helped'|'hurt'|'no_effect_pass'|'no_effect_fail'|'errored'
EvalSkillCaseListItem   { id, name, expectation, created_at, source_finding_id: string|null,
                          latest_result: { run_id, with_state, without_state: 'passed'|'failed'|'errored',
                                           effect: EvalCaseEffect, expected_count: int|null, got_count: int|null,
                                           cost_usd: number|null, error_reason: string|null } | null }
EvalLift                { recall, precision, citation_accuracy: number|null }   // raw fractions
EvalSkillRunRecord      { id, owner_kind: 'skill', skill_id, skill_name, skill_version,
                          carrier: { agent_id, name, version, model }, status, started_at, finished_at,
                          cases_total, cases_done, with: EvalMetrics|null, without: EvalMetrics|null,
                          lift: EvalLift|null, cost_usd: number|null, duration_ms: int|null, error_reason: string|null }
EvalSkillTrendPoint     { run_id, ran_at, skill_version, carrier_agent_id, carrier_name, carrier_version, model,
                          recall, precision, citation_accuracy: number|null,   // with-skill arm
                          lift: EvalLift, cost_usd: number|null }
EvalSkillOverview       { skill: { id, name, version, enabled }, cases_total, running_run_id: string|null,
                          carriers: [{ agent_id, name, version, model, enabled, link_enabled: boolean }],
                          latest, previous: EvalSkillRunRecord|null, trend: EvalSkillTrendPoint[] (<=100) }
EvalCaseDetail          // GET /eval-cases/:id — for a skill-owned case, latest_result (EvalCaseLatestResult)
                        // is derived from the latest finished skill run: state = with-skill arm's state,
                        // expected/got = with-skill arm, duration_ms and cost_usd summed over both arms (AC-59)
EvalTrendPoint          += cost_usd: number|null
EvalRunDetail           discriminatedUnion('owner_kind', [
                          EvalAgentRunDetail  (today's EvalRunDetail + owner_kind: 'agent' — additive: every agent
                                               run response gains owner_kind: 'agent'; NFR-16 unaffected),
                          EvalSkillRunDetail  (EvalSkillRunRecord + snapshot{ carrier, skill{name, body, version},
                                               with_skills, without_skills: [{name, body}] },
                                               case_set, case_results: [{ case_id, case_name, with, without: EvalCaseOutcome,
                                                                          effect: EvalCaseEffect }]) ])
EvalFindingSkills       { skills: [{ skill_id, name, has_case: boolean, case_id: string|null }] }   // GET /findings/:id/eval-skills
SkillEvalCaseRequest    { skill_id: uuid }   // POST /findings/:id/skill-eval-case → 201 | 200 EvalCase
SkillEvalRunRequest     { carrier_agent_id: uuid }   // POST /skills/:id/eval-runs → 202 EvalRunStart
```

## Untrusted inputs

- **UI-1** Pasted diff (user-pasted, often third-party code) → LLM prompt in every review of the case: the system (shall) pass it through the same prompt assembly as a live review, which wraps the diff and keeps `INJECTION_GUARD` in the system message, with no eval-specific bypass.
- **UI-2** PR title and description from the Case Editor → LLM prompt: the system (shall) pass the title only through the task line and the description only as `prDescription`, which the engine truncates and wraps as untrusted.
- **UI-3** Pasted diff, PR title and description → Case Editor preview and read-only view: the system (shall) render them as escaped plain text in the diff view and text blocks, with no HTML or Markdown interpretation.
- **UI-4** Skill body (author-written or imported third-party text) → system prompt of the with-skill arm: the system (shall) inject it exactly as a live review injects linked skills, with the injection-flag warning of EC-31 shown before the run.
- **UI-5** Pasted diff size → server memory and token cost: the system (shall) reject a diff larger than 204,800 bytes before parsing it (EC-1, EC-42).
- **UI-6** Model output (findings of each arm) → stored per-case results: the system (shall) store only findings that passed the engine's schema validation, grounding and secret redaction, and validate the stored result against its Zod contract before returning it.
- **UI-7** Snapshotted names (skill, carrier) → tooltip, case list and run responses: the system (shall) render them as escaped text.
- **UI-8** File path from the Case Editor → database, prompt and UI: the system (shall) store it as a bound string parameter of 1–500 characters, never use it as a filesystem path, git argument or shell argument, and render it as escaped text.
- **UI-9** User-entered name (1–80 characters), notes (≤ 2,000), PR title (1–200), description (≤ 5,000), severity (`Severity` enum) and category (`FindingCategory` enum) → database and UI: the system (shall) reject values outside these limits with `422` `validation_error`, store accepted values as bound parameters and render them as escaped text.
- **UI-10** Path and body ids (`:id`, `skill_id`, `carrier_agent_id`) → database queries: the system (shall) validate them as UUIDs through the route schema (`422` on failure) and query only through Drizzle bound parameters scoped to the caller's workspace.
- **UI-11** Finding text and PR diff, title and body → skill case frozen input: the system (shall) freeze and later use them under the same neutralisation as SPEC-08 UI-1 to UI-6.
- **UI-12** Mockup text, upstream code and research reports → this spec and its tests: the system (shall) treat them as data, use only placeholder secrets (NFR-14) and copy no upstream code without review.

## Open questions

- **Q-1** This spec exceeds the spec-authoring size guidance (59 AC, 46 EC across three features). Split it into SPEC-09 (Phase A: Case Editor for both owners + finding → skill case), SPEC-10 (Phase B: skill runner) and SPEC-11 (Phase C: metric trends)? — default: keep one spec delivered in the three phases of Goals, as the user decided; split only if plan review finds a phase cannot be verified on its own — owner: user.
- ~~**Q-2**~~ Dropped 2026-10-11 — the Case Editor on the agent Evals tab is now in scope (AC-43 to AC-45).
- ~~**Q-3**~~ Dropped 2026-10-11 — the agent trend chart, tooltip and `cost_usd` are now in scope (AC-55 to AC-58).
- **Q-4** Tooltip contents (AC-37, AC-56): is this the right set? — default: yes — owner: user.
- **Q-5** `Supersedes:` stays `—`, with the amended SPEC-08 items listed in Goals? — default: yes — owner: user.
- **Q-6** Trend window: 100 finished runs for both owners (AC-36, AC-55, AC-57, AC-58)? — default: 100 — owner: user.
- **Q-7** Diff cap 200 KB = 204,800 bytes (upstream) rather than 100 KB? — default: 200 KB — owner: user.
- **Q-8** Add an "expect no findings at all" type (mockup `empty []`)? — default: no — owner: user.
- **Q-9** Add a per-row ▷ run of one case (mockup)? — default: no — owner: user.
- **Q-10** Carrier design: keep carrier + two arms, or run the skill alone with a neutral system prompt? — default: carrier + two arms — owner: user.
- ~~**Q-11**~~ Dropped 2026-10-11 — **Turn into skill eval case** is in scope (AC-48 to AC-53) and the index is widened (NFR-11).
- **Q-12** Skill trend filter by carrier when runs used different carriers? — default: no filter; each tooltip names its carrier — owner: user.
- **Q-13** Show a cost estimate in the skill run dialog (upstream `GET /skills/:id/eval/estimate`)? — default: no; show "{n} cases · {2n} reviews" — owner: user.
- **Q-14** Skill run history table, run-detail modal and **Compare** for skill runs? — default: not in this spec — owner: user.
- **Q-15** Polling timeout for a skill run: 20 minutes (EC-19, twice SPEC-08's 10 because every case runs twice)? — default: 20 minutes — owner: user.
- **Q-16** Error codes for manual input: keep this branch's `no_patch` and `range_outside_diff` (spec-original for manual input) rather than upstream's `expectation_not_grounded`, and adopt upstream's `frozen_diff_too_large`? — default: yes — owner: user.
- ~~**Q-17**~~ Dropped 2026-10-11 — default accepted and fixed in EC-46 (warning on a disabled skill or carrier link, via `carriers[].link_enabled`). Original question: warn in the run dialog when the skill itself or its link to the chosen carrier is disabled (upstream AC-52 / `gates_bypassed`), not only on `injection_flagged` (EC-31)? — default: yes — owner: user.
