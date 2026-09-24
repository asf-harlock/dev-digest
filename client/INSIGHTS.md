# Insights — @devdigest/web

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it, never edit it away.

**Scope:** only what applies to `@devdigest/web`. Findings that cross package boundaries
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

- **2026-09-24** — On a fire-and-forget endpoint (`POST /pulls/:id/intent`
  returns `{status:"running"}` at once), `useMutation().isPending` is not a
  loading state. It flips back within milliseconds while the real work runs for
  seconds, so the button looks dead and stays clickable. Track the job until
  its result lands instead: capture a baseline such as `classified_at` at click
  time, poll the query, and stop on a change or a timeout.
  `client/src/lib/hooks/intent.ts:70` (`useIntentClassification`), `:86`

- **2026-09-20** — The Agent editor's Skills tab (`SkillsTab.tsx`) rendered
  "0 of 0" with no way to attach a skill whenever an agent had zero links,
  even though the workspace had skills — it only called `useAgentSkills`
  (`GET /agents/:id/skills`), which (per `server/INSIGHTS.md`) returns ONLY
  already-linked rows, never the workspace catalog. The catalog was one hook
  call away the whole time (`useSkills()` in `lib/hooks/skills.ts`, `GET
  /skills`) and the backend already supported attaching (`linkSkill`/
  `setSkills`) — this was a client-only gap. Confirmed against
  `specs/02-skills.md` D2 ("the mockup lists all six workspace skills") and
  the i18n copy `agents.json` `skills.orderHint` ("Toggle to **attach**") that
  the tab is supposed to show every workspace skill, not just linked ones.
  Fixed by merging both queries client-side
  (`SkillsTab/helpers.ts:mergeSkillsForAgent`). Any future tab that reads a
  `useAgent*` per-entity hook should check whether the entity is meant to
  show the FULL catalog (merge in the matching top-level `use<Thing>()` hook)
  before assuming the per-entity endpoint is already complete.

- **2026-09-18** — ESLint cannot enforce this module's folder boundaries on its
  own. `import/no-restricted-paths` matches the RESOLVED path, so it needs an
  import resolver to follow the `@/*` alias — and `eslint-import-resolver-typescript`
  pulls `unrs-resolver`, a native package pnpm 12 blocks behind
  `pnpm approve-builds`. Both were removed again. `dependency-cruiser` reads
  `tsconfig.json` directly, needs no resolver plugin, and is already the tool
  `server/` uses, so the boundary rules live in `client/.dependency-cruiser.cjs`
  (`pnpm arch`) and `eslint.config.mjs` is left to do only what the import graph
  cannot see: hook correctness and the `fetch` ban.

- **2026-09-17** — `<SeverityBadge compact>` renders an icon plus the count and
  nothing else — `Badge.tsx:80` drops the label in compact mode. So a compact
  chip has no accessible name, no tooltip, and no text for RTL to query: tests
  that `getByText("Warning")` fail, and a screen reader hears only a number.
  Any compact cluster must supply its own `title`/`aria-label`; ours does it in
  `components/severity-counts/SeverityCounts.tsx`.

## Codebase Patterns

- **2026-09-24** — Every failed mutation, and every query failure with status 0
  or 5xx, is already toasted globally, by `MutationCache.onError` and
  `QueryCache.onError`. A component that toasts its own error shows the same
  failure twice. Anything that polls a query through an outage raises one toast
  per failed tick. Rely on the global toast and stop polling on the first
  failure. `client/src/lib/providers.tsx:35-43`

- **2026-09-24** — A finding's `start_line`/`end_line` are always **new-file
  (head)** line numbers. reviewer-core grounds them only against each hunk's
  `newLineNumbers`. So anchor a finding in the diff to `RIGHT:n`, trying each n
  in `[start_line, end_line]`, and never fall back to `LEFT:n`: after a hunk
  shifts the numbering, a LEFT fallback pins the finding to an unrelated deleted
  line. Anything that does not match goes to the file's "unanchored" block.
  `client/src/components/diff-viewer/findings.ts` (`anchorFindings`),
  `reviewer-core/src/grounding.ts` (`buildLineIndex`)

- **2026-09-20** — This codebase's "run with a choice of modes" UI pattern is
  `Dropdown` (`vendor/ui/kit/Dropdown.tsx`) wrapping the ENTIRE trigger
  `Button` — clicking the button always opens the menu, there is no true
  split-button with separate click regions for "run the default" vs "open the
  menu". `RunReviewDropdown`
  (`app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/`) is the
  reference implementation: `Button` with `iconRight="ChevronDown"` as
  `Dropdown`'s `trigger`, `DropdownItemDef[]` items with `icon`/`hint`/
  `divider`. Its own component folder skips `helpers.ts` (no pure logic to
  extract) but keeps `constants.ts`/`styles.ts` (empty style map) for
  convention parity. Followed the same shape for the Conventions page's
  Re-scan button (`RunExtractionDropdown`, local/AI/both extraction modes).

