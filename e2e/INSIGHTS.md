# Insights — @devdigest/e2e

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it, never edit it away.

**Scope:** only what applies to `@devdigest/e2e`. Findings that cross package boundaries
go in the repo-root `INSIGHTS.md`.

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

- **2026-09-25** — On the CI runner (headless Chrome, ubuntu), `find … click`
  does **not** scroll its target into view when the page scrolls inside a
  nested container (the app scrolls `<main>`, not `window`). It clicks the
  off-screen coordinates, exits 0 and changes nothing, so the *next* `wait`
  fails. On macOS the same flow passes, so a local green run proves nothing
  here. Before clicking anything below (or above) the fold, run
  `scroll down|up 5000 --selector main`. Flow 08 failed this way on every CI
  run: `DiffTab` Boilerplate header at y≈2286 in a 577px viewport, and
  `main.scrollTop` stayed 0 after the click.
  `e2e/specs/08-smart-diff.flow.json`

- **2026-09-24** — Two agent-browser quirks, each of which failed a flow while
  the UI was correct:
  1. `wait --text` matches **rendered** text, so a string styled with
     `text-transform: uppercase` (e.g. `SectionLabel` titles such as
     "Reviewer-ordered diff") never matches its source casing. Anchor on
     untransformed text, like a button label.
  2. `find text <X> click` straight after `wait --url /pulls` races the list
     render and fails intermittently (flows 04/05/08 failed on different runs).
     Put `wait --text <X>` before the click, as flow 02 does.

  `e2e/specs/02-repo-pulls-detail.flow.json`, `08-smart-diff.flow.json`

## Recurring Errors & Fixes

## Session Notes

- **2026-09-25** — Fixed flow 08 CI-only failure (off-screen click in nested scroller); debugged via `workflow_dispatch` on a throwaway branch.

## Open Questions
