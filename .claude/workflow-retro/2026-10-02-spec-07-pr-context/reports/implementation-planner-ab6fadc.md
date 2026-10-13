## Hand-back 1

## Requirements review: SPEC-07 PR Context

### Source
`git show docs/spec-07-pr-context:specs/07-pr-context.md` (Status: approved). I checked it against branch `L05-homework`, HEAD 896f72b. I read the module CLAUDE.md and INSIGHTS.md files only for the code I touched, so Phase 2 must re-read them.

### Requirements as given
Every ID below is used as the spec defines it. The status column is my verdict.

| # | Requirement | Status | Note |
|---|---|---|---|
| US-1..9 | Attach, order, preview and remove docs; suggestions; head-SHA reads; agent runs; brief; intent; staleness | Clear | |
| AC-1..AC-9 (Context tab) | Tab, list, attachable list, autosave, `GET`/`PUT /pulls/:id/context`, preview drawer, footer | Clear | AC-4 and AC-6 fix the route shapes. The response and body contracts themselves go in `platform.ts` (see Q4). |
| AC-10..13 (suggestions) | From changed `specs/*.md` files and `SPEC-NN` references in title, body and branch | Clear | Depends on `pr_files` possibly lagging (Q-3 in the spec). |
| AC-14..16 (head-SHA reads) | Read at `head_sha` from the local clone, regular files only, 64 KB cap | Clear | Needs a new `GitClient` method (vendor edit, approved). |
| AC-17..20 (budget) | 10,000-token PR-context budget, 500-token truncation floor, agent and skill docs get 16,000 minus what PR context used | Missing detail | See Q5. |
| AC-21..28 (agent runs) | Own `pr-context:` blocks under `## PR context` before `## Project context`; injection-guard sentence; trace and `specs_read`; fingerprint | Missing detail | AC-23 needs a `reviewer-core/src/prompt.ts` change. The spec names `reviewer-core` only for the helper (UI-5), not for the guard or section. See Q3 and Q5. |
| AC-29..31 (brief) | PR context replaces the agent-document union, which stays as the fallback when nothing is attached | Clear | Overrides SPEC-06 D5/AC-7/EC-13/EC-26. |
| AC-32..36 (intent) | Fill the classifier's `specs` seam, swap in the hardened `wrapUntrusted`, `spec` source entries, fingerprint | Ambiguous | See Q2. |
| AC-37..41 (staleness) | Fingerprint over ordered paths plus blob id or status; null for an empty list; stale notes; no auto-regeneration | Clear | |
| AC-42 | Preview route and its status set | Clear | |
| EC-1..28 | Not cloned, fetch failures, missing/symlink/too_large, `specs_missing`, in-flight changes, save failure, 404/422, injection | Mostly Clear | EC-9/10: see Q6. EC-13 and EC-16 conflict with the lack of an optimistic-lock field (Q7). |
| NFR-1..12 | No LLM calls, <3 s, single-flight fetch, workspace scoping, a11y, i18n, contracts, constants, e2e, logging | Clear except NFR-9 | NFR-9 says "identically" in both copies, but the copies have already drifted (Q4). NFR-11 needs a new step in `e2e/specs/02-repo-pulls-detail.flow.json` (check the e2e CLAUDE.md rule on that). |
| UI-1..12 | Path validation, `--literal-pathspecs ls-tree`, `cat-file` by blob id, SHA regex, `wrapUntrusted`, markdown/XSS, log and credential hygiene | Clear | UI-2 and UI-3 dictate the `simple-git` implementation. |
| Q-1..Q-5 | Fork PRs, GitHub-API fallback, stale `pr_files`, i18n of tab labels, timeout and floor | Q-1/Q-3/Q-5 owner is the planner | I propose defaults in Q8. |

### File:line references checked against the working tree
- **No mismatch:** every reference I checked is still valid, though some line ranges are off by a few lines:
  - `brief/service.ts:365-397`: `resolveSpecs` is at about 365-399.
  - `intent-classifier.ts:62-67` and `:75-78`.
  - `run-executor.ts:222-240`.
  - `context-paths.ts:18`.
  - `project-context.ts:299-303`.
  - `pulls/routes.ts:85-93`.
  - `reviewer-core/src/prompt.ts:37-46`.
  - `helpers.ts:~208`.
  - `PrDetailHeader.tsx:116-118`, at `client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx`.
  - `page.tsx:60`.
- **Spec baseline:** the spec header anchors to commit 97b8614, while HEAD is 896f72b, which has only a docs commit on top.
- **`fetchPullHead` already exists:** `server/src/adapters/git/simple-git.ts:76` runs `fetch origin pull/<n>/head:pr-<n>` with no `+`, and EC-2 needs both fetch by SHA and the forced refspec.
- **`PrIntentRecord` is in `review-api.ts:62`:** it is already exposed through `platform.ts:243`.
- **`ProjectContextEntry.status`:** `trace.ts:83` currently has `attached|missing|too_large|unreadable|over_budget`.
- **No prior implementation:** nothing named `pr-context` exists in `server/`, `client/` or `reviewer-core/`.
- **Migration number:** the last migration is `0016`.

