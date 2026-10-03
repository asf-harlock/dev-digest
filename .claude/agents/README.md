# Agents

Subagent definitions invoked via the `Agent`/`Task` tool. Canonical location
is `.claude/agents/`. This file is a map of the set — for full behavior read
each agent's own `.md` file; nothing here duplicates their prompt bodies.

## Catalog

| Agent | Role | Tools | Model | Mode |
|---|---|---|---|---|
| [researcher](researcher.md) | Gathers facts (repo + external), never edits | `Read, Grep, Glob, Bash, WebFetch, WebSearch` | sonnet | default |
| [implementation-planner](implementation-planner.md) | Reviews existing requirements, asks questions and single- vs multi-agent, then returns an Implementation Plan; never writes specs or edits | `Read, Grep, Glob, Bash` | sonnet | default |
| [implementer](implementer.md) | Executes an approved plan across frontend/backend | `Read, Grep, Glob, Edit, Write, Bash, Skill` | sonnet | acceptEdits |
| [test-writer](test-writer.md) | Writes UI/backend tests, never implementation | `Read, Grep, Glob, Bash, Edit, Write, Skill` | sonnet | acceptEdits |
| [architecture-reviewer](architecture-reviewer.md) | Checks layering/boundaries, no write access | `Read, Grep, Glob, Bash` | sonnet | default |
| [plan-verifier](plan-verifier.md) | Checks a diff against every plan item, not a code review | `Read, Grep, Glob, Bash` | sonnet | default |
| [doc-writer](doc-writer.md) | Turns a plan/change into docs + diagrams, picks docs/ placement | `Read, Grep, Glob, Bash, Edit, Write, Skill` | sonnet | acceptEdits |
| [security-reviewer](security-reviewer.md) | Finds exploitable security defects in a change, no write access | `Read, Grep, Glob, Bash, Skill` | sonnet | default |
| [brainstorm](brainstorm.md) | Generates and compares distinct approaches before planning, never decides | `Read, Grep, Glob, Bash, WebSearch, WebFetch` | sonnet | default |
| [spec-creator](spec-creator.md) | Analyses designs for gaps, asks, then writes a SPEC-NN EARS spec; writes only `*/specs/NN-*.md` | `Read, Grep, Glob, Write, Edit, Skill` + Playwright read tools | opus | default |

Typical order: `spec-creator` → (user approves the spec) → `implementation-planner` → `implementer` /
`test-writer` → `architecture-reviewer` + `security-reviewer` +
`plan-verifier` → `doc-writer`. The three reviewers are read-only and never
decide a merge — `/pr-self-review`'s gate does.
From an approved plan onward, `/run-plan SPEC-NN`
(`.claude/skills/run-plan/`) runs this chain for you: implementer(s) →
plan-verifier → architecture ∥ security ∥ bug review → a fix loop of at most
3 rounds (re-review limited to the fix diff) → plan-verifier. `spec-creator`
and `implementation-planner` stay manual; save the plan to
`.claude/sdd/SPEC-NN/plan.md`. `test-writer` runs only with `--tests`.
`brainstorm` is optional for feature work — `spec-creator` compares approaches
itself; use `brainstorm` for design questions that are not a feature spec.

## researcher

- **Responsibility:** find and verify facts — inside the repo (code, config,
  docs, git history) or externally (library docs, standards) — and report
  them with evidence. Asks clarifying questions if scope is unclear.
- **Permissions:** read-only (`Read, Grep, Glob, Bash` for read-only commands,
  plus `WebFetch, WebSearch`). No `Write`/`Edit`.
- **Input artifact:** a question or claim to investigate, optionally scoped
  to a module or source type.
- **Output artifact:** a fixed-section Markdown report — repository research
  (`Findings` / `Evidence` / `References` / `Could not find`) and/or external
  research, same section shape. No code changes.

## implementation-planner

