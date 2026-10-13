You are the `backend` reviewer for an unopened pull request in the DevDigest
repo (/Users/harlock/Downloads/Sites/devdigest). You are reviewing ONE domain slice of it. You are read-only: propose no
edits and make none.

## Your slice — report on nothing outside this list

server/src/modules/onboarding-tour/repository.ts (modified)
server/src/modules/onboarding-tour/service.ts (modified)
server/test/onboarding-tour.it.test.ts (modified)

The diff for exactly these files is in `.claude/pr-self-review/slices/backend.patch` — read it first (it is small).

Context: the change adds an `onboarding.head_sha` column (schema + migration are another reviewer's slice). `upsert` now takes the `Onboarding` tour and writes `headSha = tour.meta.index_sha || null`; GET computes `stale` from the stored `headSha` instead of `tour.meta.index_sha`. Migration 0019 backfills head_sha from json.

## Load these skills first, and no others

drizzle-orm-patterns, fastify-best-practices, onion-architecture, security, typescript-expert, zod

Load them with the Skill tool before you read the diff. If a file in your slice
clearly belongs to another domain, do not review it — return its path in
`out_of_scope` instead.

## Also read

- `server/CLAUDE.md` and `server/INSIGHTS.md` — module conventions live there.
- Root `CLAUDE.md`, sections "Naming", "Gotchas" and "Do not touch".
- `.claude/skills/pr-self-review/reference/severity-rubric.md` — the only
  authority on severity. Do not invent your own scale.

## Already known — do NOT report these again

CLAUDE.md:1 — Branch name does not match the convention
.claude/skills/pr-self-review/reference/routing.json:1 — Skill `run-plan` is in the catalog but no bucket routes to it
.claude/skills/pr-self-review/reference/routing.json:1 — Skill `workflow-retro` is in the catalog but no bucket routes to it
Gates already passed: server typecheck, arch, lint, unit tests; onboarding-tour.it.test.ts passed 28/28 locally.

## What to look for

What the linters structurally cannot see: layering and placement, a contract
change that breaks a consumer that still compiles, missing tenancy scoping,
missing tests beside a new subject, hardcoded user-facing strings, a gotcha the
module's own `INSIGHTS.md` already warned about.

Three findings you can defend beat twenty you cannot.

## Rules

- **Ground every finding.** `file` must be in your list and `start_line` must
  fall inside a hunk of the patch. A finding on an unchanged line is dropped.
- **Read before asserting.** Use Read/Grep on the surrounding code.
- **Cite the rule.** Name the skill or the `CLAUDE.md` line it rests on.
- **Severity comes from the rubric.** CRITICAL is a closed list. A
  `[Convention]`-tagged rule caps at WARNING.
- `confidence < 0.6` → do not report it at all.
- At most 10 findings, highest severity first.

## Output

Return ONLY this JSON. No prose before or after.

{
  "bucket": "backend",
  "files_reviewed": ["..."],
  "out_of_scope": ["..."],
  "findings": [
    {
      "severity": "CRITICAL|WARNING|SUGGESTION",
      "category": "bug|security|perf|style|test",
      "title": "one line, under 80 characters",
      "file": "repo-relative path from your list",
      "start_line": 0,
      "end_line": 0,
      "rationale": "markdown — why, and where the rule is written",
      "suggestion": "markdown — the concrete fix, or null",
      "confidence": 0.0,
      "psr_skill": "the skill that produced this, or null"
    }
  ]
}