### Clarifying questions
1. **[Execution mode]** Single-agent or multi-agent? I recommend multi-agent, in waves.
   - Wave 1 (W1) is one `implementer` for the contracts. It makes the vendor edits in both copies, the new `GitClient` method signature, the budget constants and the DB column.
   - Wave 2 runs in parallel on disjoint files:
     - W2a server resolver, git adapter, routes and `pull_requests` column (migration generated, not hand-edited).
     - W2b server consumers: run-executor, brief, intent, trace persistence and fingerprint.
     - W2c `reviewer-core` guard and PR-context section.
     - W2d client Context tab and stale notes.
   - Then `test-writer`, then the reviewers.
   - Reason: the work crosses 3 modules and the contract is fixable first. W2b depends on W2a's resolver API, so I would sequence W2b after W2a. Say if you prefer one `implementer` pass.
2. **[AC-32..36, EC-12, UI-5]** Replacing the intent classifier's private `wrapUntrusted` with `reviewer-core`'s version changes the wrapping of existing blocks (description, title and so on). That is not byte-identical to the pre-feature prompt for an empty list, which EC-12 requires. Which do you want?
   - (a) Use the hardened `wrapUntrusted` only for `pr-context:` blocks and keep the private copy for the others, so EC-12 holds.
   - (b) Swap it everywhere and relax EC-12 to "identical apart from escaping".
   - I recommend (a).
3. **[AC-22/23, UI-5]** Is the `reviewer-core` change (new PR-context section, new guard sentence, new input field on `PromptParts`) approved? The spec doesn't list it, but `reviewer-core` has no other way to emit the section. I recommend yes, and the plan will treat it as part of the requirement. `reviewer-core` is ZERO I/O, so the server will pass it already-resolved text.
4. **[NFR-9, vendor edits]** `server/src/vendor/shared/adapters.ts` and `trace.ts` already differ from the client copies; `adapters.ts` differs substantially. The approved edits therefore can't make the files identical. Confirm that the plan makes the SPEC-07 hunks identical in both copies and leaves the pre-existing drift alone. I recommend yes. For `adapters.ts`, only the server copy needs the `GitClient` method at runtime, but the plan will add it to both to satisfy NFR-9.
5. **[AC-17..20]**
   - **(a)** Is "wrapped tokens" the same measure as `wrappedTokenCount` in `project-context.ts`? I assume yes.
   - **(b)** When PR context uses less than 10,000 tokens, agent and skill documents get 16,000 minus the PR tokens actually sent (AC-20), so they can exceed 6,000. The footer text "at least 6,000" is only a floor. I assume yes.
   - **(c)** The resolver needs a `budget` parameter plus a reduced read cap. Is that fine, given SPEC-04's 32 KB cap and sticky skip must stay unchanged for agent and skill documents? I plan a separate PR-context resolver module, not a mode flag on the SPEC-04 one.
6. **[EC-9/10]** The brief spec says EC-9 yields no fallback and records `specs_missing`. For an attached list where every doc is `missing` or `unreadable`, does the brief's stale fingerprint still get stored non-null? AC-31 says null only for the fallback case, so I read it as non-null. Confirm.
7. **[EC-13, EC-16]** "Last completed save wins" with no version field means two concurrent PUTs can finish out of order relative to the user's intent. I accept that as specified, and I propose no optimistic-lock field. Confirm, or ask for a version/updated_at precondition.
8. **[Spec Q-1, Q-3, Q-5]** I propose to accept the defaults:
   - fork PRs go through the same fetch, and a failure falls under EC-3;
   - current `pr_files` rows are used;
   - the 30 s timeout and 500-token floor stay.
   - Q-1 asks for a manual check on a fork PR, which I can't do, so I will list it under Risks as unverified. Confirm.
9. **[Q-2, Q-4]** I will keep both at their defaults: no GitHub-API fallback, and no i18n of the existing tab labels. This is already your decision as owner, so no answer is needed unless you want to change it.

### Recommendations
1. **Land the shared pure logic first, as unit-tested modules.**
   - These are the path validator (UI-1), the `ls-tree -z` parser (UI-2), the truncator (AC-18/19), the fingerprint (AC-37) and the SPEC-NN suggestion matcher.
   - It's hermetic and cheap, and each carries a security or correctness rule.
   - Cost: a few extra test files.
2. **One server-side `resolvePrContext()` service, used by all four consumers.**
   - Run-executor, brief, intent and the tab route all call it.
   - It guarantees AC-17's single budget and the fingerprint consistency AC-37 needs.
   - Cost: the Context route and the three consumers all depend on it, so it has to land before them.
3. **Single-flight fetch per clone, with a 30 s timeout** (NFR-3, EC-3).
   - This is a per-clone in-process promise map.
   - Without it, concurrent runs fetch the same SHA at once.
