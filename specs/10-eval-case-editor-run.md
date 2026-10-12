# Spec: Eval case modal from a finding, per-case Run and Evals tab redesign
Spec ID: SPEC-10
Status: draft
Supersedes: —

## Проблема й користувач

Every `file:line` reference in this spec is at branch `L06-homework-stretch`
(SPEC-08 and SPEC-09 shipped). The design sources are four mockup screenshots
(three of the "New eval case" modal, one of the agent Evals tab), read from
the caller's paths; every behaviour in them that no earlier spec defines is
specified here.

Two people tune review behaviour in DevDigest: the **agent author** and the
**skill author**. Both build a regression set of eval cases. Four gaps stand
in the way today:

1. **A finding becomes a case blindly.** **Turn into eval case** creates the
   case at once through `POST /findings/:id/eval-case` with no input
   (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/EvalCaseButton/EvalCaseButton.tsx:59-61`;
   SPEC-08 AC-2, AC-3). The author cannot see the frozen diff, adjust the
   expectation or pick the owner. A skill-owned case needs a second control,
   the **Turn into skill eval case** menu (`FindingCard.tsx:128-129`;
   SPEC-09 AC-48 to AC-53).
2. **The set is the only run unit.** A change to one case can only be checked
   by running every case of the owner (SPEC-08 Non-goals: "Not doing a
   per-case run, **Run case**, **Run on save**"; SPEC-09 Non-goals: "Not doing
   a per-row ▷ run of one case"). A paid run of the whole set to test one case
   is the cost today.
3. **The Evals tabs do not match the target design.** The agent tab has no
   per-row **Run**, no **Edit** label, no "recall X%" per row, and **New eval
   case** is secondary and placed before **Run all evals**
   (`client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx:76-85`);
   the skill tab has no KPI cards.
4. **The Case Editor has no room for the new content and shows the layout
   bugs of mockups 2 and 3.** It is a single-column form
   (`client/src/components/eval-case-editor/EditorModal/EditorModal.tsx:164-175`,
   `.../styles.ts:5`) inside the kit `Modal`, whose body is one `overflow:auto`
   region without a height (`client/src/vendor/ui/kit/Modal.tsx:60`). Mockup 2
   shows the result banner overlapping the scrolled content, and mockups 2 and
   3 show a second inner scrollbar.

A single-case run also carries a data hazard the mockups already show: mockup 4
reads "TRACES PASSED 1/1" over a list that reads "5/6 passing". The case list
takes every case's "latest result" from the owner's single newest finished run
(`server/src/modules/eval/service.ts:282-291`, `326-329`), so a run of one
case, stored like any run, would blank the other five cases and replace the
KPI cards, the trend and the dashboard with a one-case run (researcher R1).

## Goals / Non-goals

**Goals**
- Clicking **Turn into eval case** on a decided finding opens the Case Editor
  seeded from the finding; nothing is created until **Save**. The modal lets
  the user pick the owner (the finding's agent or a skill that shaped the
  review). The PR page keeps exactly one eval-case control.
- The Case Editor becomes the two-column modal of mockups 1 to 3: seeded
  banner (POSITIVE / NEGATIVE), **Name**, **Input** tabs (Diff, Files, PR
  meta), an **Expected output** JSON editor with a validity indicator and
  **+ Finding skeleton**, an **Actual output** pane, a result banner, and the
  footer **Run on save**, **Cancel**, **Run case**, **Save**. Header, result
  banner and footer stay fixed; no scrollbar appears on the modal body.
- A single case can be run: from the modal (**Run case**, **Run on save**) and
  from a per-row **Run** on both Evals tabs. For a skill-owned case, **Run
  case** runs both arms inside a carrier agent, as the skill run does.
- A case run is stored as a run of its own kind and never changes the KPI
  cards, the trend, the run history, the dashboard or Compare. Each case's
  result comes from the newest set run or case run that contains it, an
  errored case run included (AC-46).
- The agent Evals tab is rebuilt to mockup 4; the skill Evals tab matches it
  and gains KPI cards of the with-skill arm.
- The user approved all defaults below and explicitly consented (recorded
  here) to editing the eval contracts in both
  `server/src/vendor/shared/` and `client/src/vendor/shared/` in the same
  commit of each phase, and to one new migration, `0025_*` (the next number
  after `0024_bouncy_sleepwalker.sql`), generated only through
  `pnpm db:generate` (`eval_runs.scope`).

### Decisions (defaults approved by the user; any of them can still be revised)

| Decision | Value | Open question |
|---|---|---|
| Expected output JSON | An array of exactly one `EvalExpectation`; the scorer and SPEC-08 AC-28 do not change | Q-1 |
| Single-case run storage | An `eval_runs` row with `scope = 'case'` (one add-column migration) | Q-2 |
| Input of a finding-seeded case | Editable in the modal until the first **Save**; after it, SPEC-09 EC-6 and EC-7 lock it | Q-3 |
| Skill-owned **Run case** | Both arms in a carrier agent, through the SPEC-09 carrier dialog | Q-4 |
| `Supersedes:` line | `—`, with the overridden items listed below | Q-5 |
| KPI deltas, KPI captions, trend chart | Kept; the tab is only restyled | Q-6 |
| Scroll rule of the modal | No scrollbar on the body or on a column; each text pane scrolls inside itself | Q-7 |
| Seeded name | "From finding: {title}", at most 80 characters | Q-8 |
| Single-flight | One running run per owner, of any `scope` | Q-9 |
| Delivery | One spec, two phases | Q-10 |
| Server routes of SPEC-09 | `GET /findings/:id/eval-skills` and `POST /findings/:id/skill-eval-case` stay; only the client `SkillEvalMenu` goes | Q-11 |

### Design constraints (from the plan review)

- A case run reuses the set executor: `startRun` and `startSkillRun`
  (`server/src/modules/eval/service.ts:420-468`, `554-625`) take a case set of
  one case and a `scope` parameter; there is no second run path. The boot
  reaper, `saveProgress`, `finalizeRun`, `isRunning` and `deleteByAgent` /
  `deleteBySkill` stay unfiltered by `scope`.
- A finished run for the per-case result is wider than the run lists' "finished":
  `FINISHED` is `completed` or `partial` (`service.ts:85`,
  `repository.ts:46`), and `finalStatus` returns `errored` for a run with no
  scored case (`helpers.ts:475-478`), so a single errored case run is stored as
  `errored` and must still be the case's latest result (AC-46).
- The carrier dialog now under
  `client/src/app/skills/_components/SkillEditor/_components/RunDialog/` moves
  unchanged to `client/src/components/carrier-run-dialog/`: the shared Case
  Editor cannot import a route's `_components/`, and a shared component cannot
  contain its own `_components/` (`client/CLAUDE.md`; `client/INSIGHTS.md`
  2026-10-11). The skill tab imports it from there (NFR-19).
- Phase A ships the Case Editor with an empty banner slot above the footer;
  the **Run on save** toggle, **Run case**, the banner content and the row
  **Run** arrive in Phase B.

### Items of SPEC-08 and SPEC-09 this spec overrides

This spec amends approved SPEC-08 and implemented SPEC-09 without editing
them (precedent: SPEC-09 Goals). Where this spec and an item below disagree,
this spec wins.

| Earlier item | What changes |
|---|---|
| SPEC-08 Non-goal "Not doing a per-case run, **Run case**, **Run on save**, or **+ New eval case** from scratch with a JSON editor (mockups 5–6)" | Reversed. **+ New eval case** was already reversed by SPEC-09; per-case run, **Run case**, **Run on save** and the JSON editor (as an array of one) are now in scope |
| SPEC-09 Non-goal "Not doing a per-row ▷ run of one case (mockup) — the run unit stays the whole set (Q-9)" | Reversed; SPEC-09 Q-9 is answered "yes" |
| SPEC-08 AC-2, AC-3 ("through one `POST /findings/:id/eval-case` request with no further input") | The click opens the modal; the case is created at **Save**. The route without a body keeps the old behaviour (AC-8) |
| SPEC-08 AC-8, AC-9 (**In eval set** replaces the button once the agent has a case) | **In eval set** shows only when the agent and every skill of the review have a case (AC-11) |
| SPEC-08 EC-2 (button disabled when the agent was deleted) | Disabled only when no owner is left (EC-3, EC-4) |
| SPEC-08 AC-11, AC-12 (row content) and SPEC-09 AC-3, AC-44 | Row layout and result text of AC-29 and AC-30 |
| SPEC-08 AC-25, EC-10, EC-37 and SPEC-09 AC-33, EC-14, EC-15 (single-flight) | The guard covers every run of the owner, case runs included (AC-49, EC-18) |
| SPEC-09 AC-48 to AC-53 (the **Turn into skill eval case** menu) and the UI parts of SPEC-09 EC-35, EC-36, EC-37, EC-44 | The menu is removed; the same capability is the owner picker (AC-5) and EC-1 to EC-5. The routes of AC-50 to AC-53 stay |
| SPEC-09 EC-6, EC-7 (a finding-made case is input-locked) | Locked only after the first **Save** (AC-12, AC-13) |
| SPEC-09 AC-1, AC-43 (button order and emphasis) | **Run all evals** secondary, then **New eval case** primary (AC-28) |
| SPEC-09 NFR-5, EC-40 (skill runs excluded from agent reads) | Extended: case runs are excluded from every set aggregate (AC-47, NFR-5) |
| `client/INSIGHTS.md` 2026-10-11 entry on the `FindingsPanel` mock of `lib/hooks/skill-eval` | Obsolete once `SkillEvalMenu` is gone; the entry is left for the `engineering-insights` skill to annotate |

### Deviations from the mockups, on purpose

- Mockup 3 shows `[]` as the Expected output of a negative case. Here a
  negative case shows its forbidden location as a one-element array (Q-1).
  The scorer needs a file and a line range for `must_not_flag`
  (SPEC-08 AC-28), and researcher R2 found `[]` ("the agent must produce zero
  findings") only in the old full-build reference, not in our scorer.
- Mockups 2 and 3 print the cost as `$0.00`; an unknown cost is shown as "—"
  (SPEC-08 EC-21).
- Mockup 4's "TRACES PASSED 1/1" beside "5/6 passing" is the symptom named in
  the problem statement, not a target.
- Mockups 1 to 3 title the modal "New eval case" for a seeded case; a stored
  case keeps its title "Eval case · {name}" (`caseModal.title`).

### Gap against the mockups

| Mockup element | Exists today? | Gap |
|---|---|---|
| Header title and subtitle "Seeded from an accepted finding · assert the expected output" | Title yes (`EditorModal.tsx:142-150`); no subtitle | AC-4 |
| Two-column layout | No — one column | AC-14, AC-23, AC-24 |
| POSITIVE / NEGATIVE banner with `MUST find "<title>" at <file>:<line>` | No | AC-16 |
| **Name** * | Yes | Seeded name (AC-4) |
| Input tabs Diff / Files / PR meta | No — fields stacked | AC-17 |
| Expected output JSON, "valid JSON", **+ Finding skeleton** | No — separate fields | AC-19 to AC-21 |
| Actual output, "Never run yet" | No | AC-22, AC-26 |
| Result banner "Last run failed / passed · n/m passed · duration · cost" | No | AC-43 |
| Footer **Run on save**, **Cancel**, **Run case**, **Save** | **Cancel**, **Save**, **Delete** | AC-33, AC-45 |
| Owner choice (agent or skill) | Only the separate PR-page menu | AC-5 |
| KPI row, caption "Scoring is mechanical…", **View full dashboard →** | KPI cards and link yes; caption no | AC-27 |
| "Eval cases · 5/6 passing · 6 cases", **Run all evals**, primary **New eval case** | Count and order differ | AC-28 |
| Row: status icon, name, MUST FIND / MUST NOT FLAG badge, "expected N finding, got M · recall X%", severity · category, **Run**, **Edit**, trash | Row has no badge beside the name, no recall, no **Run**, icon-only **Edit** | AC-29, AC-30, AC-39 |
| Skill tab "should match" | List and lift line; no KPI cards | AC-31, AC-32 |

### Delivery phases

One spec, two phases, each green on its own (tests, typecheck, lint, arch,
`pnpm verify:l06`).

| Phase | Delivers | IDs |
|---|---|---|
| A — modal and tabs | PR button opens the seeded modal with the owner picker; `GET /findings/:id/eval-case-draft`; optional input on both finding routes; two-column Case Editor with Expected / Actual panes (Actual from the latest finished set run) and an empty banner slot; layout fix; both Evals tabs restyled; `SkillEvalMenu` removed. One commit of contracts in both vendor copies: `EvalCaseDraft`, `EvalExpectationInput.title`, `EvalCaseLatestResult.findings` and `.effect`, `input?` on `SkillEvalCaseRequest` | AC-1–AC-32; EC-1–EC-13, EC-29; NFR-1, NFR-4, NFR-7–NFR-11, NFR-13 (draft route), NFR-14–NFR-16, NFR-20; UI-1–UI-4, UI-6–UI-8, UI-11 |
| B — case run | migration `0025_*` with `eval_runs.scope`; `POST /eval-cases/:id/run` on the set executor; footer toggle, **Run case**, **Run on save**, per-row **Run**; result banner; per-case latest result across run kinds; set-only aggregates and running-run readers; `running_case_run`; the carrier dialog moved to `components/`. One commit of contracts in both vendor copies: `EvalRunScope`, `scope` on `EvalRunRecord`, `EvalAgentRunDetail`, `EvalSkillRunRecord` and `EvalSkillRunDetail`, `running_case_run` on `EvalOverview` and `EvalSkillOverview` | AC-33–AC-51; EC-14–EC-28, EC-30, EC-31; NFR-2, NFR-3, NFR-5, NFR-6, NFR-12, NFR-13 (run route), NFR-17–NFR-19; UI-5, UI-9, UI-10 |

### Removal checklist (Phase A, from researcher R3)

- Delete the folder `FindingCard/_components/SkillEvalMenu/` (component, styles,
  index, test). In `FindingCard.tsx` remove the import, the `skillEval` prop,
  the render and the header comment; in `FindingsPanel.tsx` remove the
  `skillEval` prop.
- In `FindingCard/constants.ts` remove `SKILL_REJECTION_KEY` and
  `skillEvalsTabHref`; in `FindingCard/helpers.ts` remove `skillMenuState`
  and `SkillMenuState`. Keep `EVAL_REJECTION_KEY`, `evalsTabHref`,
  `evalButtonState` and the `prReview` `evalCase.errors.*` keys: the control
  that opens the modal still uses them. The immediate-create path and the
  `creating` and `rejection` props of the control move into the modal's save.
- In `client/messages/en/prReview.json` remove the `skillEval.*` block; in
  `client/src/test/i18n-key-coverage.test.ts` remove the `SkillEvalMenu` root
  and add the new roots (NFR-20).
- Keep the `vi.mock` of `lib/hooks/skill-eval` in `FindingsPanel.test.tsx`
  (`client/INSIGHTS.md` 2026-10-11): the card still calls `useFindingSkills`
  (AC-11), so the mock is retargeted to that hook and not dropped.
- `useFindingSkills` and `useCreateSkillCaseFromFinding`
  (`client/src/lib/hooks/skill-eval.ts`) stay: the card state (AC-11) and the
  owner picker (AC-5) use them; the invalidation of `evalKeys.findingSkills*`
  (`client/src/lib/hooks/eval.ts`) stays.

**Non-goals**
- Not doing a `[]` Expected output as "the agent must produce no finding at
  all" — considered and rejected because it needs a new scoring branch, an
  optional `file` in `EvalExpectation` and a reversal of SPEC-08 AC-28 and
  SPEC-09 Q-8 (Q-1).
- Not doing several expectations per case (a JSON array of N) — considered and
  rejected because recall's denominator and the per-case pass rule are defined
  for one expectation (SPEC-08 AC-27 to AC-30).
- Not doing a dry-run of an unsaved or modified draft — considered and
  rejected because its result would vanish on reload and it needs a second
  run path with its own single-flight and reaper. **Run case** is disabled for
  such a draft and **Run on save** is the one-click path (Q-2).
- Not doing a case run without persistence (ephemeral, synchronous) —
  considered and rejected because row icons and the banner would lose the
  result on reload and no single-flight or boot reaper would cover it.
- Not doing a separate table for case runs (`eval_case_runs`) — considered and
  rejected for now: it duplicates the reaper, the polling route and the
  snapshot, while the filters of NFR-5 are a bounded list (researcher R1). It
  is the fallback if the plan finds that list too risky.
- Not doing a `scope` marker without a migration (a run of one case told apart
  only by `case_set` length) — considered and rejected because a one-case set
  run is a legitimate set run.
- Not doing a cost confirmation before **Run case** or per-row **Run** — a
  case run costs one review (two for a skill case), and **Run all evals** has
  none either.
- Not doing cancellation of a running case run — an LLM call cannot be
  cancelled (`server/INSIGHTS.md`, 2026-09-30).
- Not doing a run history table, a run-detail modal or **Compare** for case
  runs.
- Not creating cases for the agent and several skills in one **Save** — the
  owner picker is single-select; the modal can be opened again for the next
  owner.
- Not editing `client/src/vendor/ui/kit/Modal.tsx`; the layout fix lives in
  the Case Editor.
- Not changing the scorer, the matching rule, the freezing rules or the
  carrier and arm construction of SPEC-08 and SPEC-09.

## User stories

- **US-1** As an agent or skill author triaging a finding, I want **Turn into eval case** to open a seeded editor where I choose the owner and adjust the case before saving, so that the case is the one I mean.
- **US-2** As an agent or skill author, I want a two-column editor with the input on the left and the Expected and Actual output on the right, with a layout that never overlaps or double-scrolls, so that I can assert and read results in one place.
- **US-3** As an agent or skill author, I want to run one case, from the editor or from its row, and see its result, so that I can check a change without paying for the whole set.
- **US-4** As an agent or skill author, I want the Evals tab to show the KPI row and one row per case with its status, badge, result, **Run**, **Edit** and delete, so that I read the state of my set at a glance.
- **US-5** As an agent or skill author, I want a case run to leave my KPI cards, trend, history and Compare untouched and never collide with **Run all evals**, so that the set's numbers stay trustworthy.

## Acceptance criteria (EARS)

### Finding → modal
- **AC-1** (US-1) КОЛИ the user clicks **Turn into eval case** on an accepted or dismissed finding, the system (shall) open the Case Editor seeded from `GET /findings/:id/eval-case-draft` and create no case.
- **AC-2** (US-1) КОЛИ the client requests `GET /findings/:id/eval-case-draft` for a decided finding whose file has a patch intersecting the finding's line range, the system (shall) return the seed — a name, the expectation `{type, file, start_line, end_line, severity, category, title}` copied from the finding with `type` `must_find` when the finding is accepted and `must_not_flag` when it is dismissed, the frozen diff of the finding's file, and the PR title and body — built by the freezing rules of SPEC-08 AC-4 and AC-5.
- **AC-3** (US-1) КОЛИ the client requests `GET /findings/:id/eval-case-draft`, the system (shall) include `owners`: one entry `{kind, id, name, has_case, case_id}` for the finding's agent when that agent exists in the workspace, then one entry per skill recorded in `agent_run_skills` for the run of the finding's review, in that run's order.
- **AC-4** (US-1) КОЛИ the seeded modal opens, the system (shall) prefill **Name** with "From finding: {title}" cut to 80 characters and show the subtitle "Seeded from an accepted finding · assert the expected output", with "dismissed" in place of "accepted" for a dismissed finding.
- **AC-5** (US-1) КОЛИ the seeded modal opens, the system (shall) show an owner picker listing each owner of AC-3 by name and kind, preselect the first owner without a case, and render an owner whose `has_case` is true as disabled with an **In eval set** link to that owner's Evals tab.
- **AC-6** (US-1) КОЛИ the user clicks **Save** in the seeded modal, the system (shall) send the draft as an `EvalCaseInput` to the chosen owner's finding route — `POST /findings/:id/eval-case` for the agent, `POST /findings/:id/skill-eval-case` for a skill — and respond `201` with the case, or `200` with the existing case when the skill route finds one already made from the finding, the case carrying `owner_kind` and `owner_id` of the choice and `source_finding_id` of the finding.
- **AC-7** (US-1) КОЛИ either finding route receives an `EvalCaseInput`, the system (shall) freeze and validate it by the rules of SPEC-09 AC-10, AC-46 and EC-1 to EC-5 and store `input_meta.pr_number` and `repo_full_name` of the finding's PR.
- **AC-8** (US-1) КОЛИ either finding route receives no body, the system (shall) behave as SPEC-08 AC-2 to AC-7 and SPEC-09 AC-50 define.
- **AC-9** (US-1) КОЛИ a save of the seeded modal succeeds, the system (shall) close the modal, unless **Run on save** is on (AC-45), and refresh the finding card's eval state without a page reload.
- **AC-10** (US-1) The system (shall) show in the action row of a finding card exactly one eval-case control, **Turn into eval case**, and no **Turn into skill eval case** menu.
- **AC-11** (US-1) КОЛИ the finding's agent and every skill recorded for its review already have a case made from the finding, the system (shall) show **In eval set**, linking to the Evals tab of the first owner, in place of **Turn into eval case**.
- **AC-12** (US-1) ПОКИ a modal holds a seeded draft that has not been saved, the system (shall) keep the **Diff**, **PR meta**, type and **Expected output** editable.
- **AC-13** (US-1) КОЛИ the user opens a case that has a `source_finding_id`, the system (shall) show its diff, file, lines, type, PR title, description, severity, category and **Expected output** read-only with **Name** and notes editable, as SPEC-09 EC-7 defines.

### Case Editor — layout and content
- **AC-14** (US-2) КОЛИ the Case Editor opens for a new, seeded or stored case, the system (shall) show a header with the title, the subtitle and a close button, a left and a right column, and a footer with **Cancel**, **Save** and, for a stored case, **Delete**.
- **AC-15** (US-2) КОЛИ the Case Editor opens, the system (shall) show in the left column, top to bottom, the type banner, **Name** (required) and the **Input** block with the tabs **Diff**, **Files** and **PR meta**.
- **AC-16** (US-2) The system (shall) show the banner "POSITIVE CASE" in blue with `MUST find "{title}" at {file}:{start_line}` when the type is `must_find`, and "NEGATIVE CASE" in amber with `MUST NOT flag` and the same location when the type is `must_not_flag`, the banner following the type at once.
- **AC-17** (US-2) КОЛИ the user selects a tab of **Input**, the system (shall) show for **Diff** the diff text area, for **Files** the list of new-side paths found in the diff with the expectation's file marked, and for **PR meta** the PR title and description fields.
- **AC-18** (US-2) ПОКИ the case input is editable, the system (shall) show a type switch with the choices **Must find** and **Must not flag**, defaulting to the seeded type.
- **AC-19** (US-2) The system (shall) show in the right column the heading **Expected output** with a JSON text area, an indicator "valid JSON" or "invalid JSON: {reason}" as text and an icon, and the button **+ Finding skeleton**.
- **AC-20** (US-2) The system (shall) treat **Expected output** as a JSON array of exactly one object with the keys `file`, `start_line`, `end_line`, `severity`, `category` and `title`, take the expectation's `type` from the type switch and not from the JSON, and show "valid JSON" only for an array that passes the `EvalExpectationInput` rules.
- **AC-21** (US-2) КОЛИ the user clicks **+ Finding skeleton**, the system (shall) replace the **Expected output** text with one object whose `file` is the first new-side path of the diff (empty when there is none), `start_line` and `end_line` are `1`, and `severity`, `category` and `title` are `null`.
- **AC-22** (US-2) The system (shall) show under **Actual output** the placeholder "Never run yet" while the case has no finished run, and otherwise the grounded kept findings of the case's latest result (AC-46) as a read-only JSON array of `{file, start_line, end_line, severity, category, title, label}` objects.
- **AC-23** (US-2) The system (shall) keep the modal header, the result banner and the footer fixed while the modal is open, with none of them overlapping the content of either column.
- **AC-24** (US-2) The system (shall) show no scrollbar on the modal body or on either column, and let each text pane (**Diff**, **Expected output**, **Actual output**) scroll inside itself while it fills its share of its column's height.
- **AC-25** (US-2) КОЛИ the user clicks **Save** on a new or manual case, the system (shall) send the single parsed **Expected output** object with the `type` of the type switch as the case's expectation through the routes of SPEC-09 AC-9, AC-14, AC-15 and AC-45.
- **AC-26** (US-2) КОЛИ the client requests `GET /eval-cases/:id`, the system (shall) return in `latest_result` the `findings` of the case's latest result (AC-46), declared `.nullish()` in the contract because the stored `EvalCaseOutcome.findings` is required (`knowledge.ts:384`) but a fixture or an older document can lack it.

### Evals tabs
- **AC-27** (US-4) КОЛИ the agent Evals tab loads, the system (shall) show the label "EVAL METRICS" with **View full dashboard →** at its right, the four KPI cards **RECALL**, **PRECISION**, **CITATION ACCURACY** and **TRACES PASSED** of the latest finished set run, and under the row the caption "Scoring is mechanical — a finding counts when file matches and line ranges overlap. No model call in the scorer."
- **AC-28** (US-4) КОЛИ either Evals tab loads, the system (shall) show the heading **Eval cases** followed by a pill "{passed}/{scored} passing" and the text "{n} cases", and at the right **Run all evals** as a secondary button followed by **New eval case** as the primary button.
- **AC-29** (US-4) КОЛИ either Evals tab lists a case, the system (shall) show a row with a status icon that carries an accessible name, the case name, a **MUST FIND** or **MUST NOT FLAG** badge beside the name, the result line, at the right the `SEVERITY · category` tag for a `must_find` case, an **Edit** button with an icon and the text "Edit", and a delete icon button, with the **Run** button of AC-39 between the tag and **Edit** from Phase B on.
- **AC-30** (US-4) КОЛИ a case has a scored result, the system (shall) show the result line "expected {n} finding(s), got {m}" with ICU plural forms, followed for a `must_find` case by " · recall {x}%", where x is `100` for a passed case and `0` for a failed one, and with no recall text for a `must_not_flag` case.
- **AC-31** (US-4) КОЛИ the skill Evals tab loads, the system (shall) show the "EVAL METRICS" label, the caption of AC-27 and the four KPI cards of the with-skill arm of the skill's latest finished set run, followed by the lift line of SPEC-09 AC-35 and the **Metric trend** chart of SPEC-09 AC-36.
- **AC-32** (US-4) КОЛИ the skill Evals tab lists a case, the system (shall) show the row of AC-29 and AC-30 computed from the with-skill arm, with the effect label of SPEC-09 AC-4 after the result line.

### Case run
- **AC-33** (US-3) The system (shall) show in the Case Editor footer, left to right, the toggle **Run on save** (off on every open), **Cancel**, **Run case** with a play icon and the primary **Save**.
- **AC-34** (US-3) ПОКИ the Case Editor shows a stored case with no unsaved change and no run of its owner in progress, the system (shall) enable **Run case**, and otherwise render it disabled with the hint "Save the case to run it" for a new or seeded draft, "Save your changes to run it" for a modified case, or "A run is in progress" while a run executes.
- **AC-35** (US-3) КОЛИ the client posts `POST /eval-cases/:id/run`, the system (shall) respond `202` with `{id, status: "running"}` before any review starts, taking `carrier_agent_id` from the body for a skill-owned case and no body for an agent-owned case.
- **AC-36** (US-3) КОЛИ a case run starts, the system (shall) store an `eval_runs` row with `scope: "case"`, a `case_set` holding only that case and the snapshot of SPEC-08 AC-20 for an agent-owned case or of SPEC-09 AC-23 to AC-25 for a skill-owned case.
- **AC-37** (US-3) ПОКИ a case run executes, the system (shall) review the case on its frozen input exactly as a set run does (SPEC-08 AC-22), once for an agent-owned case and once per arm for a skill-owned case, and score it by SPEC-08 AC-27 to AC-29.
- **AC-38** (US-3) КОЛИ the review of a case run ends, the system (shall) finish the run with `status: "completed"` when the case was scored and `status: "errored"` with the error reason when it errored, and store its duration and cost.
- **AC-39** (US-3) КОЛИ either Evals tab (agent or skill) lists a case, the system (shall) show in its row, between the severity tag and **Edit**, a **Run** button with a play icon that starts a case run when clicked, by `POST /eval-cases/:id/run` for an agent-owned case (AC-35) and through the carrier dialog for a skill-owned case (AC-40).
- **AC-40** (US-3) КОЛИ the user clicks **Run case** or a row **Run** for a skill-owned case, the system (shall) open the carrier dialog of SPEC-09 AC-20 and call `POST /eval-cases/:id/run` with the confirmed `carrier_agent_id`.
- **AC-41** (US-3) ПОКИ a case run has `status: "running"`, the system (shall) show "Running…" on its row and in the modal banner, and poll `GET /eval-runs/:id` until the run leaves `running`.
- **AC-42** (US-3) КОЛИ a polled case run leaves `status: "running"`, the system (shall) stop polling, refresh the case list, the modal's banner and Actual output, the overview and the dashboard, and announce the final status in an `aria-live="polite"` region.
- **AC-43** (US-3) КОЛИ the Case Editor shows a case with a run result, the system (shall) show in the footer slot above the buttons a banner "Last run passed" in green or "Last run failed" in red or "Last run errored: {reason}" in red, followed by "{passed}/{total} passed · {duration} · {cost}", where the count is `1/1` for a passed case and `0/1` for a failed one, derived on the client from the result's `state` with no new field, and is omitted for an errored case, and the cost is "—" when it is `null`.
- **AC-44** (US-3) КОЛИ the Case Editor shows a skill-owned case with a run result, the system (shall) add the effect label of SPEC-09 AC-4 to the result banner and take the passed state and the Actual output from the with-skill arm.
- **AC-45** (US-3) КОЛИ the user clicks **Save** with **Run on save** on for an agent-owned case and the save succeeds, the system (shall) start a case run of the saved case, keep the modal open on the saved case and show the running banner.
- **AC-51** (US-3) КОЛИ the user clicks **Save** with **Run on save** on for a skill-owned case and the save succeeds, the system (shall) keep the modal open on the saved case and open the carrier dialog of AC-40, and start the case run on confirmation.
- **AC-46** (US-5) The system (shall) return, in `GET /agents/:id/eval-cases`, `GET /skills/:id/eval-cases` and `GET /eval-cases/:id`, each case's `latest_result` from the later-started of two runs: the newest finished (`completed` or `partial`) `scope: "set"` run that contains the case, and the newest `scope: "case"` run of that case with status `completed`, `partial` or `errored`.
- **AC-47** (US-5) The system (shall) compute from `scope: "set"` runs only every field of `GET /agents/:id/eval-overview`, `GET /skills/:id/eval-overview` and `GET /eval-dashboard` that describes runs (`latest`, `previous`, `trend`, `runs`, `finished_runs`, `sparkline`, `recent_runs`).
- **AC-48** (US-5) The system (shall) return in both overview responses `running_run_id` for a running set run only and `running_case_run: {run_id, case_id}`, or `null`, for a running case run.
- **AC-49** (US-5) ПОКИ any run of the owner has `status: "running"`, the system (shall) disable **Run all evals**, every row **Run**, **Run case** and the carrier dialog's confirm button on both Evals tabs and in the Case Editor.
- **AC-50** (US-5) КОЛИ the client requests `GET /eval-runs/:id` for a case run, the system (shall) return the run with `scope: "case"`, its snapshot, case set, per-case result, `cases_done` and `cases_total`.

## Edge cases

- **EC-1** ЯКЩО the finding has neither `accepted_at` nor `dismissed_at`, ТОДІ the system (shall) render **Turn into eval case** disabled with the tooltip "Accept or dismiss this finding first" and the draft route rejects the request with `422` `finding_undecided`.
- **EC-2** ЯКЩО the finding's file is absent from the PR's current diff or its line range intersects no hunk, ТОДІ the system (shall) answer the draft route with `422` `no_patch` or `422` `range_outside_diff`, keep the modal closed and show the messages of SPEC-08 EC-4 and EC-5 next to the control.
- **EC-3** ЯКЩО the finding's agent no longer exists in the workspace and the review recorded no skill, ТОДІ the system (shall) render **Turn into eval case** disabled with the tooltip "The agent that produced this finding was deleted" and the draft route rejects the request with `422` `agent_missing`.
- **EC-4** ЯКЩО the finding's agent no longer exists in the workspace and the review recorded one or more skills, ТОДІ the system (shall) list only those skills in the owner picker.
- **EC-5** ЯКЩО the chosen owner already has a case made from the finding (second tab, earlier session), ТОДІ the system (shall) create no second case, keep the modal open with every input unchanged and show "This owner already has a case from this finding" with a link to that case's Evals tab, treating the agent route's `409` `eval_case_exists` and the skill route's `200` with the existing case (`server/src/modules/eval/routes.ts:77-95`) alike.
- **EC-6** ЯКЩО the **Expected output** text does not parse as JSON, is not an array of exactly one object, has a key outside the six of AC-20 or fails the `EvalExpectationInput` rules (`file` 1 to 500 characters, whole numbers `start_line` of at least 1 and `end_line` of at least `start_line`, `severity` a `Severity` or `null`, `category` a `FindingCategory` or `null`, `title` at most 200 characters or `null`), ТОДІ the system (shall) show "invalid JSON: {reason}" and disable **Save** and **Run on save**.
- **EC-7** ЯКЩО the **Expected output** text is larger than 10,000 UTF-8 bytes, ТОДІ the system (shall) disable **Save** with the message "Expected output is larger than 10 KB", this cap being a client-side check only.
- **EC-8** ЯКЩО the user changes only the whitespace or key order of **Expected output**, ТОДІ the system (shall) treat the case as unmodified.
- **EC-9** ЯКЩО the expectation's line range, after an edit of the diff or of **Expected output**, intersects no hunk's new-side lines of its file, ТОДІ the system (shall) reject the save with `422` `range_outside_diff` and keep the modal open with every input unchanged, showing the message of SPEC-09 EC-3.
- **EC-10** ЯКЩО the user closes the Case Editor with unsaved changes, ТОДІ the system (shall) ask "Discard changes to this case?" and keep the editor open unless the user confirms, as SPEC-09 EC-8 defines.
- **EC-11** ЯКЩО the viewport is narrower than 768 px, ТОДІ the system (shall) stack the two columns and let the modal body scroll as its single scroll region.
- **EC-12** ЯКЩО a case name, file path, owner name or error reason does not fit its row, banner or picker line, ТОДІ the system (shall) truncate it with an ellipsis and expose the full text in a `title` attribute and to screen readers.
- **EC-13** ЯКЩО the `latest_result` of a case has no `findings` (a fixture or an older document), ТОДІ the system (shall) show "Never run yet" under **Actual output** while the row and the banner keep the stored state.
- **EC-14** ЯКЩО an owner has case runs and no finished set run, ТОДІ the system (shall) show "—" in every KPI card, "No runs yet" in place of the trend chart and the stored result on each case row.
- **EC-15** ЯКЩО the user closes the Case Editor while its case run executes, ТОДІ the system (shall) let the run finish, show its result on the case's row and show the running banner when the case is opened again.
- **EC-16** ЯКЩО a save with **Run on save** on is rejected (`422`, network error or `5xx`), ТОДІ the system (shall) start no run, keep the modal open with every input unchanged and leave the toggle on.
- **EC-17** ЯКЩО the save with **Run on save** on replaced the case (SPEC-09 AC-15), ТОДІ the system (shall) start the run on the new case id from `replaced_from_id`'s response and show "Never run yet" and no banner until it finishes.
- **EC-18** ЯКЩО `POST /eval-cases/:id/run` or a set-run start arrives while any run of the same owner has `status: "running"`, ТОДІ the system (shall) start nothing and respond `409` `eval_run_in_progress` with the running run's id under `details.run_id`.
- **EC-19** ЯКЩО no agent is linked to the skill that owns the case or the carrier is not linked to it, ТОДІ the system (shall) render **Run case**, the row **Run** and the **Run on save** toggle disabled with the hint "Link this skill to an agent first" and the server rejects the start with `422` `no_agent_linked`.
- **EC-20** ЯКЩО the skill is disabled, its link to the chosen carrier is disabled or the skill has `injection_flagged` set, ТОДІ the system (shall) show in the carrier dialog the warnings of SPEC-09 EC-46 and EC-31 and still allow the run.
- **EC-21** ЯКЩО the review of the case fails (provider error, missing API key, structured-output failure after retries, a frozen diff that parses to zero files), ТОДІ the system (shall) store the case as `errored` with the reason, show the red errored banner and the `errored` row state after a reload as well, and count it in no metric; an errored case run is not a finished run (`FINISHED` is `completed` or `partial`, `server/src/modules/eval/service.ts:85`) but is the case's latest result (AC-46).
- **EC-22** ЯКЩО the API process restarts while a case run has `status: "running"`, ТОДІ the system (shall) set that run's `status` to `errored` with the reason `interrupted` on the next boot.
- **EC-23** ЯКЩО the client has polled a case run for 3 minutes (6 minutes for a skill-owned case) and it is still `running`, ТОДІ the system (shall) stop polling and show "The eval run is still in progress — reload to check its status".
- **EC-24** ЯКЩО a polling request fails, ТОДІ the system (shall) stop polling, rely on the global error toast without adding a second one and show a **Retry** action that resumes polling.
- **EC-25** ЯКЩО the model of a case run is missing from the price table, ТОДІ the system (shall) store the run's cost as `null` and show "—" in the banner, never "$0.00".
- **EC-26** ЯКЩО the case is edited, replaced or deleted while its run executes, ТОДІ the system (shall) finish the run from the input read at its start and attach the result to the case id recorded at the start, as SPEC-09 EC-10 defines.
- **EC-27** ЯКЩО the owner is deleted while its case run executes, ТОДІ the system (shall) write no result, log no error and, for a skill-owned case whose first arm has finished, make no LLM call for the second arm; an agent-owned case has a single review, which is not interrupted.
- **EC-28** ЯКЩО the client requests `GET /eval-runs/compare` with the id of a case run, ТОДІ the system (shall) respond `404`.
- **EC-29** ЯКЩО a finding, case, skill, agent, carrier or run id belongs to another workspace, ТОДІ the system (shall) respond `404` as if it did not exist, on the draft route and the run route included.
- **EC-30** ЯКЩО the agent that owns the case is disabled, ТОДІ the system (shall) still allow **Run case**, a row **Run** and **Run on save** for it.
- **EC-31** ЯКЩО the user cancels the carrier dialog opened by **Run on save** (AC-51), ТОДІ the system (shall) keep the saved case and start no run, with EC-19 and EC-20 applying to the dialog as they do to **Run case**.

## Non-functional requirements

- **NFR-1** The system (shall) make zero LLM calls on `GET /findings/:id/eval-case-draft`, on every read route of SPEC-08 and SPEC-09, and on the creation, edit and replacement of a case, verified by tests that assert a mock provider received no call.
- **NFR-2** The system (shall) invoke `reviewPullRequest` exactly once for an agent-owned case run and exactly twice for a skill-owned case run, with at most 2 structured-output re-prompts per invocation (SPEC-08 NFR-2).
- **NFR-3** The system (shall) never write rows to `reviews`, `findings`, `agent_runs`, `agent_run_skills` or `run_traces` during a case run, and never change `pull_requests.last_reviewed_sha`.
- **NFR-4** The system (shall) scope every query and mutation of this spec — the draft read, case creation, case runs and every overview read — to the caller's `workspace_id` obtained through `getContext()`.
- **NFR-5** The system (shall) apply `scope = 'set'` centrally in the run predicates `agentRuns()` and `skillRuns()` (`server/src/modules/eval/repository.ts:1012-1030`, behind `latestFinishedRunRow`, `listRunSummaries`, `countFinishedRuns`, `listSkillRunSummaries`, `listSkillTrendRows` and `latestFinishedSkillResults`), in the readers that bypass them (`recentRunSummaries`, the dashboard) and in set-only variants of `runningRunId` and `runningSkillRunId` that feed `running_run_id`, and answer `404` from `compare` for a case run, while `getRun`, `getRunRow`, `deleteByAgent`, `deleteBySkill`, the boot reaper, `saveProgress`, `finalizeRun`, `isRunning` and the any-scope running-run lookup behind the `409` of `insertRun` (`repository.ts:583`) stay unfiltered.
- **NFR-17** The system (shall) read each case's latest result (AC-46) in `listCases`, `getCase` and `listSkillCases` (`server/src/modules/eval/service.ts:232-248`, `280-292`, `316-330`) through one new any-scope reader that merges the newest finished set run's outcome for the case with the newer case runs of that case, touching at most one set run's `case_results` and the case runs of that case and never scanning every run's jsonb.
- **NFR-18** The system (shall) ship `server/test/eval-case-run.it.test.ts`, listed in the `verify:l06` script (`server/package.json:17`), which runs a set run, snapshots the output of every repository reader and route named in NFR-5, finishes a case run, snapshots again and asserts that every set-only snapshot is equal and that the per-case readers changed only for the run's case.
- **NFR-6** The system (shall) add `eval_runs.scope` only through one generated Drizzle migration (`pnpm db:generate`) as a text column that is not null with the default `'set'`, without editing an applied migration, so that every earlier run reads as `'set'`.
- **NFR-7** The system (shall) keep every changed or new eval contract identical in field names and value types in `server/src/vendor/shared/` and `client/src/vendor/shared/`, changed in one commit per phase, with every new type name starting with `Eval` and placed inside the compared regions of `server/test/eval-contract-parity.test.ts` (`// ---- Eval ----` to `// ---- Memory ----` in `knowledge.ts`; the "Eval — runs, overview, dashboard, compare (SPEC-08)" banner to the "Compose Review" banner in `eval-ci.ts`), with no `.default()` inside them, with the fields added to persisted jsonb shapes declared `.nullish()` and with that test passing.
- **NFR-8** The system (shall) keep `pnpm verify:l06` green and add to its file list the hermetic tests of the draft seed, the Expected output parser, the row result text and the per-case latest-result merge (a fixture with a `latest_result` that lacks `findings` included), plus a DB-backed test that skips itself without Docker and asserts the draft route, the optional input of both finding routes, the case-run route, the `409` guard and workspace scoping.
- **NFR-9** The system (shall) serve every user-visible string of this feature through next-intl keys in `client/messages/en/eval.json` or, for the finding-card control, `client/messages/en/prReview.json`, with no hard-coded copy and no server-composed display text.
- **NFR-10** The system (shall) meet WCAG 2.1 AA on the Case Editor and both Evals tabs: every control keyboard-operable with visible focus, text contrast of at least 4.5:1, every status, the JSON validity and the result banner conveyed by an icon and text and not by colour alone, the banner in a `role="status"` region, the **Input** tabs as a `tablist`, **Run on save** as a `switch`, and targets of at least 24×24 px.
- **NFR-11** The system (shall) lay out the Case Editor with `min-height: 0` and `overflow: hidden` on its body and both columns and with each text pane scrolling inside itself, verified by a unit test that asserts those styles and by a manual browser check at 1280×720 and at 768×600 (no scrollbar on the modal body, no overlap of footer, banner and columns) recorded in the PR description; no e2e flow covers it because a flow cannot trigger a model call.
- **NFR-12** The system (shall) log each case run start and finish with the run id, owner kind and id, case id, `scope`, status and duration, and never log a diff, PR text, prompt, Expected output or finding text.
- **NFR-13** The system (shall) answer `GET /findings/:id/eval-case-draft` within 1 s for a diff of up to 204,800 bytes and `POST /eval-cases/:id/run` within 500 ms, on a local database.
- **NFR-14** The system (shall) use only placeholder secrets such as `sk_live_xxx` and `ghp_xxx` in every fixture, seed and test of this feature.
- **NFR-15** The system (shall) keep every SPEC-08 and SPEC-09 behaviour not overridden in Goals unchanged, verified by the existing eval tests passing without edits to their assertions, except those on the overridden behaviour: the immediate-create button, the skill menu, the row layout and the **In eval set** rule.
- **NFR-16** The system (shall) contain no `SkillEvalMenu`, no `skillEval` prop, no `skillMenuState`, no `SKILL_REJECTION_KEY` and no `prReview` `skillEval.*` key once Phase A ships, verified by a search of `client/src` and `client/messages` and by `FindingsPanel.test.tsx` passing with its `lib/hooks/skill-eval` mock retargeted to `useFindingSkills`.
- **NFR-19** The system (shall) host the carrier dialog and its helpers in `client/src/components/carrier-run-dialog/`, moved unchanged from `client/src/app/skills/_components/SkillEditor/_components/RunDialog/`, imported by the skill Evals tab and by the Case Editor, with `pnpm arch` and the existing skill Evals tab tests passing and no behaviour change.
- **NFR-20** The system (shall) keep `client/src/test/i18n-key-coverage.test.ts` passing with the `SkillEvalMenu` root and the old `RunDialog` root removed, roots added for the finding-card control, the Case Editor additions and the carrier dialog, and its thresholds (`files.length > 20`, `uses.length > 80`, lines 80 and 81) re-checked against the new root set.

## Inputs and provenance

| Value | Source | Trusted? | Design source |
|---|---|---|---|
| Finding file, lines, kind, severity, category, title | `findings` (model output that passed the grounding gate) | partly — location proven, text not | mockups 1–3; SPEC-08 Inputs |
| Decision → type (`must_find` / `must_not_flag`) | `findings.accepted_at` / `.dismissed_at` | yes | mockups 1, 3; SPEC-08 AC-2, AC-3 |
| Seed frozen diff, PR title, PR body | PR diff at open time (`freezeFileDiff`, `server/src/modules/eval/frozen-input.ts`) | no — PR author content | mockup 1 "Diff", "PR meta" |
| Seeded name | "From finding: " + finding title, cut to 80 characters | no (title) | mockups 1–3 "Name" |
| Owners of a finding | `reviews.agent_id` → `agents`; `reviews.run_id` → `agent_run_skills` (`GET /findings/:id/eval-skills`) | yes | brief; SPEC-09 AC-53; researcher R3 |
| Edited diff, PR title, description, type | Case Editor (user input) | no | mockups 1–3 |
| Expected output JSON | Case Editor (user input) | no (validated) | mockups 1–3 |
| Case run snapshot, carrier, arms | `agents` row and skill links at run start | yes (partly skill text) | SPEC-08 AC-20; SPEC-09 AC-23 to AC-25 |
| Kept findings of a case run, grounding counts, cost, duration | `reviewPullRequest(...)` output | no (model text); computed counts | mockups 2, 3 banner; SPEC-08 AC-23 |
| `latest_result` per case | newest finished set run containing the case, or the newest completed, partial or errored case run of it, whichever started later | yes | mockup 4 list vs KPI; researcher R1; `helpers.ts:475-478` |
| `eval_runs.scope` | server on run start (`'set'` or `'case'`) | yes | researcher R1; mockup 4 |
| `running_run_id`, `running_case_run` | `eval_runs` rows with `status = 'running'` | yes | researcher R1 (`runningRunId`, `runningSkillRunId`) |
| Per-case recall text (100 or 0) | computed from the case's pass state | yes | mockup 4 "recall 100%" / "recall 0%" |
| Single-case run response shape | upstream `reference/full-build` `POST /eval-cases/:id/run` (response only) | yes | researcher R2 |
| Removal list of the skill menu | repo search | yes | researcher R3 |
| Mockup labels (banner, subtitle, toggle, skeleton) | the four mockups; no code has them | n/a — data | mockups 1–4; researcher R2 |

### Contracts (proposed names; both vendor copies)

```text
EvalCaseDraft                GET /findings/:id/eval-case-draft
  { name, expectation: EvalExpectation, input_diff, input_meta: EvalCaseMeta,
    owners: [{ kind: 'agent'|'skill', id, name, has_case: boolean, case_id: string|null }] }
POST /findings/:id/eval-case            body optional EvalCaseInput          -> 201 EvalCase | 409 eval_case_exists
POST /findings/:id/skill-eval-case      body { skill_id, input?: EvalCaseInput } -> 201 | 200 EvalCase
                                        (both parse the body by hand: an absent body is allowed — server/INSIGHTS.md 2026-09-20)
EvalExpectationInput         += title?: string(..200) | null
EvalCaseLatestResult         += findings?: EvalActualFinding[] | null,
                                effect?: EvalCaseEffect | null            // both nullish; no `ran_at`
                                (EvalCaseOutcome.findings is already required, knowledge.ts:384)
-- Phase A commit: EvalCaseDraft, EvalExpectationInput.title, EvalCaseLatestResult.findings/effect,
--                 SkillEvalCaseRequest.input?  (both vendor copies, one commit)

EvalRunScope                 'set' | 'case'
EvalRunRecord, EvalAgentRunDetail, EvalSkillRunRecord, EvalSkillRunDetail  += scope: EvalRunScope
EvalOverview, EvalSkillOverview  += running_case_run: { run_id, case_id } | null
                                    running_run_id = a running SET run only
POST /eval-cases/:id/run     body optional { carrier_agent_id } (required for a skill-owned case) -> 202 EvalRunStart
-- Phase B commit: EvalRunScope, scope on the four run shapes, running_case_run (both vendor copies, one commit)
-- Every new type starts with `Eval` and sits inside the parity-test regions (NFR-7); no `.default()`.
```

## Untrusted inputs

- **UI-1** Expected output text (user input) → client parser, request body, database: the system (shall) parse it with `JSON.parse`, copy only the six whitelisted keys into the expectation, reject any other key including `__proto__` and `constructor`, validate it again with the Zod contract on the server and store it as a bound parameter.
- **UI-2** Expected output size → client and server memory: the system (shall) reject text larger than 10,000 UTF-8 bytes on the client before parsing it and rely on the Zod field limits of `EvalExpectationInput` on the server, which receives an object and not the text.
- **UI-3** Actual output (kept findings, model output) → the read-only text area: the system (shall) render only findings that passed the engine's schema validation, grounding and secret redaction, as escaped plain text, with no HTML or Markdown interpretation.
- **UI-4** Seed diff, PR title, PR body and finding title (PR author and model content) → text areas, banner and subtitle: the system (shall) render them as escaped React text, never as HTML or Markdown.
- **UI-5** Edited diff, PR title and description → LLM prompt of a case run: the system (shall) pass them through the same prompt assembly as a live review, which wraps the diff, passes the title only through the task line and the description only as `prDescription`, and keeps `INJECTION_GUARD` in the system message.
- **UI-6** Finding title (model output) → seeded name: the system (shall) cut it to 80 characters after the prefix "From finding: ", store the accepted name as a bound parameter and render it as escaped text.
- **UI-7** Agent and skill names (a skill's text can be imported third-party content) → owner picker, banner, rows and carrier dialog: the system (shall) render them as escaped text, truncated with a `title` attribute.
- **UI-8** Path and body ids (`:id`, `skill_id`, `carrier_agent_id`) → database queries: the system (shall) validate them as UUIDs through the route schema (`422` on failure) and query only through Drizzle bound parameters scoped to the caller's workspace.
- **UI-9** Skill body (author-written or imported) → system prompt of the with-skill arm of a skill-owned case run: the system (shall) inject it exactly as a live review injects linked skills, with the injection warning of EC-20 shown before the run.
- **UI-10** Run error reason (provider and structured-output error text) → result banner, row and logs: the system (shall) render it as escaped text and keep it out of the logs of NFR-12.
- **UI-11** Mockup text and research reports → this spec and its tests: the system (shall) treat them as data, use only placeholder secrets and take from the upstream response shape only its field names.

## Open questions

All defaults below were approved by the user, together with the plan review's amendments, the migration `0025_*` and the edits of both vendor copies; the user can still revise any of them before the spec is approved.

- **Q-1** Expected output JSON: an array of exactly one `EvalExpectation` for both types (a negative case shows its forbidden location), instead of mockup 3's `[]` (whole-diff negative, new scoring branch) or an array of N expectations? — default: array of exactly one, scorer and SPEC-08 AC-28 unchanged — owner: user.
- **Q-2** Storage of a case run: an `eval_runs` row with `scope: 'case'`, **Run case** enabled only for a saved, unmodified case and **Run on save** as the one-click path, instead of a dry-run of the draft or a separate `eval_case_runs` table? — default: `scope` column, no dry-run; fall back to the separate table if the plan finds the filters of NFR-5 too risky — owner: user.
- **Q-3** Finding-made case input: editable in the modal until the first **Save**, locked afterwards (SPEC-09 EC-6, EC-7)? — default: yes — owner: user.
- **Q-4** Skill-owned **Run case**: both arms in a carrier chosen in the SPEC-09 carrier dialog, cost twice a single review? — default: yes — owner: user.
- **Q-5** `Supersedes:` stays `—` with the overridden SPEC-08 and SPEC-09 items listed in Goals, as SPEC-09 did? — default: yes — owner: user.
- **Q-6** Keep the KPI deltas (SPEC-08 AC-35), the KPI captions (AC-36) and the **Metric trend** chart that mockup 4 does not show, and give the skill tab KPI cards of the with-skill arm? — default: yes — owner: user.
- **Q-7** Scroll rule: no scrollbar on the modal body or a column, each text pane (one in the left column, two in the right) scrolling inside itself, instead of exactly one scroll region per column? — default: yes — owner: user.
- **Q-8** Seeded name "From finding: {title}" (at most 80 characters) in the modal, while a finding route without a body keeps the slug of SPEC-08 AC-6? — default: yes — owner: user.
- **Q-9** One running run per owner of any `scope` (`409` `eval_run_in_progress`), so a case run and **Run all evals** on the same owner never overlap? — default: yes — owner: user.
- **Q-10** Keep one spec in two phases, or split Phase B into its own spec? — default: one spec, split only if plan review finds Phase A cannot be verified alone — owner: user.
- **Q-11** Keep the server routes `GET /findings/:id/eval-skills` and `POST /findings/:id/skill-eval-case` for the owner picker and remove only the client `SkillEvalMenu`? — default: yes — owner: user.
- **Q-12** Polling timeout of a case run: 3 minutes for an agent-owned case and 6 for a skill-owned one (EC-23)? — default: 3 and 6 minutes — owner: user.
- **Q-13** **In eval set** on the finding card only when the agent and every skill of the review have a case (AC-11), the card reading the skills through the existing `GET /findings/:id/eval-skills` while it is expanded? — default: yes — owner: user.
- **Q-14** Contents of the **Files** tab: the list of new-side diff paths with the expectation's file marked (AC-17), as the mockups do not show it? — default: yes — owner: user.
