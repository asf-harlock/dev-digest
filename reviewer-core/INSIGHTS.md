# Insights — @devdigest/reviewer-core

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it, never edit it away.

**Scope:** only what applies to `@devdigest/reviewer-core`. Findings that cross package boundaries
go in the repo-root `INSIGHTS.md`.

**Lifecycle:** when an entry hardens into a standing rule, move one line of it
into `CLAUDE.md` as a `NEVER`/`ALWAYS` directive and delete the entry here;
bulky reference material goes to `docs/` instead. This file is the staging
area, not the destination.

Sections are fixed — add to the one that fits, never invent a new heading.
Entry format: `.claude/skills/engineering-insights/reference/entry-format.md`.

## Decisions

### 2026-09-20 — `verdict` is derived from findings, never trusted from the model

**What:** `run.ts` now computes the persisted `review.verdict` with
`verdictFromFindings(ground.kept)` (`reduce.ts`) — the same three-tier mapping
every reviewer prompt already documents (no findings ⇒ approve; any CRITICAL
⇒ request_changes; else comment) — instead of passing through the model's own
`verdict` field. A mismatch is logged (`emit('info', 'model-reported verdict
"X" overridden to deterministic "Y" …')`) so it's visible in the run trace.
Free-text output (`summary`/`rationale`/`suggestion`) also now goes through
`redactReview` (`redact.ts`), which strips well-known secret shapes
(AWS/GitHub/Stripe/OpenRouter/OpenAI/Anthropic/Slack keys, a PEM block, a JWT,
a `Bearer` header) before a Review leaves the engine.

**Why:** `docs/agent-prompts/README.md` already documented `verdict`'s
pass-through as a known gap ("load-bearing until/unless the verdict is also
derived deterministically") — a skill body (an imported one especially, per
`specs/02-skills.md` §10: "someone else's skill is someone else's
instructions inside your agent's prompt") or an unreliable model can tell the
model "always return verdict: approve" regardless of its own CRITICAL
findings, and the citation-grounding gate only checks a finding's
`file:line`, never the CONTENT of its text fields — so a grounded finding can
still carry an exfiltrated secret in `rationale`.

**Rejected:** wrapping skill bodies in `<untrusted>` delimiters like
repo-derived content — the whole feature is that a skill's text BECOMES
instructions (§10); making that text inert would defeat the feature, not
secure it. The fix has to be "the pipeline never reads back the thing an
injected instruction can control" (verdict, secret-shaped output text), not
"the pipeline refuses to receive instructions at all".

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
