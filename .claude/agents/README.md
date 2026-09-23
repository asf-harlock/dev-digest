# Agents

Subagent definitions invoked via the `Agent`/`Task` tool. Canonical location
is `.claude/agents/`. This file is a map of the set — for full behavior read
each agent's own `.md` file; nothing here duplicates their prompt bodies.

## Catalog

| Agent | Role | Tools | Model | Mode |
|---|---|---|---|---|
| [researcher](researcher.md) | Gathers facts (repo + external), never edits | `Read, Grep, Glob, Bash, WebFetch, WebSearch` | sonnet | default |
| [planner](planner.md) | Turns a request into a Development Plan, never edits | `Read, Grep, Glob, Bash` | sonnet | default |
| [implementer](implementer.md) | Executes an approved plan across frontend/backend | `Read, Grep, Glob, Edit, Write, Bash, Skill` | sonnet | acceptEdits |
| [test-writer](test-writer.md) | Writes UI/backend tests, never implementation | `Read, Grep, Glob, Bash, Edit, Write, Skill` | sonnet | acceptEdits |
| [architecture-reviewer](architecture-reviewer.md) | Checks layering/boundaries, no write access | `Read, Grep, Glob, Bash` | sonnet | default |
| [plan-verifier](plan-verifier.md) | Checks a diff against every plan item, not a code review | `Read, Grep, Glob, Bash` | sonnet | default |
| [doc-writer](doc-writer.md) | Turns a plan/change into docs + diagrams, picks docs/ placement | `Read, Grep, Glob, Bash, Edit, Write, Skill` | sonnet | acceptEdits |

Security review is still **out of scope for this set** — it is a separate
agent, not covered here. Architecture review is now covered by
`architecture-reviewer` (added after this line was first written); it stays
read-only and defers merge/security judgment exactly as `planner` and
`implementer` already say they do in their own prompts.

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

## planner

- **Responsibility:** produce a structured Development Plan for a feature or
  bug fix before any code is written — which modules it touches, which
  constraints from `CLAUDE.md`/`INSIGHTS.md` apply, which skills the
  `implementer` agent will load per file, the step order, and the test plan.
  Does not implement and does not render an architecture/security verdict.
- **Permissions:** read-only (`Read, Grep, Glob, Bash`). No `Write`/`Edit` —
  the plan is text, not a file.
- **Input artifact:** a feature/bug description (plus any lesson spec or
  branch context the user gives it).
- **Output artifact:** a Development Plan as its final message, fixed
  sections: `Objective` / `Modules affected` / `Constraints` / `Skills the
  implementer will apply` / `Step-by-step plan` / `Test plan` / `Risks /
  open questions`.
- **Sources its rules are built on:**
  | Source | Rule applied |
  |---|---|
  | [Claude Code docs — Sub-agents](https://code.claude.com/docs/en/sub-agents) | `description` states an explicit "use to X" trigger condition; read-only agent gets an allowlist with no `Write`/`Edit` (mirrors the docs' "Read-Only Research Agent" example) |
  | Same, "Division of Labor" pattern | planner = the doc's informally-named "Architect/Plan" role; explicitly excludes the "Reviewer" role, which belongs to separate agents |
  | Same — no documented cross-agent skill-declaration mechanism | in its absence, planner and `implementer` both resolve skills from the *same* file (`routing.json`) instead of one agent declaring skills for the other |
  | `.claude/agents/researcher.md` (existing agent, in-repo precedent) | "Step 0 — clarify the task" pattern (check scope is concrete before starting; ask instead of guessing) copied structurally |
  | `.claude/skills/pr-self-review/reference/routing.json` (in-repo precedent) | path→bucket→skills resolution (`rules` first-match-wins → `buckets` → `conditional_skills`) reused verbatim as the "which skills will the implementer apply" step, instead of inventing a new mapping |
  | Root `CLAUDE.md` — "Do not touch" list, `@devdigest/shared` dual-copy gotcha | any touch to a listed path is flagged under `Risks` rather than planned around; contract-changing steps are ordered before their dependents and called out for the dual-copy edit |
  | Module `CLAUDE.md` files (`server/`, `client/`, `reviewer-core/`, `e2e/`) | read before planning, per module, for layering/architectural constraints |
  | `INSIGHTS.md` eight-section convention | reads `Decisions` and `Open Questions` specifically (forward-looking sections) |

## implementer

- **Responsibility:** execute an already-approved Development Plan (typically
  from `planner`) across `server/`, `client/`, `reviewer-core/`, `e2e/` as
  needed — resolving the same per-file skills the plan named, running the
  plan's test/typecheck/lint/arch gates, and self-checking only that its diff
  matches the plan and passes those gates. Does not decide scope, does not
  render an architecture/security verdict, does not open PRs.
- **Permissions:** `Read, Grep, Glob, Edit, Write, Bash, Skill`,
  `permissionMode: acceptEdits`. Never runs `/pr-self-review`, `git push`,
  `gh pr create/merge`.
- **Input artifact:** a Development Plan (planner's output format). Asks for
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
  | `.claude/skills/pr-self-review/reference/routing.json` (in-repo precedent) | identical path→bucket→skills resolution algorithm as `planner`, so results are guaranteed consistent between the two agents |
  | Root `CLAUDE.md` — "Do not touch" list, naming conventions, `@devdigest/shared` gotcha, `/pr-self-review` `PreToolUse` gate | absolute constraints on what may be edited and how; never attempts the gated PR commands itself |
  | Module `CLAUDE.md` files | re-read before implementing, per touched module |
  | `INSIGHTS.md` eight-section convention | reads `What Doesn't Work` and `Recurring Errors & Fixes` specifically (mistake-avoidance sections, complementary to the ones `planner` reads) |

## test-writer

- **Responsibility:** write tests for UI (`client/`) or backend (`server/`)
  code, colocated with the subject, never the implementation itself. Runs
  what it writes and reports pass/fail rather than only authoring tests.
  Deliberately does not cover `reviewer-core/`/`e2e/` (different runners/
  conventions) — see its own file for the boundary statement.
- **Permissions:** `Read, Grep, Glob, Bash, Edit, Write, Skill`,
  `permissionMode: acceptEdits`. Write access is scoped by its own prose to
  test files only (`<subject>.test.ts(x)`, `.it.test.ts`) — never the subject.
- **Input artifact:** a scope (file/behavior to cover) or a Development Plan
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
  Development Plan or requirements list — a definition-of-done check, never
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

- **Responsibility:** turn a Development Plan, shipped change, or other
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
