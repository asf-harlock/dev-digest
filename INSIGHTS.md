# Insights — repo root

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it, never edit it away.

**Scope:** this file holds only findings that cross package boundaries — the
shared contracts, the toolchain, CI, and the dev scripts. Anything scoped to a
single package lives in that package's file:
[`server`](server/INSIGHTS.md) · [`client`](client/INSIGHTS.md) ·
[`reviewer-core`](reviewer-core/INSIGHTS.md) · [`e2e`](e2e/INSIGHTS.md).

**Lifecycle:** when an entry hardens into a standing rule, move one line of it
into `CLAUDE.md` as a `NEVER`/`ALWAYS` directive and delete the entry here;
bulky reference material goes to `docs/` instead. This file is the staging
area, not the destination.

Sections are fixed — add to the one that fits, never invent a new heading.
Entry format: `.claude/skills/engineering-insights/reference/entry-format.md`.

## Decisions

### 2026-09-17 — Severity counters exclude dismissed findings

**What:** every per-severity count — the PR list's `findings_counts`, the
findings panel's chips, the timeline's run chips — skips findings with a
`dismissed_at`. Accepted findings still count.

**Why:** a counter answers "what still needs attention", and the repo had
already settled that question elsewhere: `ReviewRunAccordion.tsx:56` computes
its blockers as `severity === "CRITICAL" && !f.dismissed_at`. A second, looser
rule next to it would have made two numbers on the same screen disagree.

**Rejected:** counting everything the model produced. Simpler to aggregate (one
`IN`-query, no `isNull`) and it keeps the list row stable, but it contradicts
the blockers count sitting two lines below it on the detail page.

**Consequence worth knowing:** the panel still LISTS a dismissed finding, struck
through, while the counter above it excludes it. That asymmetry is deliberate —
the decision stays visible and reversible — and it is why `severityCounts()`
(`client/src/components/severity-counts/helpers.ts`) filters but
`visibleFindings()` does not.

## What Works

- **2026-10-02** — When the approved spec lives only on a docs branch (SPEC-07
  was on `docs/spec-07-pr-context`, not on `L05-homework`), `/run-plan` and the
  agents can't find `specs/NN-*.md`. Planning worked from
  `git show <branch>:specs/NN-*.md`. Execution worked from a copy at
  `.claude/sdd/SPEC-NN/spec.md` (git-ignored), named as the spec in every agent
  prompt, which leaves the tracked tree untouched. The spec still has to land on
  the implementation branch before the PR.

- **2026-09-16** — `main` is trimmed, but the lessons' code is still in git.
  Before building a lesson feature, look for a prior implementation:
  `git log -S '<identifier>' --oneline --all`. The Run Cost feature came back
  from the pair `93119a5` (added it) and `d45ab0d` (removed it) — together they
  held the schema change, the route aggregate, the component and the i18n keys.
  Cheaper and more faithful than re-deriving it from the design mockups.

## What Doesn't Work

- **2026-10-02** — A contract-first W1 whose plan names a contract without its
  fields ships shapes too narrow for the spec, and the gaps surface only once
  W2 consumers hit them. SPEC-07 needed a second contract pass for 4 gaps:
  `PrContextPreview` lacked kind/origin/tokens/read_at_sha (AC-42),
  `PrContextOrigin` couldn't express added vs modified (AC-2, and that needed
  migration 0018 for `pr_files.status`), `RunSummary` had no
  `context_fingerprint` (AC-38..40), and `ReadFileAtCommitResult` had no
  `not_utf8` (EC-7). Before launching W1, check every AC/EC that names a
  displayed or stored field against the plan's contract step, and list the
  fields explicitly.