4. **Drop the extra `SpecDoc`/`resolveSpecs` plumbing in the brief.**
   - The brief keeps `resolveSpecs` as the fallback only (AC-30) and the PR-context path becomes the primary.
   - Smaller diff and the SPEC-06 tests stay valid.
5. **Add one hermetic fake-git test fixture** with a symlink, a submodule, a >64 KB file and a non-UTF-8 file.
   - This covers EC-4..7 without Docker.
   - The `*.it.test.ts` tests (Docker) cover only the `pull_requests` column and migration.

### Execution mode
Recommendation: multi-agent, in the waves described in question 1 (contracts first, then four workstreams on disjoint files, then `test-writer`, then the reviewers).

Awaiting answers (questions 1-8, at least 1-4) before writing the Implementation Plan. Note for Phase 2: the plan will flag the vendor edits (approved 2026-10-01 per the spec) and the new migration (generated by `pnpm db:generate`, never hand-edited) under Risks.

---

## Hand-back 2

## Implementation Plan: SPEC-07 PR Context

### Objective
Add a per-PR Context tab, read at the PR head SHA and backed by `PUT`/`GET /pulls/:id/context`. Its documents feed agent runs, the brief and the intent classifier, and a context fingerprint marks stale results (US-1..9, AC-1..42, EC-1..28, NFR-1..12, UI-1..12). The plan implements SPEC-07 as approved. It supersedes SPEC-06 D5/AC-7/EC-13/EC-26, SPEC-04's two Non-goals and SPEC-03 D1 only where SPEC-07 says so.

### Decisions from Phase 1
- Execution mode → multi-agent: W1 contracts, then W2a, W2c and W2d in parallel, then W2b after W2a, then test-writer, then reviewers.
- Q2 → (a). The hardened `reviewer-core` `wrapUntrusted` is used only for `pr-context:` blocks in the intent prompt. The classifier's private copy stays for the other blocks, so EC-12 stays byte-identical.
- Q3 → the `reviewer-core` `prompt.ts` change is approved: the `## PR context` section, the guard sentence and a new `PromptParts` field.
- Q4 → SPEC-07 vendor hunks are identical in both copies. Drift that already exists in `adapters.ts` and `trace.ts` is left alone.
- Q5(a-c) → accepted:
  - Token counts use `wrappedTokenCount`.
  - Agent and skill docs get 16,000 minus the PR tokens actually sent.
  - A separate PR-context resolver is built, and the SPEC-04 resolver is unchanged.
- Q6 → a brief with PR context attached always stores a non-null fingerprint, even when every doc is unresolved.
- Q7 → last completed save wins, with no lock or version field.
- Q8 → fork-PR fetch behaviour, current `pr_files` rows and the 30 s / 500-token defaults are accepted. The fork-PR check is an unverified risk.
- Q-2 and Q-4 → defaults kept: no GitHub-API fallback, and no i18n of the existing tab labels.
- Recommendations 1-5 → accepted by implication, since the answers approve the waves and nothing was rejected. The plan includes them.

### Modules affected
- `server/`: git adapter, new PR-context resolver and service, route, `pull_requests` column, `pr_intent` column, run-executor, brief, intent and trace persistence.
- `client/`: Context tab, hooks, stale notes, Trace label, vendor contract copy and i18n.
- `reviewer-core/`: the PR-context section and guard in `prompt.ts`.
- `e2e/`: one step asserting the "not cloned" state in flow 02 (NFR-11).

