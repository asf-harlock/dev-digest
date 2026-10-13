Phase 1 (requirements review + clarifying questions; no plan yet, read-only). Repo: /Users/harlock/Downloads/Sites/devdigest, branch L06-homework-stretch.

Requirements: specs/09-skill-evals.md (SPEC-09, Status: draft, lint ok). It covers: skill-owned manual eval cases, a shared Case Editor (paste diff + live DiffViewer preview, expectation type, file, new-side line range), edit rule B (editing diff/file/range/type/PR title/description saves a NEW case and deletes the old; name/notes/severity/category edit in place; finding-derived cases are name+notes only), a skill eval run via a carrier agent with two arms (with / without skill) and lift, and a trend chart on the skill Evals tab. Scope is SKILLS ONLY — the agent Evals tab is out of scope (user decision, Q-1/Q-2/Q-3 resolved: one spec, delivered in three phases A: cases + Case Editor; B: skill runner + list results + lift; C: trend).

Context to account for:
- SPEC-08 (specs/08-eval-pipeline.md, approved, shipped on this branch) is NOT edited; SPEC-09 amends it as listed in its Goals.
- Upstream reference design for skill evals exists only on `upstream/full-functionality` (specs/15-skill-eval-cases.md, commits b782c2d, 063a72c, f5b298f). It was relayed through a researcher report and never verified firsthand — please verify the facts SPEC-09 relies on with `git show upstream/full-functionality:<path>` (routes, 200 KB cap, error codes, carrier + two-arm runner, scoring) and flag any mismatch with the spec. Upstream migrations are NOT a clean cherry-pick (this branch's eval_runs is agent-shaped: agent_id, snapshot, case_set, case_results, metric_parts, one-running-per-agent unique index).
- Both vendored @devdigest/shared copies (server/src/vendor/shared and client/src/vendor/shared) must change in the same commit.
- Stretch items 1, 4, 5 (evals/ skill eval file, PreToolUse commit hook, mutation testing) are out of scope.

Per your definition: review the requirements, recommend improvements, ask clarifying questions, and ask whether to execute in single-agent or multi-agent mode. Resolve per-file skills from .claude/skills/pr-self-review/reference/routing.json. State in one line which INSIGHTS/CLAUDE.md files you read. Do not write or amend the spec.

---
## Resume 1

Phase 2: write the Implementation Plan now. SPEC-09 was revised and committed (d58c7a8, lint ok) — re-read specs/09-skill-evals.md first; its scope changed after your review.

ANSWERS to your Q1–Q10 (real user answers via the question form, plus the spec revision):
- Q1 plan from the draft: yes, plan from the committed draft.
- Q2 replacement keeps place: yes, a replaced case inherits the old created_at (AC-15/16, `replaced_from_id` in AC-47).
- Q3: BOTH owners now have finding-derived cases (the user added "turn into skill eval case" on FindingCard, AC-48..53), so EC-6/EC-7 are reachable: read-only Case Editor for finding-derived cases, name+notes editable, severity/category locked.
- Q4 lift: stored raw (with − without fraction); integer points display-only (NFR-9 reworded).
- Q5: severity/category optional, Finding enums, only for must_find, null otherwise (EC-41); notes ≤ 2000, description ≤ 5000.
- Q6: effect enum five values incl. `errored`; errored in either arm = errored in both (pairArms) and excluded from lifts; "scored" = both arms; finished = completed|partial.
- Q7: EXPLICIT CONSENT given by the user to edit both vendored contract copies (server/src/vendor/shared, client/src/vendor/shared) in the same commit, and to generate migrations with `pnpm db:generate` (never edit applied ones). Migrations are now in Phase A (unique index widening to (owner_kind, owner_id, source_finding_id)) AND Phase B (eval_runs reshape).
- Q8: move CaseModal parts / DeleteCaseDialog / CaseStateLabel / MetricTrend to client/src/components/ with no behaviour change to the agent tab (NFR-16); add start–end `highlightRange` to DiffViewer/FileCard; a row click opens the Case Editor.
- Q9: propose contract field names yourself; the spec now has a Contracts block — reconcile with it. 409 details key `run_id`.
- Q10: as you stated (204,800 bytes, client pre-check + server 413 mapping, CRLF→LF, compare 404 for skill run id, NFR-2 = two reviewPullRequest invocations per case, k = cases_done + 1).
- Your Recommendation 6 (warn when skill/link disabled) is now Q-17 in the spec, default yes; plan it.
- Execution mode: MULTI-AGENT, phase by phase (A, then B, then C), per your recommendation: contracts first (both vendor copies, one commit), then server ∥ client, then test-writer, then architecture-reviewer ∥ security-reviewer ∥ plan-verifier.

SCOPE NOTE: the agent Evals tab and the dashboard detail page ARE in scope now (Case Editor, trend chart with `cost_usd` on EvalTrendPoint, MetricTrend tooltip); NFR-16 forbids changing existing SPEC-08 agent-tab behaviour otherwise. FindingCard action touches the PR module (client prReview + server findings/eval routes); include the per-file skills for it. Stretch items 1, 4, 5 remain out of scope.

Deliver the plan per your format: per-phase steps with file paths, the AC/EC/NFR→step traceability, per-file skills from routing.json, gate commands per package, migration generation steps (two-pass per server/INSIGHTS.md; check eval_runs row count before NOT NULL changes), the test list (include the D7 prompt-parity test), and risks. Mention that after approval the user runs /run-plan (per project convention) — do not launch implementers yourself. Read-only: write the plan in your reply (or to the plans/ location your definition prescribes, if it does).