- **2026-09-30** — Relaying a user's approval to a subagent does not let it edit
  `*/src/vendor/**`. The implementer's Edit on both `contracts/knowledge.ts`
  copies was denied by the permission system even with "the user authorised
  this" in the orchestrator's message, because an agent's word is not user
  approval. What worked: ask the user with `AskUserQuestion` in the main
  session, then resume the implementer, quoting that answer. Budget for this
  whenever a mid-run fix needs a contract field the plan didn't list (SPEC-05
  needed 3: `complexity`, `last_error_at`, `TourReadingStep.hotness`).

- **2026-09-24** — A realistic-looking fake secret in a fixture breaks the push,
  not the tests. `sk_live_51Hxxxx…` in a seed demo patch passed every gate and
  `/pr-self-review`. Then GitHub push protection rejected `git push`, because it
  scans **every pushed commit**, so a fix commit on top does not help. Rewriting
  history (`git filter-branch`) is blocked by Claude Code auto mode ("Git
  Destructive"), and a `!` run by the user silently did not apply. The way out
  was a new branch from the base with the final tree as one squashed commit; the
  old branch was renamed `backup/…`. Use the repo's short placeholders
  (`sk_live_xxx`, `ghp_xxx`) in any fixture from the start, since only the
  line's position matters. `server/src/db/seed.ts` (`src/config.ts` patch)

## Codebase Patterns

- **2026-09-29** — When a contract field gains `.default([])` in the server copy of
  `@devdigest/shared`, give the CLIENT copy `.optional()` and read `x ?? []`:
  `.default()` makes the inferred output type required, which broke two client
  helpers and ~15 test fixtures that build `Agent`/`Skill` literals (SPEC-04
  `context_paths`, `client/src/vendor/shared/contracts/knowledge.ts`).

- **2026-09-29** — There are **five** packages, not four: `mcp/`
  (`@devdigest/mcp`, npm, wired to `GET /pulls/:id/blast`) arrived in L04 with
  its own `CLAUDE.md` and `INSIGHTS.md`, but root `CLAUDE.md`'s module table
  and the `engineering-insights` "Which file" table did not list it. Anything
  that enumerates modules — spec placement, `routing.json`, insights lookup —
  must include `mcp/`, or `mcp/` work silently falls into the root bucket.
  `mcp/package.json`, `.claude/skills/pr-self-review/reference/routing.json`

- **2026-09-18** — All seven `<module>/docs/*.md` are deliberate 10-line stubs
  with one shape: `> **Stub.** Not written yet.` + **Purpose** + **What belongs
  here** + **What does not belong here**, each linked from a module `CLAUDE.md`
  "Read when" line. So a convention that seems missing is usually an unfilled
  stub, not a lost rule — and the stub's own *What belongs here* line is the spec
  for filling it, while its exclusion line ("nothing the module `README.md`
  already covers") is the scope limit. `client/docs/component-conventions.md` is
  the first one filled; the other six still hold the template.

- **2026-09-16** — No route anywhere in `server/src/modules/` declares
  `schema.response`, so the `@devdigest/shared` contracts are compile-time only
  on read paths — a response that violates its Zod schema is served, not
  rejected. Consequence when adding a field to a contract that describes a
  PERSISTED document (`RunStats` lives inside the `run_traces.trace` jsonb):
  use `.nullish()`, not `.nullable()`. `nullable()` still requires the key, so
  documents written before the field existed stop type-checking, while rows in
  a nullable DB column are fine with `.nullable()`.
  `server/src/vendor/shared/contracts/trace.ts`

## Tool & Library Notes

- **2026-10-01** — `/pr-self-review` via the Skill tool can load the USER-level
  `~/.claude/skills/pr-self-review` (a PrestaShop `dt review` skill) instead of
  this repo's `.claude/skills/pr-self-review` — same name, and the global one
  wins. It writes no `.claude/pr-self-review/report.md`, so the push/PR hook
  stays blocked. If the loaded skill mentions `dt`, PHPStan or `sites.json`,
  ignore it and run `.claude/skills/pr-self-review/scripts/collect-diff.sh`,
  `hard-rules.sh`, `run-gates.sh`, the reviewer fan-out, then `build-report.sh`.
  Also: `collect-diff.sh` counts untracked files, so stash run artifacts
  (`.claude/sdd/`, `.claude/workflow-retro/`, `.playwright-mcp/` — not ignored
  on `main`) before collecting.
  **2026-10-06:** hit again — the Skill tool still loads the user-level
  PrestaShop skill; read `.claude/skills/pr-self-review/SKILL.md` directly.
  The lasting fix is renaming the user-level skill (retro
  `.claude/workflow-retro/2026-10-06-pr-self-review-l05/report.md`, proposal 4).
  Correction: `.claude/workflow-retro/*/report.md`, `metrics.json` and
  `history.jsonl` are now committed (only `prompts/` and `reports/` are
  ignored), so they are not run artifacts to stash.

- **2026-09-29** — Claude Code transcripts (`~/.claude/projects/<cwd with /
  and . → ->/<session>.jsonl`, subagents in `<session>/subagents/agent-<id>.jsonl`
  + `.meta.json`) write one line per content block of an assistant message.
  All the lines share `message.id` and repeat the full `usage`, so summing
  usage per line inflates tokens several-fold: dedupe by `message.id` first.
  A failed Bash call is a `tool_result` with `is_error: true` and text starting
  `Exit code N`, but a gate piped through `| tail` exits 0, so read the output.
  `.claude/skills/workflow-retro/scripts/collect.mjs`

- **2026-09-29** — On the local Node (v26), `node --test <directory>` does not
  discover tests: it treats the directory as a module and fails with
  `MODULE_NOT_FOUND`, reported as one failing "test". Pass the file path
  (`node --test .claude/skills/spec-authoring/scripts/lint-spec.test.mjs`) or
  a glob. The `.claude/` skill scripts sit outside every package, so no
  `package.json` test script covers them; the command in the skill's
  `SKILL.md` is the only entry point.

- **2026-09-20** — Widening a `Provider`-shaped enum touches ~9 spots across
  both packages, and `pnpm --filter server exec tsc --noEmit` right after
  editing the FIRST one (`Provider` in `contracts/knowledge.ts`) finds the rest
  for free — every downstream site becomes a compile error, which is more
  reliable than grepping for the string `openai`. The full list, from adding
  `ollama`/`lmstudio`: `Provider` (both `knowledge.ts` copies),
  `ModelInfo.provider` + `LLMProvider.id` (`adapters.ts`, server copy only —
  the client copy of `LLMProvider.id` is a deliberate lag, see
  `client/CLAUDE.md`), `ConnTestProvider` + `SecretsStatus` (both
  `platform.ts` copies), `SECRET_KEY_BY_PROVIDER` (a `Record<ConnTestProvider,
  SecretKey>` total map in `server/src/modules/settings/constants.ts` — `tsc`
  refuses to compile it until every new enum member has an entry), the
  `agents.provider` DB column literal (`server/src/db/schema/agents.ts` — no
  migration SQL is generated since it is a `text` column with an app-level
  enum, not a Postgres `CHECK`/native enum), and two client `PROVIDER_OPTIONS`
  arrays (`CreateAgentModal/constants.ts`, `AgentEditor/.../ConfigTab/constants.ts`).
  One thing `tsc` will NOT catch: a Fastify route with no `schema.response`
  (see the `contracts/trace.ts` entry above) can return a payload whose shape
  changed without a compile error — a test asserting the exact object via
  `toEqual` only fails at test-run time. `server/test/settings-models.it.test.ts`
  had exactly this for `GET /settings/secrets-status`.

- **2026-09-20** — The shared vendor contract file `contracts/knowledge.ts`
  (both `server/` and `client/` copies) declares its symbols top-to-bottom as
  plain `const`s evaluated at module load. Referencing one (e.g. `Provider`,
  declared near the bottom under "Agents") from a `z.object()` built earlier
  in the file throws at import time (temporal dead zone) — `tsc` does not
  catch this for a same-file `const`-to-`const` reference. A new schema that
  needs `Provider`/`SkillType`/etc. must be placed textually AFTER that
  symbol's own declaration, regardless of which thematic section it
  "belongs" to.

- **2026-09-18** — Vitest 2's `--exclude` does **not** replace the built-in
  excludes, contrary to a claim that surfaces when reading its docs. Verified:
  `cd server && pnpm exec vitest list --exclude '**/*.it.test.ts'` lists 105
  tests, zero of them under `node_modules/`, and no `.it.test.ts`. So the line
  `server-unit.yml` inlines is correct as written and needs no file
  enumeration. `.github/workflows/server-unit.yml`

- **2026-09-18** — `while IFS=$'\t' read -r a b c` silently mis-assigns fields
  when a middle field is empty: tab is IFS *whitespace*, so two consecutive tabs
  collapse into one delimiter and everything after the gap shifts left. `jq
  @tsv` emits exactly that for a null column. Emit a placeholder and translate
  it back — `((.log // "") | if . == "" then "-" else . end)` — rather than
  trusting `read` to preserve empties.
  `.claude/skills/pr-self-review/scripts/run-gates.sh`

- **2026-09-18** — `awk -v re="$pat"` processes escape sequences in the value, so
  a regex like `sql\.raw\(` arrives as `sql.raw(` and awk then dies with
  `illegal primary in regular expression`. Pass patterns through the environment
  instead: `PAT="$pat" awk 'BEGIN{p=ENVIRON["PAT"]} $0 ~ p'`.
  `.claude/skills/pr-self-review/scripts/hard-rules.sh`

## Recurring Errors & Fixes


- **2026-09-26** — `pr-self-review`'s `hard-rules.sh` has two false-positive
  CRITICALs that block pushes of correct code. (1) `client-fetch` greps
  `(^|[^.\w])fetch\(`, but in POSIX ERE `\w` inside brackets is literal, so
  `refetch()` matches. Rename it (`refetch: retry`) rather than overriding.
  (2) `private-underscore-import` flags `modules/<x>/routes.ts` importing
  `../_shared/…`. That import is legitimate (a sibling under the `_shared`
  parent, and `pnpm arch` passes), and every route needs `getContext`, so only
  `# psr-skip` with the reason gets it through. `homework-to-main` also fires on
  every `L0x-homework` branch even when the PR targets the fork's `main`.
  `.claude/skills/pr-self-review/scripts/hard-rules.sh:227,285,343`

- **2026-09-18** — A tool that writes its output *inside* the repo and also
  reads `git ls-files --others --exclude-standard` will consume its own output:
  the first run's artefact is untracked, so the second run folds it into the
  diff and the byte count grows every time. Symptom here was a change set
  reporting 19 216 diff lines for a 43-file change, tripping a size threshold.
  Add the output directory to `.gitignore` **before** the first run. Note the
  matching gitignore trap: a negation cannot re-include a file inside an
  excluded *directory* — use `dir/*` plus `!dir/keep.json`, not `dir/` plus the
  negation. `.gitignore:25-26`

## Session Notes

- **2026-10-06** — L05 review fixes (PR #21): workflow-retro gained topology
  proposals and a committed ledger; `/run-plan` now ends with
  `/workflow-retro`; `/pr-self-review` reviewers write their own replies and
  `build-report.sh` fails on a missing or corrupt one. Noted the pr-self-review
  shadowing recurrence.

- **2026-10-02** — SPEC-07 PR Context via `/run-plan --tests`: planner (2
  phases) → W1 → W2a ∥ W2c ∥ W2d → W2b → contract-gap pass (+ migration 0018)
  → test-writer → verify #1 (7 Fails fixed) → 3 reviewers (1 WARNING, fixed) →
  verify #2 → Playwright. Migrations 0017/0018 broke the running pulls list
  (`column "context_paths" does not exist`) until `pnpm db:migrate`. Entries:
  root What Works (spec on another branch), root What Doesn't Work (narrow W1
  contracts), `server/` Open Questions (injection false positive).

- **2026-10-01** — Landed SPEC-04/05/06 on `main` ahead of their code
  (PR #17; specs must be on the base branch for PR review), fixed the brief's
  spec budget, drafted SPEC-07 PR Context (spec-creator → researcher ×2 ∥).
  In zsh, quote git pathspec globs (`git checkout B -- 'specs/04-*'`): unquoted,
  zsh expands against the current tree and aborts with "no matches found".
  Entries: root Tool Notes (pr-self-review shadowing), `server/` Recurring
  Errors (spec size gates), `server/` Codebase Patterns (fetchPullHead, token URL).

- **2026-09-29** — SPEC-04 Project Context (approved): spec-creator (Opus,
  2 phases) → researcher ×2 ∥ → answers → draft → lint → approved. Then
  spec-creator lost its web/Figma tools (research only via `researcher`) and
  the `workflow-retro` skill was added. Entries: root Tool Notes (transcript
  usage dedupe), `server/` Codebase Patterns (clone is a reset mirror).

- **2026-09-26** — Blast Radius (L04 homework): `GET /pulls/:id/blast`, the
  Overview block (tree + mermaid graph + degraded states) and a real
  `get_blast_radius` MCP tool. Pipeline: Explore ×3 → planner → implementer ×2 ∥
  → test-writer ×2 ∥ → architecture-reviewer ∥ plan-verifier ∥ security-reviewer,
  then 3 `/pr-self-review` rounds. Entries: root Recurring Errors (hard-rules
  false positives), `server/` Codebase Patterns ×2.

- **2026-09-24** — Smart Diff (L03), built through the subagent pipeline:
  researcher ×3 → planner → implementer ×2 in parallel → architecture-reviewer ∥
  plan-verifier, then 4 `/pr-self-review` rounds down to 0 agent findings. The
  L02 homework agent and skills were also seeded. Entries: What Doesn't Work
  (fake secret vs push protection), `e2e/` Tool Notes (agent-browser), `client/`
  Codebase Patterns (new-side finding anchoring). PR #10.

- **2026-09-18** — `pr-self-review` skill: routes the open diff onto the repo's
  own skills, runs the matching gates, blocks `gh pr create` on any CRITICAL via
  a `PreToolUse` hook in a new `.claude/settings.json`. Deterministic rules live
  in `scripts/hard-rules.sh`, judgement in the per-bucket subagents; the
  dividing line is whether the diff alone settles it.

- **2026-09-18** — Sprint 1 of the improvement plan: `pnpm lint` + `pnpm arch`
  now exist in BOTH `server/` and `client/` and run in `server-unit.yml` /
  `client.yml`; server migration `0011` adds the seven missing FK/filter
  indexes. Both boundary checks passed on the untouched tree, so they are a
  ratchet against new violations, not a cleanup.

- **2026-09-18** — Naming conventions + lock-file rule. Root `CLAUDE.md` gained a
  `## Naming` section and two `Do not touch` lines (lockfiles are regenerated by
  each directory's own manager; no root `package.json` exists). The client's
  kebab-folder-vs-PascalCase-folder split was undocumented and went into
  `client/CLAUDE.md` + `docs/component-conventions.md`.

- **2026-09-17** — Findings-by-severity (PR list column + panel filter +
  timeline chips). Written fresh, but `git log -S severityCounts --all` still
  paid off: `7641b48`/`97b6edc`/`0953fdc` served as the design spec.

- **2026-09-16** — Run Cost (server + client + shared contracts): recovered the
  reverted implementation from git history, re-threaded `costUsd` end to end.

## Open Questions