### Constraints
- Root `CLAUDE.md`: `*/src/vendor/**` is "edit only on an explicit request". The user approved the vendor edits for this spec on 2026-10-01 ("yes to the vendor edits"). Edit only the listed files and make no other change to `vendor/`.
- Root `CLAUDE.md`: migrations are generated with `pnpm db:generate`. Never edit an applied migration and never hand-edit a lockfile.
- Root `CLAUDE.md` gotcha: a contract change goes into `server/src/vendor/shared/` and `client/src/vendor/shared/` in the same commit. `reviewer-core` reads the server copy.
- `server/CLAUDE.md`: layering is routes → service → repository → helpers → constants. No raw SQL or HTTP inside a service.
- `server/CLAUDE.md`: a route's Zod `schema.body`/`schema.params` drives validation, not a hand-rolled `Schema.parse`.
- `server/CLAUDE.md`: every handler starts with `getContext(container, req)`. Dependencies come from `container`, not a concrete adapter class.
- `server/CLAUDE.md`: modules register statically in `modules/index.ts`.
- `server/CLAUDE.md`: the `process.env` ban outside `platform/config.ts` is enforced by lint. Secrets only through `container.secrets`.
- `server/INSIGHTS.md` Decisions (2026-09-20): injection flags are computed live from the text, never stored. So the EC-25 warning badge is computed live via `detectInjectionPatterns` and is not persisted on the entry.
- `server/INSIGHTS.md`: `fetchPullHead` has no caller, and its refspec lacks `+` (the 2026-10-01 entry). The PR-context fetch must use the forced `+pull/<n>/head:pr-<n>` form (EC-2) and must not rely on `fetchPullHead` as is.
- `server/INSIGHTS.md`: the SPEC-06 plan format at `specs/06-pr-brief.plan.md` was my reference.
- `server/INSIGHTS.md` Open Questions: `onboarding-tour.it.test.ts` is flaky in the parallel `pnpm test`, and the skills stats tests already fail. Do not count them as regressions from this work.
- `client/CLAUDE.md`: each component is a folder (`<Name>.tsx`, `.test.tsx`, `styles.ts`, `constants.ts`, `helpers.ts`, `index.ts`). Feature components are PascalCase under `app/<route>/_components/`.
- `client/CLAUDE.md`: no `fetch` in components, so use hooks in `lib/hooks/` through `lib/api.ts`. A new endpoint means a new hook. Text goes through `next-intl`. Branch on `ApiError.status`, never on message text.
- `client/CLAUDE.md`: pages stay thin and `pnpm arch` forbids reaching into another route's `_components/`.
- `reviewer-core/CLAUDE.md`: ZERO I/O. The new input arrives as a `PromptParts` field, not an import.
- `reviewer-core/CLAUDE.md` and `INSIGHTS.md` (2026-09-29): a new prompt slot omits its section when empty, keeping the prompt byte-identical (EC-11). The guard sentence is conditional, like `PROJECT_CONTEXT_GUARD`.
- `reviewer-core/CLAUDE.md`: all externally sourced text goes through `wrapUntrusted()`.
- `e2e/CLAUDE.md`: no Playwright and no LLM. Flows use only deterministic `wait --text` / `wait --url` and run against read-only seed data, so nothing may trigger a model call. The seeded PR #482 has `clonePath: null`, which is the "not cloned" state.
- SPEC-04 stays unchanged for agent and skill docs: 32 KB cap, whole-document drop, sticky over-budget skip (AC-16).

### Skills the implementer will apply
Names and buckets are taken from `.claude/skills/pr-self-review/reference/routing.json`.

| Path / area | Bucket | Skills |
|---|---|---|
| `server/src/vendor/shared/contracts/{trace,brief,platform,review-api}.ts` and the `client/` twins | contracts | zod, typescript-expert |
| `server/src/vendor/shared/adapters.ts` and the `client/` twin | vendor | none (no skills; gates `server:typecheck`, `client:typecheck`) |
| `server/src/db/schema/{pulls,reviews}.ts` | db-schema | drizzle-orm-patterns, postgresql-table-design, onion-architecture |
| `server/src/db/migrations/` (generated by `pnpm db:generate`) | db-migrations | drizzle-orm-patterns, postgresql-table-design |
| `server/src/modules/**`, `server/src/adapters/**` (adapters match `^server/(src|test)/`) | backend | onion-architecture, fastify-best-practices, zod, security, typescript-expert (+ drizzle-orm-patterns for repository files) |
| `client/src/app/**`, `client/src/lib/**`, `client/messages/**` | frontend | frontend-ui-architecture, next-best-practices, react-best-practices, security, typescript-expert (+ react-testing-library for `*.test.tsx`) |
| `reviewer-core/src/**` | engine | typescript-expert, zod, security |
| `e2e/specs/02-repo-pulls-detail.flow.json` | workflow | security, typescript-expert (conditional rule for `^e2e/`) |

### Step-by-step plan

**W1: contracts, constants, schema (one `implementer`, sequential, lands first)**
1. **[server, client]** Edit `trace.ts` in both copies (NFR-9, CONTRACT:trace).
   - Add `truncated` to the `ProjectContextEntry.status` enum.
   - Add `context_fingerprint: z.string().nullish()` to `RunTrace`.
   - Leave the existing comment drift between the copies alone. (AC-18, AC-25, AC-28, EC-21)
   - Touches `server/src/vendor/shared/contracts/trace.ts` and `client/src/vendor/shared/contracts/trace.ts`.
2. **[server, client]** Edit `brief.ts` in both copies. Add `context_fingerprint: z.string().nullish()` to `BriefEnvelope`. (AC-31, EC-21, NFR-9)
3. **[server, client]** Edit `review-api.ts` in both copies. Add the nullish fingerprint to `PrIntentRecord` so the client can compare it. (AC-36, AC-39)
4. **[server, client]** Edit `platform.ts` in both copies, next to `ContextListing`. Add these contracts (AC-2, AC-4, AC-6, AC-42, EC-23, UI-1, CONTRACT:pr-context):
   - `PrContextEntry`: path, kind, origin badge, status, tokens, head SHA read at, warning patterns.
   - `PrContextResponse`: entries, suggestions with reason, attachable list, budget, fingerprint, `cloned` flag, map-reduce note flag.
   - `PrContextSaveBody`: at most 20 paths.
   - `PrContextPreview`.
   - The status set `attached|missing|too_large|unreadable` for the preview, and `over_budget|truncated` for the entry status.
   - Touches `server/src/vendor/shared/contracts/platform.ts` and `client/src/vendor/shared/contracts/platform.ts`.
