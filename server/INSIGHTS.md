# Insights — @devdigest/api

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it, never edit it away.

**Scope:** only what applies to `@devdigest/api`. Findings that cross package boundaries
go in the repo-root `INSIGHTS.md`.

**Lifecycle:** when an entry hardens into a standing rule, move one line of it
into `CLAUDE.md` as a `NEVER`/`ALWAYS` directive and delete the entry here;
bulky reference material goes to `docs/` instead. This file is the staging
area, not the destination.

Sections are fixed — add to the one that fits, never invent a new heading.
Entry format: `.claude/skills/engineering-insights/reference/entry-format.md`.

## Decisions

### 2026-09-20 — Injection detection is computed live from `body`, never stored

**What:** `Skill.injection_flagged`/`injection_patterns` are NOT columns —
`detectInjectionPatterns(body)` (`modules/_shared/injection-detection.ts`) runs
on every read (`toSkillDto`, `toAgentSkillDetail`) and on every
create/update, where a flagged body forces `enabled: false` server-side
regardless of what the caller asked for (`SkillsService.create`/`update`).

**Why:** the same reasoning as `token_estimate` (also computed live, never
stored): a stored flag can go stale relative to the body it describes — edit
the body to remove the injected text and a stored `true` would linger; edit it
to add some and a stored `false` would miss it. Computing it live makes both
directions self-correcting with no migration, no backfill, and no separate
"re-scan" action. Enforcement piggybacks on the EXISTING
`agent_skills.enabled AND skills.enabled` gate in
`enabledSkillsForPrompt` (`modules/agents/repository.ts`) — forcing
`skills.enabled = false` is sufficient on its own to keep a flagged skill out
of every agent's prompt, so no `agents` module changes were needed for
enforcement, only for the DTO field parity noted below.

**Rejected:** a persisted `injection_flagged` column set once at import time —
would need a migration, a backfill for skills that already exist, and an
explicit re-check action for every future body edit; the live-compute version
needed none of those and cannot drift.

## What Works

## What Doesn't Work

- **2026-09-23** — `GET /repos/:id/context` ("Project Context" specs) has a
  CLIENT hook calling it (`client/src/lib/hooks/core.ts:126`,
  `queryFn: () => api.get<SpecFile[]>(...)`) but **no server-side
  implementation at all** — no `modules/context/`, no route registered in
  `modules/index.ts`, nothing. `repo-intel` indexes code symbols, not markdown/
  specs, so it isn't a hidden implementation either. Found while scoping Intent
  Layer's "plan/spec" data source (`specs/03-intent-layer.md`), which had to
  drop that source to "not yet available" rather than build against a route
  that doesn't exist. Confirm with `grep -rn "SpecFile" server/src client/src`
  before assuming this feature is live in a future session.
  **Fixed 2026-09-29 (SPEC-04):** `modules/context/` now serves `GET /repos/:id/context`,
  `GET .../context/file` and `POST .../context/rescan`; the client hook returns
  `ContextListing`, not `SpecFile[]`.

## Codebase Patterns


- **2026-10-06** — `pnpm arch` does not catch an adapter importing from
  `modules/`: `.dependency-cruiser.cjs` has no `src/adapters` → `src/modules`
  rule. SPEC-07's `simple-git.ts` importing PR-context limits from
  `modules/_shared` passed `arch` and was caught only by the architecture
  reviewer (fixed by injecting the limits through `platform/container.ts`,
  see `adapters/git/simple-git.ts:43`). `adapters/astgrep/index.ts:25` still
  imports `modules/repo-intel/constants.js`, so a new rule needs a `pathNot`
  for it. Until then, check adapter imports by hand.

