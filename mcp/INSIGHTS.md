# Insights — @devdigest/mcp

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it, never edit it away.

**Scope:** only what applies to `@devdigest/mcp`. Findings that cross package
boundaries go in the repo-root `INSIGHTS.md`.

**Lifecycle:** when an entry hardens into a standing rule, move one line of it
into `CLAUDE.md` as a `NEVER`/`ALWAYS` directive and delete the entry here;
bulky reference material goes to `docs/` instead. This file is the staging
area, not the destination.

Sections are fixed — add to the one that fits, never invent a new heading.
Entry format: `.claude/skills/engineering-insights/reference/entry-format.md`.

## Decisions

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-25** — When `tsc` runs out of memory, it prints no `error TS…`
  lines. So `npx tsc --noEmit | grep -c error` reports 0 on a program that is
  failing. Judge the typecheck by `npm run typecheck`'s exit code, never by the
  error count. That happened here while the `zod` path alias (see `CLAUDE.md`
  Gotchas) was pushing every `registerTool` into TS2589. A healthy run takes
  about 1 s and roughly 240 MB (`npx tsc --noEmit --extendedDiagnostics`).

## Session Notes

- **2026-09-25** — Package created (L04). Entries on the typecheck-OOM trap,
  and in `server/INSIGHTS.md` on 422 validation and the pre-existing skills
  `.it` failures.

## Open Questions