5. **[server, client]** Edit `adapters.ts` in both copies (CONTRACT:gitclient, AC-14, AC-15, EC-2..7).
   - Add a `GitClient` method, e.g. `readFileAtCommit(repo, sha, path)`, returning a discriminated result.
   - Its reasons are `not_found | symlink | submodule | not_blob | too_large | fetch_failed`, plus `ok` with `{ text, blobId }`.
   - Add a second method, e.g. `ensureCommit(repo, sha, prNumber)`, for the fetch of EC-2/3.
   - Add only these hunks to the client copy and keep the existing drift.
   - Touches `server/src/vendor/shared/adapters.ts` and `client/src/vendor/shared/adapters.ts`.
6. **[server]** Add the named constants in `server/src/modules/_shared/context-paths.ts` (NFR-10, AC-17, AC-18, EC-3).
   - `PR_CONTEXT_TOKEN_BUDGET = 10_000`.
   - `PR_CONTEXT_TRUNCATION_FLOOR = 500`.
   - `PR_CONTEXT_MAX_FILE_BYTES = 64 * 1024`.
   - `PR_CONTEXT_FETCH_TIMEOUT_MS = 30_000`.
   - `MAX_PR_CONTEXT_PATHS = 20`.
   - Leave `MAX_CONTEXT_FILE_BYTES` and `PROJECT_CONTEXT_TOKEN_BUDGET` unchanged.
7. **[server]** Edit the schema files, then generate one migration with `pnpm db:generate` (AC-5, AC-28, AC-36; migration needs sign-off, see Risks).
   - `server/src/db/schema/pulls.ts`: add `contextPaths` (jsonb string[], not null, default `[]`).
   - `server/src/db/schema/reviews.ts`: add `contextFingerprint` (text, nullable) to `prIntent`.
   - The brief and run-trace fingerprints are stored in their existing jsonb, so they need no column.
   - Touches those two schema files and a new generated file in `server/src/db/migrations/`.

**W2a: server git, resolver, route (starts after W1)**
8. **[server]** Implement the new methods in `server/src/adapters/git/simple-git.ts` and the matching mocks in `server/src/adapters/mocks.ts` (AC-14, AC-15, EC-2..7, UI-2..4, UI-10, NFR-3).
   - `git --literal-pathspecs ls-tree -l -z <sha> -- <path>`, with the path passed after `--` in an argument array.
   - The `-z` output is parsed without unquoting, and the path is refused when it differs from its POSIX-normalised form.
   - Mode `100644` or `100755` only; symlinks (`120000`), submodules (`160000`) and non-blobs return `missing`.
   - Content is read by `git cat-file blob <oid>` after a size check against the 64 KB cap.
   - Reject text that is not valid UTF-8 or contains a NUL byte.
   - `ensureCommit` checks `^[0-9a-f]{40}$` (UI-3, EC-24), tries a fetch by SHA, then the forced `+pull/<n>/head:pr-<n>`, with a 30 s timeout. A per-clone single-flight promise map makes concurrent readers share one fetch.
   - Raw git stderr and remote URLs never leave the adapter; errors are mapped to the reason codes above.
9. **[server]** Add pure helpers with tests in `server/src/modules/_shared/` as new kebab-case files, e.g. `pr-context-paths.ts` and `pr-context-truncate.ts` (AC-18, AC-19, AC-37, UI-1, EC-26; Rec. 1).
   - Path validator (UI-1): relative, no empty/`.`/`..` segment, no backslash, NUL or control character, `.md`, at most 512 characters, passes the SPEC-04 globs and the excluded dirs, first character not `:`.
   - Truncator: cut at the last markdown heading line that fits, else the last whole line, and append `[truncated: N of M tokens]`. Cut only while at least 500 tokens remain; otherwise `over_budget`.
   - Fingerprint: hash over ordered paths plus blob id or status; null for an empty list.
   - Suggestion matcher: `SPEC-NN` and `specs/NN-…` regexes extract only those tokens (UI-11), resolve against the attachable list, and add no suggestion when nothing resolves (EC-26).
   - Also covers the `specs/*.md` changed-file rule (AC-10, AC-11).
10. **[server]** Add `server/src/modules/_shared/pr-context.ts`, exporting `resolvePrContext()` (AC-14, AC-17..19, AC-24, EC-1..7, EC-24, EC-25, UI-9, NFR-1, NFR-12).
    - It takes the PR row (head SHA, number, `contextPaths`) and the repo (clone path).
    - It returns ordered entries (tokens, status, text, origin `pr`, head SHA read at, warning patterns computed live), the fingerprint and notes.
    - It runs a single `ensureCommit` pass, never fetches again for `missing` (EC-4), and reads every path with the step-8 method.
    - Behaviour:
      - A null clone path gives `unreadable` entries and no git call (EC-1, NFR-11).
      - A head SHA that is not 40 hex gives `unreadable` and no git command (EC-24).
      - A fetch failure gives `unreadable`, with a path-sanitised note and no git error text (EC-3).
      - Documents are admitted in saved order and evaluated against the remaining budget (AC-19).
      - Wrapped tokens are counted via `wrappedTokenCount` (Q5a).
      - Logging goes through `sanitizePathForLog` and never includes document text.
    - It is a separate module from `project-context.ts`; the SPEC-04 resolver is unchanged.
    - It also exports the AC-24 dedupe helper: a path attached to both the PR and an agent or skill is sent as the PR copy only when its blob differs from the default-branch blob.