- **2026-09-29** — The repo clone is a throwaway read-only mirror, not a
  working copy. `SimpleGitClient.sync()` runs `reset --hard origin/<branch>`
  on every resync, so any file written into the clone (an "edit this doc"
  feature, a generated file) is silently lost. The PR head exists only as the
  local ref `pr-N` (`fetchPullHead`), never as the worktree. `readFile(repo,
  path)` is a bare `join(clonePath, path)` with no containment check, so a
  feature that reads a user-chosen path must reject `..`, absolute paths and
  symlinks itself (precedent: `repo-intel/pipeline/walk.ts:89`).
  `server/src/adapters/git/simple-git.ts:77-88,129-131`
  **2026-10-01** — `fetchPullHead` has no caller, and its refspec
  `pull/N/head:pr-N` lacks `+`, so a re-fetch after a force-push fails
  `non-fast-forward` (rc=1). `git fetch origin <sha>` (no local ref) works
  against GitHub in ~0.8 s and avoids it. The clone's `origin` URL embeds the
  token (`https://x-access-token:…@github.com/…`): never log the remote URL or
  raw git stderr unredacted. Verified on scratch clones for SPEC-07.

- **2026-09-26** — A module that maps another module's facade result cannot
  type its `helpers.ts` with that result's type. `no-cross-module-import` blocks
  `import type` from `../repo-intel/types.js` (`tsPreCompilationDeps: true`), and
  `pure-helpers-stay-pure` separately blocks `helpers.ts` from reaching
  `platform/container.ts` (so `Container['repoIntel']` is out too). What passes
  both is a structural mirror interface in `helpers.ts`, fed by an **uncast**
  `container.repoIntel.…()` call in `service.ts`. That call site is the only
  place drift is caught, so never cast it. `server/src/modules/blast/helpers.ts`
  (`BlastFacadeResult`), `server/.dependency-cruiser.cjs`
  **2026-09-30** — moved to `server/src/modules/_shared/blast-map.ts` (SPEC-06),
  so `brief/` can reuse it too. `blast/helpers.ts` no longer exists, but comments
  in `repo-intel/service.ts:530,768` still cite it.

- **2026-09-30** — A `ProjectContextEntry` that can be used has
  `status: 'attached'`. There is no `'ok'` status, and a plan assumed one. When
  the repo is not cloned, `resolveProjectContext` does not return `[]`. It
  returns entries marked `unreadable` with empty `text` (`failAll()`). Before
  building a prompt section, filter to `attached` entries with non-empty text,
  or an empty `wrapUntrusted` block gets emitted.
  `server/src/modules/_shared/project-context.ts:310,340`


- **2026-09-26** — `repoIntel.getBlastRadius` returns a thinner result than its
  types suggest in two cases. (1) The ripgrep fallback is always `degraded:true,
  reason:'no_data'` and has no `factsByFile`, so there are no crons and no
  per-symbol endpoints. The seeded demo repo has `clonePath: null`, so it always
  lands here with empty arrays, and a blast e2e can only assert the degraded
  state. (2) The persistent path caps callers with
  `slice(0, MAX_CALLERS_PER_SYMBOL)` over the **whole** list, not per symbol, so
  a PR with many changed symbols can starve later symbols of callers. The facade
  was left as it is. `server/src/modules/repo-intel/service.ts:228-237,386`,
  `server/src/db/seed.ts:145`

- **2026-09-25** — Bad input on any `schema.querystring`/`params`/`body` fails
  with **422** and `error.code: "validation_error"`, never 400
  (`server/src/app.ts:115-119`). If a route contract asks for 400, get it
  changed to 422. The alternative is hand-validating in the handler and
  throwing `AppError(…, 400)`, which was tried on the L04 lookup routes and
  reverted, because no other route does that. A client of the API has to treat
  400 and 422 alike (`mcp/src/api-client.ts`).
  `server/src/modules/repos/routes.ts` (`RepoLookupQuery`)

- **2026-09-20** — `container.buildLlm`'s "throw `ConfigError` if the secret key
  is missing" guard is a cloud-provider-only rule. For a keyless, local,
  OpenAI-compatible provider (added for Ollama/LM Studio), the right shape is:
  read a base-URL "secret" through the same `SecretsProvider` chokepoint, fall
  back to a hardcoded `localhost` default when unset, and construct the
  adapter unconditionally — no `ConfigError`, no reachability preflight.
  Every caller already catches and degrades (`agents/service.ts listModels` →
  `[]`, `settings/routes.ts test-connection` → `{ ok: false }`), so an
  unreachable local server surfaces naturally on the first real call instead
  of needing a second check. `server/src/platform/container.ts` (`buildLlm`),
  `server/src/adapters/llm/local-openai-compatible.ts`.