- **2026-09-20** — `client/src/vendor/ui/nav.ts` lives under the "vendor,
  read-only" directory but is plain static data meant to be extended
  per-lesson, not a vendored component. Confirmed before editing it for the
  Conventions page: `client/src/components/app-shell/helpers.ts`'s
  `activeKeyFor` already had `if (pathname.includes("/conventions")) return
  "conventions";` waiting for a nav entry that didn't exist yet — check
  `activeKeyFor` for a dead case matching a new page before assuming a
  `nav.ts` edit is out of bounds.

## Tool & Library Notes

- **2026-09-24** — TanStack Query v5 keeps a query in `status: "error"` after a
  failed refetch (its data is kept) until a later fetch succeeds. `status ===
  "error"` alone therefore can't tell "the fetch I just triggered failed" from
  "this query failed at some point earlier". Compare
  `getQueryState(key).errorUpdatedAt` with the time your operation started.
  `client/src/lib/hooks/intent.ts:121`

- **2026-09-20** — A `useMutation`'s `mutationFn` given a JS default parameter
  (e.g. `(mode: ConventionExtractionMode = "both") => …`) does NOT make the
  resulting `mutate()` callable with zero arguments. `UseMutationResult.mutate`
  requires `variables` per the DECLARED parameter type, not JS default-param
  optionality — TanStack Query's generic inference doesn't unwrap it, so
  `mutate()` fails to typecheck ("Expected 1-2 arguments, but got 0"). Fix:
  drop the default from the function signature and pass the argument
  explicitly at every call site (`lib/hooks/conventions.ts`'s
  `useExtractConventions`, called as `extract.mutate("both")` from the empty
  state's CTA).

- **2026-09-18** — Two flat-config traps when touching
  `client/eslint.config.mjs`. (1) `eslint-plugin-react-hooks` is on v7, which
  ships the React Compiler rules (`static-components`, `use-memo`,
  `preserve-manual-memoization`, `capitalized-calls`, …) alongside the classic
  two; its `recommended-latest` preset turns them on, so the config enables
  `rules-of-hooks` and `exhaustive-deps` EXPLICITLY — "tidying" those two lines
  into the preset floods the tree. (2) `next build` prints "The Next.js plugin
  was not detected in your ESLint configuration" unless
  `@next/eslint-plugin-next` is in the config; its `recommended` set is enough
  and, unlike `core-web-vitals`, is correctness rather than performance. It paid
  for itself immediately — `no-html-link-for-pages` caught an `<a
  href="/settings/api-keys">` with a hand-rolled `preventDefault` +
  `router.push` in `AddRepoView.tsx`, which also broke middle-click.

## Recurring Errors & Fixes

- **2026-09-20** — An RTL test that does `fireEvent.change(select, …)` then
  immediately `fireEvent.click(actionButton)` in the next line can silently
  no-op the click if the button's `disabled` depends on a query that becomes
  `enabled` as a RESULT of that change (e.g. `useQuery(id, { enabled: !!id })`
  gated behind a picker). The change event synchronously flips the query to
  `isFetching: true` before the mock fetch's microtask resolves, so the button
  is still genuinely `disabled` at the moment of the very next `fireEvent`,
  and jsdom drops clicks on a disabled native element with no error. Fix:
  `await waitFor(() => expect(button).not.toBeDisabled())` between the two
  fireEvents. `LinkToAgentPanel.test.tsx` (agent picker → `useAgentSkills`).

## Session Notes

- **2026-09-20** — Added `LinkToAgentPanel` to `CreateSkillFromConventionsModal`
  (Conventions → Create skill flow): once every draft is saved, pick an agent
  and attach the new skill(s) via the same full-set-replace mechanism as the
  Agent editor's Skills tab (`useSetAgentSkills`) — previously the modal only
  called `POST /skills` and never linked the result to anything. Duplicated a
  small `appendSkillsToAgent` merge helper locally rather than importing
  `SkillsTab/helpers.ts`'s `mergeSkillsForAgent` (private `_components/`,
  cross-route import banned by `pnpm arch` — same tradeoff already documented
  in this modal's own `constants.ts` for `SKILL_NAME_PATTERN`).

- **2026-09-20** — Added `RunExtractionDropdown` to the Conventions page:
  local/AI/both mode picker for `POST /repos/:id/conventions/extract`,
  wired through `useExtractConventions`.

- **2026-09-20** — Fixed the Agent editor's Skills tab showing an empty,
  unattachable list for an agent with no linked skills; see What Doesn't Work.

- **2026-09-18** — Added `eslint.config.mjs`, `.dependency-cruiser.cjs` and the
  `lint`/`arch` scripts, wired both into `client.yml`. Both were green on the
  existing tree; each boundary rule was confirmed to fire against an injected
  violation first.

## Open Questions