11. **[server]** Add the repository and service layer for the Context tab (AC-5, AC-6, AC-42, NFR-4, EC-22, EC-23).
    - Persistence (`server/src/modules/pulls/repository.ts`, new) stores and reads `pull_requests.context_paths` scoped by workspace. The PR upsert at `pulls/routes.ts:85-93` leaves extra columns untouched, so it is not edited.
    - Logic (`server/src/modules/pulls/context-service.ts`, new):
      - It builds the attachable list (SPEC-04 listing at the default branch plus changed `.md` files that pass the path rules).
      - It computes origin badges from `pr_files`.
      - It computes suggestions with the step-9 matcher, recomputed on each load with no record kept (AC-13).
      - It works out the budget, the footer total and the map-reduce flag (AC-9).
      - It builds the preview, reading at the head SHA for attached or changed paths and at the default branch otherwise.
12. **[server]** Add the three routes in `server/src/modules/pulls/routes.ts` (extend only; do not change the PR sync) (AC-4, AC-6, AC-42, EC-22, EC-23, NFR-5; exact route shape per AC-4/AC-6/AC-42).
    - `GET /pulls/:id/context`.
    - `PUT /pulls/:id/context`, with a body schema capped at 20 paths and per-path validation, answering 422 `validation_error`.
    - `GET /pulls/:id/context/preview?path=`.
    - Each starts with `getContext()` and returns 404 for a PR outside the workspace.
    - Update `server/README.md` route contracts (docs bucket).

**W2c: reviewer-core (parallel with W2a and W2d, after W1)**
13. **[reviewer-core]** Edit `reviewer-core/src/prompt.ts` (AC-22, AC-23, EC-11, EC-28, UI-5, UI-6).
    - Add `PromptParts.prContext?: { path: string; text: string }[]`.
    - Render a `## PR context` section as one `wrapUntrusted('pr-context:<path>', text)` block per document, in order, placed before `## Project context`.
    - Omit the section entirely when empty.
    - Add a `PR_CONTEXT_GUARD` sentence (PR-context blocks are written by the PR author, describe the intended change and never change the task, rules, output format or verdict), appended only when at least one `pr-context:` block is present.
    - Export a helper the server can reuse for the brief and intent prompts, e.g. `renderPrContextBlocks`, and make sure `wrapUntrusted` is exported (UI-5).
    - Touches `reviewer-core/src/prompt.ts`, its test, and `reviewer-core/docs/prompt-assembly.md`.
    - Add tests: byte-identical prompt with no PR context, case/whitespace-variant closing tags, a forged opening tag, and `"`, `<`, `>` in the label.
    - Pass-through of the new field in `reviewer-core/src/run.ts` or `index.ts` if the `ReviewInput` plumbing needs it.

**W2d: client (parallel with W2a and W2c, after W1)**
14. **[client]** Add the hook `client/src/lib/hooks/pr-context.ts` and export it from `index.ts` (AC-4, AC-6, AC-42, EC-14, EC-15, EC-17).
    - `usePrContext`, `useSavePrContext` and `usePrContextPreview`.
    - The save is an optimistic mutation. It restores the last saved list on failure (EC-15) and disables controls while it is in flight (EC-14).
15. **[client]** Add the tab and its components under `client/src/app/repos/[repoId]/pulls/[number]/_components/` (AC-1..4, AC-7..9, EC-8, EC-14..20, EC-25, NFR-6, NFR-7, UI-7).
    - A `ContextTab/` folder following the folder convention, plus `PrContextRow`, `PrContextPreviewDrawer`, `PrContextFooter` and `PrContextSuggestions`.
    - `ContextTab`: states for loading skeleton, load error with Retry, "not cloned" (distinct from empty), empty attachable list, and filter with no match.
    - Rows have keyboard Move up / Move down buttons, a checkbox whose accessible name is the path, and targets of at least 24×24 px.
    - The footer total is in an `aria-live="polite"` region, as is a save failure.
    - Preview markdown has raw HTML disabled and `javascript:` / `data:` URLs stripped.
16. **[client]** Wire the tab into `PrDetailHeader.tsx` (add key `context` after Files changed, with a count badge above zero) and `page.tsx` (render when `tab === "context"`). Leave the existing hard-coded tab labels alone, and add i18n only for the new label (AC-1, Q-4).
17. **[client]** Add the stale notes and the Trace label (AC-27, AC-38..40, EC-21, UI-8, NFR-8).
    - "Generated with different PR context" next to Regenerate in the `PrBrief` component.
    - "Classified with different PR context" on `IntentCard`.
    - "Run used different PR context" on the Agent runs row (`RunHistory` / `ReviewRunAccordion`).
    - A null stored fingerprint reads as null, not stale.
    - The comparison is against the current fingerprint from `usePrContext`.
    - In `RunTraceDrawer`, show the `PR` origin label and put PR-context entries first in "Project context · attached specs", as plain preformatted text.