- **2026-09-20** — `server/CLAUDE.md`'s "Declare `schema.body`/`schema.params`
  — do not hand-roll `Schema.parse(req.body)`" has an established, deliberate
  exception: a POST route whose body must tolerate being entirely absent (no
  Content-Type, no payload). `reviews/routes.ts`'s `POST /pulls/:id/review`
  does NOT put `body` in the Fastify route schema at all — it parses manually
  inside the handler, `RunRequest.parse(req.body ?? {})`, with a comment
  explaining why ("both fields optional; empty body is OK"). Fastify's own
  body-schema validation rejects a genuinely empty POST body before the
  handler ever runs, which the manual-parse-with-default pattern avoids.
  Reused verbatim for `POST /repos/:id/conventions/extract`'s new optional
  `{ mode }` body (`modules/conventions/routes.ts`). Any new POST route that
  needs to work with zero body should follow this shape, not put an
  `.optional()` object in `schema.body`.

- **2026-09-20** — `skills.evidenceFiles` (jsonb) sat in the DB schema and was
  read by the DTO helper, but was never accepted by `CreateSkillBody`/
  `UpdateSkillBody`, carried by `InsertSkill`/`UpdateSkillPatch`, or written by
  `repository.ts`'s `insert`/`update` — a column that looks wired end-to-end
  because the DTO layer touches it while the write path never did. Found while
  wiring the Conventions feature's skill-drafting flow, which needed
  `evidence_files` to actually persist. Check all three layers
  (routes/service/repository) before assuming a schema column is live, not
  just the schema file. `server/src/modules/skills/{routes,service,repository}.ts`

- **2026-09-20** — `pnpm arch` blocks a module's service/repository from
  importing another module's non-`_shared` file, even for a small, obviously-
  safe read — importing `settings/feature-models.ts`'s
  `getFeatureModelOverride` from `conventions/repository.ts` was flagged. The
  established escape hatch is a repository querying another module's table
  directly (`SkillsRepository` already does this for `agents`/`findings`);
  `ConventionsRepository` does the same for `settings` — it re-reads
  `feature_models` + `FeatureModelChoice.safeParse` itself rather than
  importing the helper. `server/src/modules/conventions/repository.ts`
  **2026-09-23** — now a THIRD copy: `reviews/repository/pull.repo.ts`'s
  `getFeatureModelOverride` (added for Intent Layer, `specs/03-intent-layer.md`)
  is the same re-query shape again, plus a fourth wrinkle —
  `reviews/constants.ts`'s `INTENT_FALLBACK_PROVIDER`/`INTENT_FALLBACK_MODEL`
  hand-mirror `FEATURE_MODELS`'s `review_intent` registry entry
  (`contracts/platform.ts`) by convention only, not by the type system. `pnpm
  arch` cannot see this drift risk — dependency-cruiser checks import edges,
  not logic duplication. Before adding a fourth "read `feature_models[id]`"
  copy, check whether a shared helper in `modules/_shared/` (the pure-function
  escape hatch two entries below) is now worth it instead of a fifth copy. A
  guard test now pins the review_intent case:
  `server/test/reviews-helpers.test.ts` (`INTENT_FALLBACK_PROVIDER/MODEL
  mirrors FEATURE_MODELS`) — copy that pattern for any other feature-model
  fallback constant.
  **2026-09-30** — `brief/repository.ts` is a fourth copy: SPEC-06's plan
  first called `resolveFeatureModel` from `settings/feature-models.ts`, and the
  cross-model review caught it as a `no-cross-module-import` blocker before
  code was written. A shared `_shared/` resolver is now overdue.