- **Responsibility:** turn requirements that already exist (a `specs/` file,
  a lesson spec, a ticket, the user's words, a `brainstorm` pick) into an
  Implementation Plan — which modules and files change, which constraints
  from `CLAUDE.md`/`INSIGHTS.md` apply, which skills the `implementer` will
  load per file, the step order, who executes it, and the test plan. Before
  planning it reviews every requirement (Clear / Ambiguous / Missing detail /
  Conflicting / Infeasible), asks clarifying questions, recommends
  improvements, and always asks whether to run single-agent or multi-agent.
  Never writes, amends or invents a specification; does not implement and
  does not render an architecture/security verdict.
- **Permissions:** read-only (`Read, Grep, Glob, Bash`). No `Write`/`Edit` —
  the plan is text, not a file.
- **Input artifact:** existing requirements — normally a `spec-creator` spec
  (`US-n`/`AC-n`/`EC-n`/`NFR-n` IDs, possibly workflow and
  service-communication diagrams and contracts, usually no implementation
  details — those are what the plan adds). Diagrams and contracts are
  binding like ACs. With no requirements at all it stops and points at
  `spec-creator` rather than drafting one.
- **Output artifact:** two phases. Phase 1 — a Requirements review
  (`Source` / `Requirements as given` / `Clarifying questions` /
  `Recommendations` / `Execution mode`), then it stops; the caller resumes it
  with the answers. Phase 2 — an Implementation Plan, fixed sections:
  `Objective` / `Decisions from Phase 1` / `Modules affected` / `Constraints`
  / `Skills the implementer will apply` / `Step-by-step plan` / `Execution`
  (single pass, or a workstream table with disjoint file ownership) / `Test
  plan` / `Risks / open questions`. Phase 1 is skipped when the caller
  already answered every blocking question and named the execution mode.
- **Sources its rules are built on:**
  | Source | Rule applied |
  |---|---|
  | [Claude Code docs — Sub-agents](https://code.claude.com/docs/en/sub-agents) | `description` states an explicit "use to X" trigger condition; read-only agent gets an allowlist with no `Write`/`Edit` (mirrors the docs' "Read-Only Research Agent" example); a subagent cannot prompt the user, hence the two-phase stop-and-resume |
  | Same, "Division of Labor" pattern | implementation-planner = the doc's informally-named "Architect/Plan" role; explicitly excludes the "Reviewer" role (separate agents) and the spec-authoring role (requirements are input, never output) |
  | Same — no documented cross-agent skill-declaration mechanism | in its absence, implementation-planner and `implementer` both resolve skills from the *same* file (`routing.json`) instead of one agent declaring skills for the other |
  | `.claude/agents/researcher.md` (existing agent, in-repo precedent) | "Step 0 — clarify the task" pattern (check scope is concrete before starting; ask instead of guessing) copied structurally |
  | `.claude/skills/pr-self-review/reference/routing.json` (in-repo precedent) | path→bucket→skills resolution (`rules` first-match-wins → `buckets` → `conditional_skills`) reused verbatim as the "which skills will the implementer apply" step, instead of inventing a new mapping |
  | Root `CLAUDE.md` — "Do not touch" list, `@devdigest/shared` dual-copy gotcha | any touch to a listed path is flagged under `Risks` rather than planned around; contract-changing steps are ordered before their dependents and called out for the dual-copy edit |
  | Module `CLAUDE.md` files (`server/`, `client/`, `reviewer-core/`, `e2e/`) | read before planning, per module, for layering/architectural constraints |
  | `INSIGHTS.md` eight-section convention | reads `Decisions` and `Open Questions` specifically (forward-looking sections) |

## implementer

- **Responsibility:** execute an already-approved Implementation Plan (typically
  from `implementation-planner`) across `server/`, `client/`, `reviewer-core/`, `e2e/` as
  needed — resolving the same per-file skills the plan named, running the
  plan's test/typecheck/lint/arch gates, and self-checking only that its diff
  matches the plan and passes those gates. Does not decide scope, does not
  render an architecture/security verdict, does not open PRs.
- **Permissions:** `Read, Grep, Glob, Edit, Write, Bash, Skill`,
  `permissionMode: acceptEdits`. Never runs `/pr-self-review`, `git push`,
  `gh pr create/merge`.
- **Input artifact:** an Implementation Plan (implementation-planner's output format). Asks for
  one if none is given rather than inventing scope.
- **Output artifact:** an Implementation report as its final message, fixed
  sections: `Plan step → change` / `Tests run` / `Self-check (implementation
  scope only)` / `Deviations from plan` / `Handoff note`. Plus the actual code
  changes made in the working tree.
- **Sources its rules are built on:**
  | Source | Rule applied |
  |---|---|
  | [Claude Code docs — Sub-agents](https://code.claude.com/docs/en/sub-agents), "Code Reviewer with Auto-Linting" example | file-changing agent gets `Edit`/`Write` + `permissionMode: acceptEdits`, not a read-only allowlist |
  | Same, "Division of Labor" pattern | implementer = the doc's "Implementer" role; explicitly excludes "Reviewer" — architecture/security verdicts are named in `Handoff note`, never asserted here |
  | Same — no documented cross-agent skill mechanism | resolves skills from `routing.json` itself rather than trusting a copy in the plan; stops and surfaces any mismatch against what the plan named |
  | `.claude/skills/pr-self-review/reference/routing.json` (in-repo precedent) | identical path→bucket→skills resolution algorithm as `implementation-planner`, so results are guaranteed consistent between the two agents |
  | Root `CLAUDE.md` — "Do not touch" list, naming conventions, `@devdigest/shared` gotcha, `/pr-self-review` `PreToolUse` gate | absolute constraints on what may be edited and how; never attempts the gated PR commands itself |
  | Module `CLAUDE.md` files | re-read before implementing, per touched module |
  | `INSIGHTS.md` eight-section convention | reads `What Doesn't Work` and `Recurring Errors & Fixes` specifically (mistake-avoidance sections, complementary to the ones `implementation-planner` reads) |

## test-writer

- **Responsibility:** write tests for UI (`client/`) or backend (`server/`)
  code, colocated with the subject, never the implementation itself. Runs
  what it writes and reports pass/fail rather than only authoring tests.
  Deliberately does not cover `reviewer-core/`/`e2e/` (different runners/
  conventions) — see its own file for the boundary statement.
- **Permissions:** `Read, Grep, Glob, Bash, Edit, Write, Skill`,
  `permissionMode: acceptEdits`. Write access is scoped by its own prose to
  test files only (`<subject>.test.ts(x)`, `.it.test.ts`) — never the subject.
- **Input artifact:** a scope (file/behavior to cover) or an Implementation Plan
  naming the test files to add.
- **Output artifact:** a Test-writing report as its final message (`Tests
  added/extended` / `Run result` / `Findings (not fixed)` / `Out of scope`).
  Plus the actual test files in the working tree.
- **Sources its rules are built on:**
  | Source | Rule applied |
  |---|---|
  | Claude Code docs — best-practices ("have one Claude write tests, then another write code to pass them"; "write a failing test that reproduces the issue, then fix it") | never implements; red-before-green framing |
  | Vitest "Test Projects" + maintainer unit/integration split guidance | confirms DevDigest's own `*.it.test.ts` convention already matches documented practice |
  | Testing Library guiding principle; Fowler, "Mocks Aren't Stubs" | "test behaviour at the seams," avoid over-mocking |
  | Kent C. Dodds, "Colocation" | test file placement rule, matching this repo's own naming convention |
  | `.claude/skills/pr-self-review/reference/routing.json` (in-repo precedent) | same skill-resolution algorithm as `implementer` |
  | `TESTING.md` (repo) | suite map, hermetic-by-default rule |

## architecture-reviewer

- **Responsibility:** check a change for architectural-boundary conformance
  — onion layering in `server/`, UI layering in `client/`, "ZERO I/O" in
  `reviewer-core/`, e2e constraints — grounded in `pnpm arch`'s
  dependency-cruiser output where a gate exists, and in module `CLAUDE.md`
  prose (with an explicit "no machine gate exists" note) where it doesn't.
- **Permissions:** read-only (`Read, Grep, Glob, Bash`). No `Write`/`Edit` —
  hard, config-enforced, never fixes what it finds.
- **Input artifact:** a diff or scope (which module(s) changed).
- **Output artifact:** a standalone Architecture review report (`Deterministic
  check results` / `Findings` table / `Grounding note`), reusing this repo's
  own severity rubric and findings shape — not wired into the
  `/pr-self-review` file contract.
- **Sources its rules are built on:**
  | Source | Rule applied |
  |---|---|
  | Claude Code docs — sub-agents, `code-reviewer` example (`Read, Glob, Grep`, no Write/Edit) | this agent's own tool allowlist |
  | `archfit` (OSS) — "it never decides the gate" | `pnpm arch` output is ground truth; the LLM only interprets it |
  | arXiv:2603.15911 — separate structured evidence from narrative | the Findings table plus a separate Grounding note |
  | `server/.dependency-cruiser.cjs`, `client/.dependency-cruiser.cjs` (repo) | confirms which packages have a machine gate and which don't |
  | `.claude/skills/pr-self-review/reference/severity-rubric.md`, `reference/subagent-prompt.md` (in-repo precedent) | severity rules and findings shape reused verbatim |

## plan-verifier

- **Responsibility:** check finished code against every point of a
  Implementation Plan or requirements list — a definition-of-done check, never
  a substitute code review. Builds a requirements traceability matrix (one
  row per item, Pass/Fail/Blocked/**Unverified** — never defaulted to Pass)
  and re-runs the plan's own gate commands itself rather than trusting a
  prior self-report.
- **Permissions:** read-only (`Read, Grep, Glob, Bash`), and deliberately
  excludes `Task`/`Agent` so it cannot spawn a subagent to fix what it finds.
  Also deliberately does not load `Skill`/`routing.json` — see its own file
  for why.
- **Input artifact:** a plan/requirements list AND the finished diff to check
  it against. Asks for whichever is missing rather than guessing.
- **Output artifact:** a Plan verification report as its final message
  (`Requirements traceability matrix` / `Gates re-run` / `Not covered by the
  plan` / `Verdict`).
- **Sources its rules are built on:**
  | Source | Rule applied |
  |---|---|
  | Claude Code docs — sub-agents (no documented "verifier" archetype; tool-omission to stop fixer-spawning) | designed from general SE practice; omits `Task`/`Agent` |
  | Requirements Traceability Matrix convention (industry-standard) | per-item Pass/Fail/Blocked/Unverified matrix |
  | dev.to, "AI code review and agent verification are not the same" — "unverified instead of quietly becoming a pass" | the Unverified default rule |
  | aicompetence.org "layered assurance model" — escalate, don't auto-pass | Verdict never rounds up on Unverified/Blocked items |
  | Segregation-of-duties framing (agenticrail.nz) | re-runs gates itself instead of trusting the implementer's self-report |
  | This task's own explicit requirement | deliberate non-use of `routing.json`/`Skill`, to avoid becoming a generic code reviewer |

## doc-writer

- **Responsibility:** turn an Implementation Plan, shipped change, or other
  material into documentation — including Mermaid diagrams — and decide
  where it belongs (fill an existing module `docs/<topic>.md` stub per its
  own "What belongs here" line; write to root `docs/` only if genuinely
  cross-module; route `e2e/` task docs to `e2e/docs/`/repo-root `specs/`,
  never `e2e/specs/`). Self-audits every claim against the actual code/plan
  before returning — never invents behavior.
- **Permissions:** `Read, Grep, Glob, Bash, Edit, Write, Skill`,
  `permissionMode: acceptEdits`, scoped by its own prose to Markdown
  documentation only — never application source, never `INSIGHTS.md` outside
  the `engineering-insights` skill's own process.
- **Input artifact:** a plan, a diff, or other material to document, plus
  (implicitly) the existing `docs/` structure it must fit into.
- **Output artifact:** a Documentation report as its final message (`Written
  to` / `Diagrams` / `Self-audit` / `Placement rationale`), plus the actual
  doc file(s) in the working tree.
- **Sources its rules are built on:**
  | Source | Rule applied |
  |---|---|
  | Claude Code docs — sub-agents (no doc-writer archetype or placement guidance documented) | designed from docs-as-code practice, not a copied template |
  | `docs-agent-plugin` (OSS) — mirrors a project's own conventions; its "audit" mode rules on each claim against the code | "fill the existing stub, don't restructure" rule; the mandatory self-audit pass |
  | Docs-as-code convergence (ADR/design/runbook separation, traceability) | the module-stub → root-docs → e2e-routing → new-cross-module-doc ordering |
  | DocAgent (arXiv:2504.08725) — separate Truthfulness axis / Verifier stage | self-audit treated as its own pass, not folded into drafting |
  | Mermaid+AI generate-render-validate practice | the diagram loop (one concept per diagram, fix before returning) |
  | `docs/architecture.md`, `docs/agent-prompts/README.md`, `e2e/CLAUDE.md` (repo, direct read) | the actual current `docs/` structure and the one real "narrate + link" template already in this repo |

## security-reviewer

- **Responsibility:** find security defects a change introduces — missing
  tenancy scoping, secrets read outside `container.secrets`, injection /
  SSRF / XSS, command injection in the git/ripgrep adapters, and prompt
  injection where PR content reaches an LLM — reporting only findings whose
  attacker-controlled input and sink it can name.
- **Permissions:** read-only (`Read, Grep, Glob, Bash`) plus `Skill`, used
  only to load the `security` skill. No `Write`/`Edit`; never reads
  `~/.devdigest/secrets.json` or prints secret values.
- **Input artifact:** a diff or scope; defaults to every open change
  against `main` (committed, staged, unstaged, untracked).
- **Output artifact:** a Security review report (`Findings` table with
  input → sink and exploit scenario / `Checked, nothing found` / `Not
  checked`). An empty Findings table is a valid result.
- **Sources its rules are built on:**
  | Source | Rule applied |
  |---|---|
  | Claude Code docs — sub-agents, `code-reviewer` example | read-only allowlist; `Skill` only to load `security` |
  | `.claude/skills/security/SKILL.md` (repo) | confidence-based, trace-input-to-sink review; do-not-flag list |
  | OWASP Top 10:2025; OWASP Top 10 for LLM Applications (LLM01) | category labels; PR content treated as untrusted model input |
  | `anthropics/claude-code-security-review` (OSS) | high-confidence findings only; no DoS/rate-limit noise |
  | `.claude/skills/pr-self-review/reference/severity-rubric.md` (repo) | CRITICAL limited to tenancy and exploitable injection/SSRF/XSS; script-owned rules (`secret-literal`, `process-env-read`) not re-reported |
  | Root `CLAUDE.md` — no-auth tenancy, secrets chokepoint | the DevDigest-specific checks |

## brainstorm

- **Responsibility:** before planning, frame the problem, collect the repo's
  constraints, generate 3–5 genuinely distinct approaches (always including
  the smallest change and one that reuses existing code), compare their
  trade-offs and recommend one. Never decides and never plans step by step
  — the user picks, `implementation-planner` plans.
- **Permissions:** read-only (`Read, Grep, Glob, Bash`) plus `WebSearch,
  WebFetch` for prior art. No `Write`/`Edit`.
- **Input artifact:** a problem or feature idea with more than one plausible
  approach. Asks up to three clarifying questions if the problem or success
  criterion is unclear.
- **Output artifact:** a Brainstorm report (`Problem framing` /
  `Constraints` / `Options` / `Comparison` / `Recommendation` / `Open
  questions` / `Handoff`).
- **Sources its rules are built on:**
  | Source | Rule applied |
  |---|---|
  | Claude Code docs — sub-agents; best practices "explore, then plan, then code" | sits before `implementation-planner`, read-only, hands off |
  | Double Diamond (Design Council) | diverge without judging, then converge |
  | Osborn's brainstorming rules | distinct approaches, not variants of one |
  | ADR practice (options considered, consequences) | per-option pros/cons/risk and comparison table |
  | `researcher.md`, `implementation-planner.md` (repo) | clarify-first step; constraints from CLAUDE.md / INSIGHTS.md |

## spec-creator

- **Responsibility:** turn a feature idea and the design sources the user
  supplies (text, screenshots/mockups or exported Figma frames, existing code, the running app)
  into a Spec-Driven-Development spec. Before writing it analyses the design
  for missing states, uncovered corner cases, cross-module interactions,
  UX improvements and untrusted inputs, compares approaches when more than
  one is plausible, and asks the user. Never plans file-by-file, never writes
  code, never sets a spec to `approved`.
- **Permissions:** `Read, Grep, Glob, Write, Edit, Skill` plus Playwright
  read-only tools (no click). No `Bash`, no web tools, no Figma tools — all
  research (git history, repo sweeps, external facts) goes to `researcher`.
  Loads `spec-authoring` (always), `engineering-insights` (read mode) and
  `security` (untrusted-input lens). Writes only
  `specs/NN-*.md` (cross-module) or
  `<server|client|reviewer-core|mcp>/specs/NN-*.md` (single module); edits only specs with `Status: draft`. The limit is enforced
  by the prompt and the tool list, not by a hook.
- **Input artifact:** a feature description plus any design sources.
- **Research:** it cannot spawn agents or run git, so Phase 1 may end with a
  `Research requests` table (≤ 4 independent questions, ≤ 2 rounds). The
  caller launches one `researcher` per row in parallel and resumes it with
  the reports. Caller-side loop: `spec-authoring/SKILL.md` → "Running
  spec-creator".
- **Insights:** reads only the `INSIGHTS.md` of the modules the feature
  touches (root only when cross-module) and names them in its report.
- **Self-check:** a mandatory checklist (9 items for Phase 1, 12 for the
  spec) before every reply; the result is part of the reply.
- **Output artifact:** two phases. Phase 1 — a Spec intake report (`Framing` /
  `Placement` / `Sources read` / `Constraints` / `Findings` / `Approaches` /
  `Questions for the user`), no file written. Phase 2 — the spec file, fixed
  skeleton (`Проблема й користувач` … `Open questions`), `Status: draft`,
  EARS requirements with КОЛИ/ПОКИ/ЯКЩО/ДЕ + `(shall)` and stable
  `US-n`/`AC-n`/`EC-n`/`NFR-n`/`UI-n`/`Q-n` IDs. `SPEC-NN` is one repo-wide
  sequence. The form is checked by
  `.claude/skills/spec-authoring/scripts/lint-spec.mjs`, run by the caller
  after Phase 2 and by `/pr-self-review` as the `spec:lint` gate.
- **Sources its rules are built on:**
  | Source | Rule applied |
  |---|---|
  | Mavin et al., EARS (IEEE RE'09) | five requirement patterns |
  | Course convention | Ukrainian EARS triggers, spec skeleton |
  | Claude Code docs — sub-agents | two-phase stop-and-resume; allowlist without Bash |
  | `brainstorm.md`, `implementation-planner.md` (repo) | approach comparison; IDs the planner traces |
  | `.claude/skills/spec-authoring/` (repo) | template, EARS, design lenses, lint — shared with planner and verifier |