18. **[client]** Add i18n (NFR-8): new `client/messages/en/prContext.json` (and the same file for every other locale present under `client/messages/`), the tab label in `prReview.json`, and the stale notes in `brief.json`, `intent.json` and `runs.json`. Keys are camelCase, including `prContext.loadError`.

**W2b: server consumers (after W2a)**
19. **[server]** Run-executor, `server/src/modules/reviews/run-executor.ts` (AC-20..22, AC-24..26, AC-28, EC-3, EC-11, EC-13, UI-9, NFR-12).
    - Call `resolvePrContext()` once at the start of the run, read the attached list at the start, and use that list's fingerprint throughout (EC-13).
    - Resolve the agent and skill docs with `budget = 16,000 − wrapped PR tokens actually sent`.
    - Pass `prContext` to the engine, and make no change to the default-branch SPEC-04 read.
    - Write the run-log line `pr context: N doc(s) attached (+~T tokens)`, and a sanitised line for each missing, unreadable or injection-flagged document.
    - Persist `project_context` entries with `origin: 'pr'` ahead of the agent and skill entries, add the sent PR paths to `specs_read`, and write `context_fingerprint` into the trace. Update the trace persistence code that builds `RunTrace`.
20. **[server]** Brief, `server/src/modules/brief/service.ts`, `helpers.ts` and `constants.ts` (AC-29..31, EC-9, EC-10, EC-13, UI-5, UI-12).
    - When the attached list is not empty, use the resolved PR-context documents as `SpecDoc`s, under a `## PR context` heading as `pr-context:<path>` blocks via `reviewer-core`'s `wrapUntrusted`.
    - Keep `resolveSpecs` unchanged, used only as the fallback when the list is empty (Rec. 4).
    - If the list is non-empty but nothing resolves, produce no spec section and no fallback, and record `specs_missing` naming each path and status.
    - Record `specs_missing` for any truncated or skipped document, including one dropped by the brief's whole-prompt fitter.
    - Store `context_fingerprint` in the envelope (null on the fallback path).
    - The existing SPEC-06 tests for the fallback stay valid.
21. **[server]** Intent, `server/src/modules/reviews/intent-classifier.ts` (AC-32..36, EC-12, EC-13, UI-5, UI-6; Q2a).
    - Fill the `resolveProjectContextSpecs` seam from `resolvePrContext()`. Send no agent or skill documents.
    - Wrap only the `pr-context:` blocks with the hardened `wrapUntrusted` from `reviewer-core`. Keep the private copy for the other blocks, so the prompt is byte-identical when the attached list is empty.
    - Store a `spec` source with status `used` listing the paths, and the "not fetched" link note as a separate `unreachable` `spec` source.
    - Persist the fingerprint in the new `pr_intent.context_fingerprint` column via the repository (`server/src/modules/reviews/repository/review.repo.ts` or wherever the intent upsert lives), and return it on `PrIntentRecord`.
22. **[server]** Make sure the attached-list change starts no brief, intent or run (AC-41, NFR-1). The save path writes only `context_paths`, and the tests assert no LLM call.

**Tests and e2e (after W2a-d)**
23. **[server, client, reviewer-core, e2e]** Tests (see Test plan) and the e2e step.
    - Add a step to `e2e/specs/02-repo-pulls-detail.flow.json`: open `?tab=context` on PR #482 and `wait --text` for the "not cloned" copy (NFR-11).
    - It adds no git command or LLM call. The seed has `clonePath: null`.

### Execution

| Workstream | Agent | Steps | Files owned | Depends on | Parallel with |
|---|---|---|---|---|---|
| W1 contracts | implementer | 1-7 | `server/src/vendor/shared/{adapters.ts, contracts/{trace,brief,review-api,platform}.ts}` and the `client/` twins, `server/src/modules/_shared/context-paths.ts`, `server/src/db/schema/{pulls,reviews}.ts`, a new `server/src/db/migrations/*` | none | none |
| W2a server resolver and routes | implementer | 8-12 | `server/src/adapters/git/simple-git.ts`, `server/src/adapters/mocks.ts`, `server/src/modules/_shared/pr-context*.ts` (new), `server/src/modules/pulls/{routes.ts,repository.ts,context-service.ts}`, `server/README.md` | W1 | W2c, W2d |
| W2c reviewer-core | implementer | 13 | `reviewer-core/src/prompt.ts`, its test, `reviewer-core/docs/prompt-assembly.md` | W1 | W2a, W2d |
| W2d client | implementer | 14-18 | `client/src/lib/hooks/pr-context.ts`, `client/src/lib/hooks/index.ts`, `client/src/app/repos/[repoId]/pulls/[number]/**`, `client/messages/**` | W1 | W2a, W2c |
| W2b server consumers | implementer | 19-22 | `server/src/modules/reviews/{run-executor.ts,intent-classifier.ts,repository/*}`, `server/src/modules/brief/*` | W2a, W2c | W2d (if still running) |
| W3 tests | test-writer | 23 | `*.test.ts(x)`, `*.it.test.ts`, `e2e/specs/02-repo-pulls-detail.flow.json` | W2a, W2b, W2c, W2d | none |
| Review | architecture-reviewer ∥ security-reviewer ∥ plan-verifier | none | read-only | W3 | each other |

