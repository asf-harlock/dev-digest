PHASE 1 (intake report only, write NOTHING yet). Feature: **Eval Pipeline for DevDigest** — L06 homework, branch `L06-homework` (clean, on top of main 13a8392). Reply to the user in Ukrainian (the user writes Ukrainian); spec prose follows the spec-authoring skill (EARS with КОЛИ/ПОКИ/ЯКЩО/ДЕ).

## Assignment (translated from the course brief, verbatim intent)
Build regression protection for the product's review agent. In the lab we used a ready eval module for the Claude Code harness (`evals/`); at home we build the same kind of system from scratch for the product itself: change the system prompt, model, or linked skill → run evals → see in numbers whether the agent broke or improved. Same methodology, different plane: cases live in Postgres next to the findings they're born from. The user's accept/dismiss decisions from L01–L05 ARE the dataset — no invented test scenarios.

User stories:
- Create an eval case from a real finding in one click: from an accepted finding → "must find X at file:line"; from a dismissed one → "must NOT comment on Y".
- See all cases of an agent's set.
- Run the agent on all cases.
- See run metrics: recall / precision / citation_accuracy.
- Open run history and compare two side by side — "old prompt vs new".

Suggested implementation:
1. Tables `eval_cases` and `eval_runs` — "schema and Zod contracts are given ready-made" (CHECK: the DB schema already holds tables for every lesson, and `@devdigest/shared` contracts exist in both `server/src/vendor/shared/` and `client/src/vendor/shared/` — find what already exists for eval and build on it, don't re-invent; also check `specs/lessons/L06.md` if present).
2. "Turn into eval case" button on FindingCard: stores the diff fragment + expectation. Expectation type depends on the finding's decision: accepted → `must_find`, dismissed → `must_not_flag`.
3. Route `POST /agents/:id/eval-runs` — runs the agent over all cases in its set. Inputs are frozen so runs of different agent versions are comparable.
4. Scoring fully in code, NO LLM: a finding matches when the file matches and line ranges overlap. recall = share of expected that was found; precision = share of findings that are not noise (dismissed/must_not_flag cases work here); citation_accuracy = share of findings that survived the grounding gate.
5. UI: "Evals" tab in AgentEditor — case list, run history.
6. Separate page in the left sidebar — "Eval Dashboard" for agents, showing recent eval runs.
7. Experiment: a couple of runs with old vs new system prompt → metrics visibly move; then deliberately break the prompt → precision drops.

Acceptance criteria (course): set has ≥8 cases; case is created from a finding in one click; both expectation types (must_find / must_not_flag) work; changing the system prompt visibly moves recall/precision between two runs; scoring makes zero LLM calls; `pnpm verify:l06` is green (find where this script lives and what it checks — it's a hard gate).
Hand-in checklist: `specs/eval-pipeline.md` exists in specs; `pnpm verify:l06` green; screenshot comparing two runs with different prompts.
Process: SDD from L05 — spec with acceptance first, then plan, then code.

**Naming conflict to resolve:** the course requires the file at `specs/eval-pipeline.md`, but your convention is `specs/NN-*.md`. Check whether `verify:l06` looks for `specs/eval-pipeline.md` by exact path; propose a resolution (e.g. write the spec at the required path, or NN file + required path) as a question.

## Design mockups (PNG files you can Read)
1. `/var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/69D5AA1E-E958-4194-B4F4-7077D996F08A-5895-000001CD54988B40/pasted-image-20261011-114104.png` — PR detail / Overview, "Review runs" grouped by run; expanded FindingCard (title, category, file:line, confidence, body, Suggested fix) with action row: Accept · Dismiss · Learn · **Turn into eval case** (highlighted, flask icon) · Reply to author.
2. `/var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/971E1747-BD81-4CF5-8EAD-2CF2583CDCBF-5895-000001CD7D7AA81B/pasted-image-20261011-114133.png` — Eval Dashboard (sidebar item under Skills Lab, breadcrumb "Skills Lab > Eval Dashboard"): header "Regression harness across all reviewer agents", "Run all agents" button; AGENTS list cards (name, model badge, "Last run v7 · date · 17/20 pass", sparkline, RECALL / PREC / CITE %, chevron); "RECENT EVAL RUNS · ALL AGENTS" table (agent, timestamp, version vN, three bar+% columns, pass x/y).
3. `/var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/C2B0DFBC-F03F-4B8A-97E0-3E9C07D96894-5895-000001CD95C4F98A/pasted-image-20261011-114150.png` — Per-agent dashboard ("Skills Lab > Eval Dashboard > Security Reviewer"): "All agents" back link, agent name + model, "Regression harness · 5 runs on the 20-trace gold set", agent dropdown, "30 days" range, "Run eval"; alert banner ("Precision dipped 2pts on v7 — a new false positive slipped in. Recall and citation both up."); 3 KPI cards with value, delta vs previous and sparkline; METRIC TREND line chart (recall/precision/citation); RECENT RUNS table with checkboxes ("2 selected"), columns RAN AT · VERSION · RECALL · PRECISION · CITATION · PASS · COST, "Compare" button.
4. `/var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/E3439EB5-DD2C-42B6-A0AE-85F964A17243-5895-000001CDF5E62E95/pasted-image-20261011-114257.png` — Compare modal "Compare runs · v6 → v7 — Old prompt vs new": 4 delta cards (Recall, Precision, Citation, Cost: old → new, ▲/▼ pts), "SYSTEM PROMPT DIFF" with v6 (old)/v7 (new) legend and line-highlighted diff; footer Close + "Promote v7".
5. `/var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/10AE16E8-5FD9-4BC4-9D58-139D89E2067B-5895-000001CE0C7235DB/pasted-image-20261011-114313.png` — Agents page, AgentEditor tabs Config · Skills · Context · **Evals** · Stats · CI. Evals tab: "EVAL METRICS" + "View full dashboard →"; 4 KPI cards (Recall, Precision, Citation accuracy with deltas, Traces passed 17/20); "Eval cases 3/5 passing" with "Run all evals" and "+ New eval case"; case rows (status icon pass/fail/never-run, slug name e.g. stripe-key-leak, "expected 1 finding, got 1", tag "CRITICAL · security" or "empty []", per-row run/edit/delete).
6. `/var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/431B5A80-C72F-4C11-A616-D2C4727A04E5-5895-000001CE2FCBFA94/pasted-image-20261011-114337.png` — Eval case modal "Eval case · stripe-key-leak — simulate a PR and assert the expected output": Name*, Input tabs Diff / Files / PR meta (diff view), Expected output JSON editor with "valid JSON" badge and "+ Finding skeleton", "Last run passed · expected 1 finding, got 1 · 1.8s · $0.02" banner; footer "Run on save" toggle, Cancel, Run case, Save.

## Things I want the intake to address explicitly
- What "version vN" means: there's no visible agent versioning yet — does each run snapshot the agent config (system prompt, model, skills) so Compare can diff prompts? Where does the version number come from?
- Mockup vs brief tension: the modal's Expected output is a JSON array of findings (and "empty []" cases = expect zero findings), while the brief has must_find / must_not_flag with file:line. Reconcile into one case model.
- Pass/fail per case definition (mockup shows x/y passed) vs aggregate recall/precision.
- Precision denominator: which findings count as noise — only those overlapping must_not_flag regions, or every unmatched finding? Recommend one with rationale.
- Frozen inputs: what exactly is stored per case (diff fragment, file list, PR meta) so reruns are deterministic in input; how the agent is invoked on a stored fragment without the live repo (reviewer-core pipeline, grounding gate).
- Scope cuts / candidates for out-of-scope: "Promote vN", "Run all agents", 30-day filter, per-case run, "Run on save", cost tracking, manual "New eval case" vs one-click-from-finding, alert banner heuristics.
- Run execution model: sync vs async for N cases × LLM call; progress/failure states; concurrent run on the same agent.
- Cases from findings without a decision (neither accepted nor dismissed) — button disabled? Duplicate case for the same finding?
- i18n, workspace scoping via getContext(), the two `@devdigest/shared` copies, migrations via `pnpm db:generate`.
- The experiment (prompt A vs B vs broken) — part of acceptance, but likely a manual procedure section rather than code.

Produce the intake report: design gaps, corner cases, cross-module interactions (server / client / reviewer-core / shared contracts), UX improvements, approach options with a recommendation, numbered questions, and research requests I can fan out to `researcher` agents.

---
## Resume 1

PHASE 2: user answers and research results are in. Write the spec now (Status: draft) at specs/08-eval-pipeline.md (SPEC-08).

## User decisions
- Approach: **B, using upstream SPEC-12 as a proven reference** (own spec, own code; borrow its decisions where sound). Routes follow the brief: `POST /agents/:id/eval-runs` (name the rest consistently). Skill evals (SPEC-15), Promote vN, Run all agents → Non-goals.
- Precision: **as in SPEC-12** — precision = 1 − FP/total, FP = kept (grounded) findings overlapping a must_not_flag case's range; total = all kept findings across scored cases; null when total = 0. Additionally expose TP / FP / unlabeled counts next to the ratio. Define explicitly what happens when a finding overlaps both a must_find and a must_not_flag range (pick and justify).
- Vendor: **user explicitly permits** changing contracts in `server/src/vendor/shared/` and `client/src/vendor/shared/` — both copies, same commit; client copy keeps `.optional()` not `.default()`, client imports types only.
- All other questions: **accept your defaults** (Q1 file at specs/08-eval-pipeline.md, main session will create specs/eval-pipeline.md copy after approval; Q3 freeze file patch of the finding's file + PR title/body; Q4 non-goals as you listed — in scope: read-only case modal with rename, delete case, Compare with prompt diff + cost; Q5 version = agents.version at start + snapshot of effective inputs incl. resolved skill bodies; Q6 match = file + line-range overlap only; Q7 errored cases excluded, run marked partial; Q8 case belongs to the finding's agent; Q9 cascade delete with agent; Q10 sequential background run, client polling, 10 min timeout). Also include the Eval Dashboard sidebar page (agents list + recent runs across agents) and per-agent detail with trend + run table + Compare, per the mockups.

## Research results
R1 `verify:l06`: NOT in this branch, origin, upstream/main. Exists only on `upstream/full-functionality:server/package.json:14` as `vitest run src/modules/eval/scoring.test.ts src/modules/eval/frozen-input.test.ts src/modules/eval/executor.test.ts test/eval-contract-parity.test.ts test/contracts.test.ts test/eval.it.test.ts` (author's own SPEC-12 AC-57/D21). It checks no spec path. → Our spec must DEFINE `verify:l06` in `server/package.json` (mirroring the existing `verify:l03` pattern if present on this branch — check), covering: pure scoring unit tests (incl. zero denominators), frozen-input tests (expectation must intersect a hunk), executor test (identical prompt for same case, no repo-intel/intent sections), vendor contract parity test for the eval region, contract parse test, DB-backed it-test (self-skips without Docker) asserting routes, single-flight 409, workspace scoping, zero LLM calls on read routes and in scoring, unique per source finding, cascade on agent delete. Upstream seeds 7 fixture cases (`server/src/db/seed-eval-cases.ts`) for "Security Reviewer" — decide whether we seed fixture cases (with fake secrets only, `sk_live_xxx`) to reach ≥8 or rely on the manual procedure; recommend.
R2 prior implementations (upstream only; reference via `git show upstream/full-functionality:<path>`): Design 1 (original starter, per-case runs, expected_output = findings array, precision matched/actual) — this is what the current schema/contracts/eval.json reflect. Design 2 (SPEC-12): suite run as widened `eval_runs` row (status running|completed|errored, agent_version, case_ids, per_case jsonb, cases_errored, traces_passed/total, finished_at, error_reason, metrics, duration_ms, cost_usd); eval_cases gains workspace_id, source_finding_id (unique), notes, created_at/updated_at; expected_output = single EvalExpectation {type, file, start_line, end_line, severity?, category?, title?}; recall = passed must_find / must_find cases (null if none); citation = Σkept/Σtotal grounding (null if 0); errored excluded with pass null; Compare restricts to common case_ids, lists only_in_old/only_in_new, line-based prompt_diff from agent_versions snapshots; alert became structured EvalCallout rendered via i18n; rate limit 5/min on run start; POST /findings/:id/eval-case returns 201 or 200 if exists. Reference files: upstream/full-functionality:specs/12-eval-pipeline.md, server/src/modules/eval/{scoring,service,routes}.ts.
R3 LLM/ReviewInput: temperature defaults to 0 in all adapters (omitted for gpt-5/o-series on OpenAI); no seed/top_p anywhere; OpenRouter upstream not pinned → low-variance but non-deterministic. `reviewPullRequest` needs only systemPrompt, model, diff (parsed UnifiedDiff), llm; no title field — title goes into `task` via taskLine (`server/src/modules/reviews/helpers.ts:84-94`), body into prDescription. Stored fragment → `parseUnifiedDiff` (`server/src/adapters/git/diff-parser.ts`); fragment must include `diff --git`/`+++` headers. Grounding: exact file path match + range intersects hunk newLineNumbers (context lines count); kinds secret_leak/lethal_trifecta/phantom/hook need only the file. Single-file diff or 'single-pass' → exactly one LLM call. costUsd null for unknown models (e.g. Claude ids not in pricing table) → show "—". maxRetries 2 reprompts add cost.
R4 external: most benchmarks (Martian, Tenki, Augment, SWR-Bench, CR-Bench) count every unmatched finding as FP, but they have full gold labels; GitHub ReviewBench reports grounded (labeled-only) metrics as headline — nearest precedent for us. No benchmark has a dismissed-findings negative set. Range-overlap matching has precedent (AACR-Bench); ±5-line window is the only published tolerance (we keep strict overlap). Recommend always printing denominators/counts.

Experiment (old prompt vs new vs deliberately broken) goes in as a manual procedure section; acceptance includes the screenshot of Compare. Also note in the spec that the course hand-in wants `specs/eval-pipeline.md` — main session handles that copy.

Return: the spec path, a short summary of its structure (counts of US/AC/EC/NFR/Q), the lint result, and any open questions left.

---
## Resume 2

Update the draft `specs/08-eval-pipeline.md` (still Status: draft) with user decisions made during plan review. Edit in place; keep existing IDs stable, append new ones; re-run your self-check. Reply in Ukrainian.

1. Read routes added (user approved): `GET /agents/:id/eval-cases` (case list with latest_result from last finished run), `GET /eval-cases/:id` (full case: frozen diff, meta, source {repo_id, pr_number}|null), `GET /agents/:id/eval-overview` ({agent, cases_total, finished_runs, running_run_id, latest, previous, trend ≤30, runs ≤50}), `GET /eval-runs/:id` (full run with case_results and progress {done,total}; the client polls it), `GET /eval-dashboard`, `GET /eval-runs/compare?a&b`.
2. "In eval set" state on FindingCard (AC-8/AC-9): served by a separate route `GET /pulls/:id/eval-case-links` → map finding_id → case_id for that PR's findings, workspace-scoped. FindingRecord is NOT changed.
3. Resolutions:
   - NQ-1 slug: ≤60 chars, then `-2`/`-3` suffix appended on top. An empty slug becomes `eval-case`. Rename may reuse an existing name; uniqueness applies only to auto-generated names.
   - NQ-2: delta = round(new·100) − round(old·100).
   - NQ-3: the Cost card shows the whole run's cost_usd; ratio cards use common cases only.
   - NQ-4: if the agent is deleted mid-run, the executor sees the run row is gone and stops quietly.
   - NQ-5: compare with an unfinished run returns `422 run_not_finished`.
   - NQ-6: case-creation check order is 404 → finding_undecided → agent_missing → eval_case_exists (409) → no_patch → range_outside_diff.
   - NQ-7: a null metric is skipped in the sparkline/trend (gap), never drawn as 0.
4. Single-flight (EC-10) is enforced at the DB level (no race on double click); stale `running` runs are reaped at boot (already EC-14). These are implementation notes; only add what is a requirement.

Do not change Status. Return: what changed (new IDs) and the self-check result.