- **2026-09-20** — Same `no-cross-module-import` rule, other escape hatch: when
  the thing two modules need is a PURE FUNCTION over data both already hold
  (not a query), re-querying isn't an option and duplicating the function is
  worse (it can drift, like the `@devdigest/shared` vendor copies). Move it to
  `modules/_shared/` instead — `skills` (computing `Skill.injection_flagged`)
  and `agents` (`toAgentSkillDetail`, which maps `AgentSkillDetail extends
  Skill`) both needed the identical prompt-injection detector over a skill
  body; it now lives in `modules/_shared/injection-detection.ts` and both
  import it. `_shared` already held two things in this shape (`context.ts`,
  `schemas.ts`) before this — check there before reaching for either the query
  duplication pattern above or a straight cross-module import.

- **2026-09-19** — Two "enabled" flags on the skills feature have OPPOSITE
  version-bump behavior and are easy to conflate. Toggling `skills.enabled`
  (the skill's own global kill-switch) bumps nothing on the skill itself
  (`SkillsRepository`, spec D2/§5.2). Toggling `agent_skills.enabled` (the
  per-agent link flag) via `linkSkill`/`unlinkSkill`/`setSkills` ALWAYS bumps
  the agent's version and snapshots it (spec §7.3) — there is no toggle-only
  exception on the agent side. A change that touches only one of the two
  tables can look identical in a diff but differ in whether it produces a new
  `agent_versions` row. `server/src/modules/agents/repository.ts`

- **2026-09-19** — `AgentsRepository.skillIdsForAgent(agentId)` returns only
  `agent_skills.enabled = true` links, not every linked skill — narrower than
  its name suggests. That's deliberate: it is called ONLY by `snapshotVersion`
  (verified via grep before narrowing it), and `AgentVersionConfig.skills` must
  record "the ids of the links that were enabled when the snapshot was taken"
  (spec §5.3). `linkedSkills(agentId)` is the one that returns every link
  (enabled or not) with its own `enabled` flag — call that one for anything
  that needs to render disabled links (e.g. the Skills tab).
  `server/src/modules/agents/repository.ts`

- **2026-09-19** — `agent_run_skills.order` is the index in the RESOLVED,
  already-filtered list of enabled skills (0, 1, 2…) that
  `enabledSkillsForPrompt` returned — not the original `agent_skills.order`
  column. The two diverge as soon as any link in between is disabled (e.g.
  links at order 0/1/2/3 with #1 disabled record as order 0/1/2 against
  skills #0/#2/#3). Querying "what order was this skill originally linked at"
  needs `agent_skills.order`, not `agent_run_skills.order`.
  `server/src/modules/reviews/run-executor.ts`,
  `server/src/modules/reviews/repository/run.repo.ts`

- **2026-09-18** — `server/CLAUDE.md`'s "Reading `process.env` for a key is
  banned" is true of application code but `platform/config.ts` is not the only
  file that touches the environment, and the other four are all legitimate:
  `adapters/secrets/local.ts:21` takes `process.env` as an injectable
  constructor default (that IS the secrets chokepoint, and tests pass a fake
  env); `adapters/git/simple-git.ts:33-34` WRITES `GIT_TERMINAL_PROMPT` /
  `GCM_INTERACTIVE` so git subprocesses inherit them; `db/migrate.ts:38` and
  `db/seed.ts:228` read `DATABASE_URL` inside their `import.meta.url ===
  process.argv[1]` CLI blocks. `pnpm lint` enforces the ban with
  `no-restricted-syntax` and names exactly these four as `ignores` in
  `eslint.config.mjs` — a fifth reader is a real violation, not a missing
  exception.

- **2026-09-18** — `server/CLAUDE.md`'s "Layer duties are strict … no raw SQL
  and no HTTP inside a service" describes the intent, not the tree. Eight files
  query the DB outside a repository — `pulls/routes.ts`, `polling/routes.ts`,
  `workspace/routes.ts`, `settings/routes.ts`, `settings/feature-models.ts`,
  `repos/helpers.ts`, `reviews/diff-loader.ts`, `reviews/run-executor.ts` — and
  `pulls`, `polling` and `workspace` have no `service.ts`/`repository.ts` at
  all, so their handlers go straight from URL to SQL. `repos/helpers.ts`
  imports `db/schema.js` under a docblock promising "pure functions only".
  These are allowlisted in `server/.dependency-cruiser.cjs`; `pnpm arch` is
  green on the current tree, so any NEW violation is yours. Copying the shape of
  `pulls/routes.ts` for a new endpoint will fail that check.

- **2026-09-17** — `CLAUDE.md`'s "Every table still carries `workspace_id`" is
  not literally true. On the review path only `reviews`, `pull_requests`,
  `agent_runs` and `multi_agent_runs` have the column; `findings`, `pr_intent`,
  `pr_brief`, `pr_files`, `pr_commits` and `run_traces` have none
  (`src/db/schema/reviews.ts:28`, `pulls.ts:35`, `pulls.ts:47`, `runs.ts`).
  They are tenant-scoped only through their parent FK
  (`findings.review_id -> reviews.workspace_id`), so a
  `select().from(t.findings)` with no join to `reviews` reads every workspace
  even though the handler called `getContext()`.

- **2026-09-17** — There is no `score` column on `pull_requests`
  (`src/db/schema/pulls.ts:8-28`, `migrations/0000_init.sql:241-259`). A PR's
  score lives on `reviews.score` (`schema/reviews.ts:23`) and `agent_runs.score`
  (`runs.ts:31`) and has to be joined in. The mistake is invisible to the
  compiler when the query goes through `db.execute(sql.raw(...))`:
  `pnpm typecheck` stays green and Postgres fails at runtime with `42703 column
  does not exist`. The only raw SQL in `src/` is
  `modules/repo-intel/repository.ts:402-406`, and it is parameterised — a new
  raw query needs an `*.it.test.ts` to prove its columns exist.

- **2026-09-17** — A "deliberately not implemented" comment in a route can be
  stale scaffolding, not a decision. `pulls/routes.ts` said the per-severity
  FINDINGS breakdown was "intentionally not surfaced on the list", while
  `rollupSeverities` sat 40 lines away in `pulls/status.ts:23` — exported,
  unit-tested (`test/pulls-status.test.ts:52`), called by nothing, and with a
  module docblock describing that exact breakdown. Before writing a new
  aggregation, grep the module for an unused pure helper: the starter ships
  them ahead of the lesson that wires them up. **2026-09-17, same file:** the
  cost block's comment asserted "latest completed run" as if it were the spec —
  it was the starter's guess, and the user wanted the SUM of every done run.
  Treat a rollup comment in `pulls/routes.ts` as a description of the code, not
  as a product decision: the list's aggregation WINDOW (latest vs all) is never
  written down anywhere, so confirm it before extending a column.

- **2026-09-16** — `completeAgentRun`'s value type is declared TWICE and the two
  copies are not linked: the `ReviewRepository` facade re-types the whole object
  literal (`src/modules/reviews/repository.ts:151`) around the real
  implementation (`src/modules/reviews/repository/run.repo.ts:142`). Adding a
  field to only one of them compiles at the call site and fails at the facade.
  Expect the same shape for other repository methods re-exported through that
  facade.

  **2026-09-23** — the facade's `upsertIntent`/`getIntent` (extended for
  Intent Layer) sidestepped this by using direct pass-through delegation
  (`return pullRepo.upsertIntent(this.db, prId, intent, meta)`) instead of
  re-typing the object literal — adding a field to `pull.repo.ts`'s signature
  needed no matching facade edit. Prefer pass-through delegation over re-typing
  for any NEW facade method; the re-typing shape above is legacy, not the
  pattern to copy.

## Tool & Library Notes

- **2026-10-03** — `js-tiktoken` (`TiktokenTokenizer`, cl100k) is quadratic
  on a long run of one repeated character: counting 8 KB of `'x'` takes 3.1 s,
  80 KB of prose 5 ms. A fixture like `'x'.repeat(80 * 1024)` sent through any
  route that token-counts (context preview, listing) hangs past vitest's 120 s
  timeout. Build size fixtures from prose lines
  (`'Lorem ipsum dolor sit amet.\n'.repeat(n)`). A real minified or one-line
  doc near the 64 KB / 256 KB caps hits the same cliff — nothing guards it yet.
  `server/src/adapters/tokenizer/index.ts`, `server/test/context.it.test.ts`

- **2026-09-30** — An LLM call cannot be cancelled. `StructuredRequest` has
  `timeoutMs` but no `signal` (`vendor/shared/adapters.ts:55-62`). The
  adapters apply `timeoutMs` per attempt, through a non-cancelling
  `withTimeout` race inside the `maxRetries+1` loop (`adapters/llm/openai.ts:88-110`),
  so one `completeStructured` can run for about 3 × `timeoutMs` plus transport
  retries. A `Promise.race` deadline on top frees the caller, not the HTTP
  request. For an in-memory per-key lock, this means releasing the lock when
  the deadline fires lets a second paid call start while the first is still
  running. Hold the lock until the underlying promise settles, and discard a
  late result with an expired flag (`brief/service.ts` `withDeadline`).
  `onboarding-tour/service.ts:48-58` still releases at the deadline.
  **Correction 2026-10-03:** OpenRouter (`reviewer-core/src/llm/openrouter.ts`,
  the provider most features use) ignored `timeoutMs` entirely until now. Its
  SDK client has a fixed 90 s timeout with 2 SDK retries, so every call was cut
  at 90 s per attempt, whatever the caller asked. The onboarding tour reported
  "Model call timed out" at its 120 s deadline while the model never got more
  than 90 s. It now passes `{ timeout: req.timeoutMs }` per request. When a
  timeout looks wrong, check the provider's SDK client options first.

- **2026-09-18** — Two dependency-cruiser settings decide whether `pnpm arch`
  (`server/.dependency-cruiser.cjs`) checks anything at all, and both fail
  SILENTLY with a green "no dependency violations found". (1) Listing
  `node_modules` in `options.exclude` drops external modules from the graph, so
  every rule about an npm package (drizzle-orm, fastify, the SDKs) stops
  matching — keep `doNotFollow: { path: 'node_modules' }` for speed and restrict
  `exclude` to `clones`/`dist`. (2) Without
  `options.tsPreCompilationDeps: true`, `import type { … }` crossings are
  invisible, which is most of the boundary traffic in this codebase. Third trap,
  this one loud: on a circular rule `viaNot: 'X'` ("no module in the cycle
  matches X") is NOT the same as the documented-looking `via: { pathNot: 'X' }`
  ("some module does not match X") — the latter is true of nearly every cycle.
  Verify any rule change by injecting a violation and re-running, not by reading
  a green result.

## Recurring Errors & Fixes

- **2026-10-06** — Both server CI jobs are red on `main` (since at least
  `d221e56`), so a red server check on a PR is not proof the PR broke it —
  compare with `main`'s latest run first. "server unit":
  `test/project-context.test.ts` "NFR-2: 500 files x up to 32 KB list +
  tokenize well under 2 s" takes 4.3–5.4 s on the GitHub runner and passes
  locally. "server integration": the four `skills-stats.it.test.ts` 422s from
  the 2026-09-25 Open Question. Runs `37129525090` (main), `37520981158` (PR #21).

- **2026-10-01** — The brief says "No spec documents were available — attach
  Project Context docs" even though a doc IS attached: the doc was skipped
  whole, not missing. Two size gates drop real specs silently: the brief's
  `SPEC_DOCS_TOKEN_BUDGET` (was 4 000; this repo's specs are 6–10k tokens;
  raised to 10 000 in 97b8614, and the message now names the skipped doc) and
  `MAX_CONTEXT_FILE_BYTES` = 32 KB (`_shared/context-paths.ts:18`), which still
  rejects `specs/06-pr-brief.md` (34 962 B) as `too_large` for any agent.
  Diagnose by token-counting the file with `TiktokenTokenizer` and `wc -c`
  before reading resolver code. SPEC-07 gives PR context a 64 KB cap.
  **Fixed 2026-10-03 on `fix/context-large-docs`: `MAX_CONTEXT_FILE_BYTES` is
  64 KB, and the preview reads up to `MAX_CONTEXT_PREVIEW_BYTES` (256 KB) so a
  too-large doc still renders, marked `too_large`.**

- **2026-09-17** — `Run failed: 401 User not found.` mid-agent-run is OpenRouter
  rejecting the key, not a bug in the run pipeline. `container.buildLlm` only
  checks that the secret is a non-empty string
  (`src/platform/container.ts:183`), so `Resolving openrouter provider done
  (0ms)` proves nothing — the first real auth happens in
  `chat.completions.create`. Confirm in one call before reading any code:
  `curl -H "Authorization: Bearer $KEY" https://openrouter.ai/api/v1/key`.
  A valid key is `sk-or-v1-` + 64 lowercase hex (73 chars); anything longer or
  mixed-case came from another service. Side effect of a bad key: `PriceBook`
  swallows the 401 (`container.ts:143`) and silently falls back to the static
  price table, so costs still render.

## Session Notes

- **2026-10-06** — L05 review fixes (PR #21): `onboarding.head_sha` column
  (migration 0019, backfilled from `json->meta->index_sha`), staleness read
  from it. Recorded the adapters → modules `arch` gap and the red-on-main CI.

- **2026-10-03** — Onboarding tour "Last regeneration failed": the OpenRouter
  adapter ignored `timeoutMs` (fixed), and the tour timeout was raised to 180 s
  (SPEC-05 NFR-2). Corrected the 2026-09-30 LLM-timeout entry.
- **2026-10-03** — Raised the agent/skill attach cap to 64 KB and made
  oversized docs previewable (SPEC-04 EC-4/EC-11 amended, EC-27/EC-28 added).
  Found the tiktoken repeated-character cliff via a timed-out fixture.
- **2026-09-30** — SPEC-06 PR Brief built via `/run-plan`. It added the
  `brief/` module (GET/POST `/pulls/:id/brief`, atomic jsonb-merge cache in
  `pr_brief.json`). It moved `linked-issue`, `smart-diff-roles`, `blast-map`
  and `hunk-headers` into `_shared/`. There are no brief tests yet
  (test-writer was off). See Tool & Library Notes and Codebase Patterns.

- **2026-09-23** — Built the full Intent Layer feature (`specs/03-intent-layer.md`):
  `pr_intent`/`findings` schema extension (migration `0015`), the
  `intent-classifier.ts` module (cheap-model `completeStructured` call,
  hunk-header-only diff digest, linked-issue resolution, never-fabricate
  fallback sourcing), `POST /pulls/:id/intent`, a new `reviewer-core`
  `PromptParts.intent` slot, a deterministic scope filter over findings
  (`applyScopeFilter`/`findingMatchesOutOfScope`, gated by the agent's own
  `ciFailOn` threshold), and the client `IntentCard` on the PR Overview tab.
  `review_intent`'s `FEATURE_MODELS` default changed to a cheap OpenRouter
  flash model. See Codebase Patterns / What Doesn't Work above for the two
  non-obvious findings from this session.

- **2026-09-20** — Added local LLM provider support (Ollama + LM Studio):
  new `LocalOpenAICompatibleProvider` adapter, `container.buildLlm` branch,
  `Provider`/`ConnTestProvider`/`SecretsStatus` widened in both vendor copies,
  `agents.provider` schema enum widened (no migration needed), Settings API
  Keys panel gained URL-mode rows, client `PROVIDER_OPTIONS` updated in two
  places. See Codebase Patterns and root `INSIGHTS.md` for the reusable parts.

- **2026-09-20** — Added extraction-mode support (`local`/`ai`/`both`) to the
  conventions module: `mode` column + nullable `provider`/`model` on
  `repo_convention_scans` (migration `0014`), `extractLocalCandidates`
  (config-file rule parsing, no model call) in `conventions/helpers.ts`, and
  `POST /repos/:id/conventions/extract` now takes an optional `{ mode }` body.
  Follow-up fix same session: `findConfigFiles` originally probed
  `CONFIG_FILENAMES` only at the clone's true root, so `local` mode found
  nothing on this repo itself — `tsconfig.json`/`eslint.config.*` live inside
  `server/`/`client/`/etc., never at the repo root, since this is a
  multi-package repo with no root `package.json` (root `CLAUDE.md`). Fixed by
  also probing one level into every top-level directory
  (`CONFIG_SEARCH_SKIP_DIRS` in `conventions/constants.ts`). Any future
  root-only file probe in this codebase should ask whether the target repo
  shape (single-package vs. this repo's four-standalone-packages layout)
  actually has what it's looking for at the root.

- **2026-09-19** — Built the full Skills feature (`specs/02-skills.md`): the
  `skills` module (CRUD/versions/import/stats), `agent_skills.enabled`
  per-link flag + `enabledSkillsForPrompt` + agent-version bump on link
  changes, prompt-assembly wiring in `run-executor.ts` + `agent_run_skills`
  recording, migration `0012`, and the client `/skills` rail+editor + the
  Agent editor's Skills tab. Seeded "Test Quality Reviewer" (disabled) + 4
  skills.

- **2026-09-18** — Added `eslint.config.mjs` + a `lint` script, wired `lint`
  and `arch` into `server-unit.yml`, and added migration `0011` (7 FK/filter
  indexes: `findings_review_idx`, `reviews_pr_idx`, `reviews_run_idx`,
  `agent_runs_pr_status_idx`, `agent_runs_status_idx`, `pr_files_pr_idx`,
  `pr_commits_pr_idx`).

- **2026-09-18** — Added the `onion-architecture` skill
  (`.claude/skills/onion-architecture/`) plus `server/.dependency-cruiser.cjs`
  and a `pnpm arch` script; each rule was confirmed to fire against an injected
  violation before the allowlist was written.

- **2026-09-17** — Ran the PR-review prompt against PR #4 (the
  `test/reviewer-bait` fixture); review only, no code change.

- **2026-09-17** — PR-list COST switched from the latest done run to the sum of
  all done runs (`sumRunCosts` in `modules/pulls/status.ts`); contract comment
  updated in BOTH vendor copies of `contracts/platform.ts`.

- **2026-09-17** — Diagnosed a failing agent run down to an invalid
  `OPENROUTER_API_KEY`; no code change.

- **2026-09-16** — Run Cost: `agent_runs.cost_usd` re-added (migration 0010),
  threaded through the run executor, repository and the PR-list route.

## Open Questions

- **2026-10-03** — The context listing still runs `TiktokenTokenizer` on every
  readable doc up to 64 KB, with no guard against the repeated-character cliff
  (see Tool & Library Notes). One minified or one-line `.md` near the cap can
  blow SPEC-04 NFR-2's 2 s listing budget and block the event loop. The preview
  already uses a length estimate above 64 KB (`previewTokenCount`). Undecided:
  cap tokenizer input, or estimate for single-line docs.
- **2026-10-02** — `detectInjectionPatterns` flags documents that *discuss*
  prompt injection. In the browser, `specs/04-project-context.md` attached as PR
  context showed the "possible injection" badge (EC-25), because the spec quotes
  the patterns it defends against. It's harmless, since the badge is advisory
  and the text is still wrapped as untrusted. But every security spec in
  `specs/` will warn, so users may learn to ignore the badge. Unresolved:
  whether to exempt fenced code or quoted examples.
  `modules/_shared/injection-detection.ts`

- **2026-09-30** — `test/onboarding-tour.it.test.ts` passes 27/27 alone but
  1–3 different cases fail per run inside the full parallel `pnpm test`
  ("generation did not settle"). The bug reviewer found no service defect: its
  `settled()` helper polls only 100 × 25 ms = 2.5 s while several testcontainers
  start at once. Unconfirmed fix: a time-based poll budget (~15 s) in that
  helper. Until then, run it alone: `pnpm exec vitest run onboarding-tour.it.test`.

- **2026-09-25** — On a clean `L04-lab` HEAD (`main` plus nothing), 5 cases in
  `test/skills.it.test.ts` and `test/skills-stats.it.test.ts` fail: they get
  422 from `GET /skills/:id/stats[?days=]` and `/skills/:id/stats/:version`
  where they expect 200/404. This was reproduced with every L04 change stashed,
  so it predates L04. The cause has not been investigated yet. The likely
  suspect is the `StatsQuery`/params schema in `skills/routes.ts` rejecting
  those requests.