No file appears in two workstreams' "Files owned". W2b uses W2c's exported helper, so W2c must land before W2b starts. `server/src/adapters/mocks.ts` is owned only by W2a.

### Test plan
Gates use `./scripts/check.sh <pkg> <gate>` with pkg in `server|client|core`. The DB-backed suite is outside `check.sh`.
- `./scripts/check.sh server typecheck`, `client typecheck` and `core typecheck`: run after W1 and again at the end. They catch contract drift and any new type error on both vendor copies.
- `./scripts/check.sh server lint` and `./scripts/check.sh server arch`: layering of `pr-context.ts`, the service and the routes, and the `process.env` ban.
- `./scripts/check.sh server test`: hermetic unit tests that need no Docker. They cover:
  - the path validator: traversal, `:`, control characters, 512 limit, globs;
  - the `ls-tree -z` parser and the fake-git fixture for symlink, submodule, >64 KB and non-UTF-8 cases (EC-4..7);
  - the truncator, with the 500-token floor and heading cut;
  - the fingerprint, null for an empty list;
  - the suggestion matcher, including EC-26;
  - `resolvePrContext`: not cloned, bad SHA, fetch failure, budget order;
  - the AC-24 blob-differs dedupe;
  - brief: the `specs_missing` paths, the fallback and the stored fingerprint;
  - intent: the byte-identical empty list (EC-12) and the `spec` sources;
  - the run-executor trace, with `specs_read` and `origin: 'pr'`;
  - the route tests: 404, 422, 20-path cap, no LLM call on save (AC-41).
- `./scripts/check.sh server related <files>`: after each step in W2a and W2b.
- `./scripts/check.sh client lint` and `./scripts/check.sh client arch`: the `fetch` ban and the layering rule that a route may not reach into another route's `_components/`.
- `./scripts/check.sh client test`: `ContextTab` states (loading, error, not cloned, empty, no match, save failure restoring the list), keyboard Move up/down, aria-live, the stale notes with a null fingerprint, the Trace `PR` label and the preview sanitising.
- `./scripts/check.sh core test`: `reviewer-core` prompt tests (byte-identical with no PR context, the conditional guard, hardened `wrapUntrusted` for case/whitespace variants, forged opening tag, label escaping, section order).
- `cd server && pnpm exec vitest run .it.test`: Docker-backed tests for the `context_paths` and `context_fingerprint` columns and the workspace-scoped `GET`/`PUT`. Run on the new files only; the existing flaky suites listed under Constraints are not regressions.
- `./scripts/e2e.sh` (a `sh:syntax` and e2e typecheck gate applies to the `e2e/` change): flow 02 with the new "not cloned" step.

### Risks / open questions
- **Vendor edits.** Steps 1-5 touch `*/src/vendor/**`. The user approved them on 2026-10-01, and they must stay limited to the SPEC-07 hunks. The `adapters.ts` and `trace.ts` copies have already drifted, and that drift is left alone (Decision 4).
- **Migration.** Step 7 generates one migration for the two new columns (`pull_requests.context_paths`, `pr_intent.context_fingerprint`). It needs the user's sign-off, and the generated file is committed as is. It is never hand-edited.
- **Unverified (Q-1).** Fetching `pull/<n>/head` for fork PRs was not verified; a failed fetch falls under EC-3. Check it manually on a fork PR.
- **Stale `pr_files` (Q-3).** Origin badges and suggestions can lag `head_sha`, because the PR sync updates only title, `head_sha`, status and `updated_at`. This is accepted.
- **Concurrent saves (EC-16).** Last completed save wins with no version field; two concurrent saves can finish out of order.
- **Stale spec text.** SPEC-04 and SPEC-06 are approved, so SPEC-07's `Supersedes:` header carries the amendments. No edit to those specs belongs in this plan. If their text should be marked, `spec-creator` supersedes them; it is not part of this plan.
- **Intent-record persistence.** I assumed a new `pr_intent` column because that table has no JSON field. The implementer should confirm by reading the intent upsert in the review repository.
- **Uncloned repos (Q-2).** Without a clone, PR-context documents are `unreadable` for every consumer. GitHub-API reading is out of scope.
- **Migration number and flaky suites.** The migration will be numbered `0017` by the generator, and the known failing suites will fail until they are fixed elsewhere.