## Hand-back 1

## Requirements review: Onboarding Tour (SPEC-05)

### Source
`/Users/harlock/Downloads/Sites/devdigest/specs/05-onboarding-tour.md` (SPEC-05). Header says **Status: draft**. You said to plan from it, so I treat that as confirmed (see Q10 if you want to wait for approval). I read the root, server, client and e2e `CLAUDE.md` files. I checked the `INSIGHTS.md` Decisions and Open Questions sections in root, server and client, and e2e's (its Decisions and Open Questions are empty). I also read the code the spec touches.

### Requirements as given
There are no diagrams in the spec. Its only contract is the new tour document (NFR-11, plus the Goals bullet about the contract).

| # | Requirement | Status | Note |
|---|---|---|---|
| AC-1, AC-3..AC-9, AC-16 | Sidebar item, five sections in order, per-section rows, collapse toggle | Clear | Checked by component tests and the e2e skeleton flow. |
| AC-2 | Active state only on `/repos/:id/onboarding-tour`, not on `/onboarding` | **Conflicting** | See Q1. |
| AC-4 | No stored tour: render the skeleton plus a Generate button | Missing detail | See Q5. |
| AC-10, AC-26, NFR-3 | Ranking order, deterministic for the same SHA, mode and window | Ambiguous | The rank-exclusion rule (EC-21) is an undefined input (Q6). |
| AC-11..AC-15, NFR-9, NFR-10 | Scroll-spy, hash handling, `nav`, reduced motion | Clear | AC-12's "top band" size is left to the implementer. I will set it in the plan. |
| AC-17, AC-18 | Badge, "~N files", ranking label | Clear | |
| AC-19, EC-11 | Stale badge, "No index yet" | Clear | Q-4 accepted. |
| AC-20..AC-22, EC-4..EC-6, EC-22 | Fire-and-forget, poll, 409, restart | Missing detail | See Q3 and Q4. |
| AC-23..AC-25, AC-27, AC-29 | Toggle, days input, warning, "Active recently", model hint | Ambiguous | See Q7 (AC-29). |
| AC-28, NFR-11 | Persisted meta, older documents still readable | Clear | Meta goes in the `json` jsonb, so no migration is needed. |
| AC-30, AC-31, EC-18 | Copy and Open | Clear | `githubBlobUrl` exists at `client/src/lib/github-urls.ts`. |
| AC-32, AC-33, EC-12..EC-14, EC-16, EC-17, EC-20, EC-21 | Grounding and the facts collector | Missing detail | See Q6, Q8 and recommendation 2. |
| EC-1, EC-2, EC-3, EC-7 | Skeleton and failure paths | Missing detail | Conflict between EC-1 and EC-7 (Q9). |
| EC-8, EC-9, EC-10, UI-8 | Clone-less repo, history failure, window bounds | Infeasible as stated | The git port change needs a vendor edit (Q2). |
| EC-15, EC-19, EC-23 | Empty state, `RepoNotFound`, raw HTML | Clear | |
| NFR-1..NFR-8, NFR-12, NFR-13, UI-1..UI-10 | Model-call limit, timeout, tenancy, budget, i18n, WCAG, logging, e2e | Clear | See Q-1 below. |
| Q-1 | 24 000-token prompt budget | Open, owner planner | I accept the default. I will implement truncation with a token estimator already in the repo. |
| Q-7 | Clone history stays deepened after generation | Open, owner planner | I accept the default. The AC-25 warning covers it. |
| Q-2..Q-6 | Budgets, bounds, Stale, 0.5 threshold, language | Open, owner user | I treat the defaults as accepted unless you say otherwise. |

### Clarifying questions
1. **[AC-2, AC-1] The active-key rule is a real collision, and the spec understates it.**
   - `client/src/components/app-shell/helpers.ts:29` has `pathname.includes("/onboarding")` returning `"onboarding-tour"`. That matches both `/onboarding` and `/repos/x/onboarding-tour`.
   - `shell.json:19` already has an `"onboarding-tour"` label, so the existing key is already bound to Add repository.
   - Proposal: add a precise `/repos/:id/onboarding-tour` match before the `includes` line, and return `""` (or a dedicated key) for `/onboarding`. Is that right? It changes the existing `helpers.test.ts` expectation for `/onboarding`.
2. **[EC-8, EC-9, AC-26, UI-8] The history fetch needs a git-adapter method, which means editing `server/src/vendor/shared/adapters.ts`.**
   - That is a vendored path on the root "Do not touch" list. The `GitAdapter` port and its mock live there or in `adapters/mocks.ts`, and the client copy of `adapters.ts` has already drifted.
   - Do you sign off on editing the server copy of `adapters.ts`?
   - The alternative is a tour-local helper that runs `simple-git` directly inside the repo-intel or onboarding module. That breaks the rule "take dependencies from `container`, never import a concrete adapter" (`server/CLAUDE.md`).
   - I recommend the vendor edit, with a line under Risks.
3. **[EC-4, EC-22, AC-21] What is the "running" state, and where does it live?**
   - The `onboarding` table has only `json` and `generated_at`, so there is no status column.
   - I propose an in-memory lock per repo id inside the service, which satisfies EC-22 for free. `server/CLAUDE.md` already assumes a single API instance.
   - The `GET` would return `generating: boolean`.
   - The alternative is a migration with a `status` column. I recommend against it, because migrations are on the "Do not touch" list.
   - Confirm the in-memory lock.
4. **[AC-20, AC-21, AC-28] How does the client know generation is over when it fails?**
   - AC-21 keeps the button disabled "until the stored tour's generation time changes".
   - A failure with an existing `llm` tour (EC-3) may not change `generated_at`, but it does record `last_error`.
   - Proposal: the poll stops when `generating` turns false OR `generated_at` changes. A failed regeneration on an existing tour writes `last_error` and its time into the meta without replacing the content, so the page can show the EC-3 notice. Confirm.
5. **[AC-4] How is the skeleton served when nothing is stored?**
   - I propose `GET /repos/:repoId/onboarding-tour` builds the skeleton live and returns it with `stored: false`. It needs no model call and persists nothing (NFR-1, NFR-13).
   - Does "Generate" on a degraded repo (EC-1) then persist the skeleton with source `skeleton`? I assume yes.
6. **[EC-21, AC-10, AC-32] What are the exact exclusion rules?**
   - The spec lists "test, config, declaration, migration or fixture path".
   - `repo-intel/service.ts:709` already has "Path kinds excluded from rank-driven file samples". I propose reusing it and extending it only if a kind is missing.
   - Also, what does "indexed directory" mean for grounding (AC-32, EC-14)? I propose the set of parent directories of indexed files.
7. **[AC-29] "Provider and model on the Regenerate hint" needs a source.**
   - I propose that `GET` returns the resolved `feature_models['onboarding']` (or the default) as `{provider, model}`.
   - It must not leak the key, and it must not make a model call. Confirm.
8. **[AC-33, EC-16] The facts collector, which does not exist today.**
   - Which manifest types are in scope for v1?
   - I propose `package.json`, `pnpm-workspace`, `pyproject`/`requirements.txt`, `go.mod`, `Cargo.toml`, `docker-compose*.yml` and `.env.example` (key names only).
   - What if none are found? I propose showing the EC-15 empty state for run_locally. Confirm or narrow the list.
9. **[EC-1 vs EC-7] Both cover the no-model path but give different reasons.**
   - EC-1 lists index-state reasons for the badge. EC-7 covers a missing key.
   - What is the precedence if both apply? I propose EC-1 first (the index problem is the root cause), with the EC-7 link to Settings shown additionally.
10. **[Q-2, non-blocking] Budgets.** The 60 s history plus 120 s model call gives a 180 s server ceiling, and the 200 s client give-up leaves only a 20 s margin. Is that accepted?
11. **[Q-6, non-blocking] Language.** The spec says `{{language}}` is the UI locale. Only `client/messages/en` exists, so is the language effectively "en" for now?
12. **[NFR-7 vs Goals, non-blocking] `onboarding.json` copy.**
    - The Goals say the tour copy is rewritten. NFR-7 says existing keys stay intact.
    - I read this as: the Add-repository keys stay, and the tour keys (`title`, `generate.*`, `sectionCount`, and so on) are replaced or extended. The staged key `"sections": "Sections"` and the `generate.body` text describing five different sections must be rewritten.
    - Is that the intent? If any existing tour key is referenced elsewhere, it must be kept.

### Recommendations
1. **Keep the facts collector and the grounding merge as pure functions.** Put them in `server/src/modules/repo-intel/` or a new `modules/onboarding-tour/helpers.ts`, with hermetic unit tests. This is where regressions will occur. Cost: a few extra test files. It also makes NFR-3 (determinism) testable.
2. **Register a new server module `onboarding-tour`** (routes, service, repository, helpers, constants) in `modules/index.ts`, rather than growing `repo-intel`. `server/CLAUDE.md` requires a static registration and one entry. `repo-intel` stays read-only for the tour, which satisfies NFR-4.
3. **Smaller first slice.** Ship the skeleton, the page, the TOC and the e2e flow first, with no ranking toggle and no model call. Then add enrichment, then the activity mode. This isolates the riskiest part (git history and vendor port edits). Cost: several commits, but you already commit per stage.
4. **Add a contract test of the tour Zod schema** in both vendor copies (server `.default()`, client `.optional()`, `.nullish()` for persisted meta). This guards NFR-11 against the two copies drifting further.
5. **Unit-test `activeKeyFor`** for three cases: `/onboarding`, `/repos/x/onboarding-tour`, and `/repos/x/context`.
6. **e2e:** add `e2e/specs/10-onboarding-tour.flow.json` for the skeleton, the status badge and the TOC on the seeded repo. Do not edit `06-onboarding.flow.json`, which covers `/onboarding`. `e2e/CLAUDE.md` bans the AI `chat` command, and the seeded repo must never trigger a model call. Note: there is no Generate click in e2e.
7. **Fix a stale prompt detail while rewriting it.** The staged prompt mentions a `routes_and_apis` section and a mermaid `diagram` field in markdown form. The spec drops both in favour of structured nodes and edges (UI-6), so the rewritten prompt must say so.

### Execution mode
Recommendation: **multi-agent, after the contract lands.**
- Workstreams: contracts (both vendor copies, one commit) → server (W2) ∥ client (W3) → test-writer → reviewers.
- The server and client workstreams own disjoint files, and the contract is fixed up front. The e2e flow belongs to a small third stream.
- Caveat: the vendor and adapter-port edits (Q2) are sequential and go first.
- If you want fewer moving parts, single-agent also works, because the facts collector and grounding steps are coupled.
- Your memory note says execution goes through `/implement`, so I will not hand-launch implementers. The plan will say so.

### Skills per path, from `routing.json`
- `server/src/vendor/shared/contracts/*`, both copies: bucket contracts, skills zod, typescript-expert.
- `server/src/vendor/shared/adapters.ts`: bucket vendor, no skills. Needs sign-off (Q2).
- `server/src/modules/**`, `server/src/prompts/**`, `server/test/**`: bucket backend, skills onion-architecture, fastify-best-practices, zod, security, typescript-expert. Repository files also add drizzle-orm-patterns.
- `client/src/app/**`, `client/src/components/**`, `client/src/lib/**`, `client/messages/**`: bucket frontend, skills frontend-ui-architecture, next-best-practices, react-best-practices, security, typescript-expert. `.test.tsx` files add react-testing-library.
- `e2e/specs/*.json`: bucket workflow, skills security, typescript-expert.
- `specs/*.md`: bucket spec, skill spec-authoring.
- `INSIGHTS.md`: bucket docs.
- No migration is planned: bucket db-migrations is avoided, and there are no `server/src/db/**` edits.

### Gates I expect
- server: typecheck, lint, arch, test-unit (hermetic).
- client: typecheck, lint, arch, test.
- e2e: e2e:typecheck (conditional).
- Use `*.it.test.ts` only if the repository needs DB-backed tests (Docker).

Awaiting answers before writing the Implementation Plan.

---

## Hand-back 2

## Implementation Plan: Onboarding Tour (SPEC-05), 4 slices

### Objective
Per-repo page `/repos/:repoId/onboarding-tour` with five sections, "On this page" scroll-spy, honest source/stale/ranking status, and Generate/Regenerate with a ranking-mode toggle. It satisfies US-1..US-5 and AC-1..AC-33, EC-1..EC-23, NFR-1..NFR-13 and UI-1..UI-10 of `specs/05-onboarding-tour.md` (Status: draft, planned as-is).

### Decisions from Phase 1
- [Q1] Precise `/repos/:id/onboarding-tour` match placed before the `includes("/onboarding")` line in `activeKeyFor`. `/onboarding` no longer maps to the tour key. `helpers.test.ts` is updated.
- [Q2] The user explicitly authorises editing `server/src/vendor/shared/adapters.ts`. The `GitClient` interface (line 205) gets a history method. The mock in `server/src/adapters/mocks.ts` and `server/src/adapters/git/simple-git.ts` are updated too.
  - The client copy `client/src/vendor/shared/adapters.ts` is NOT touched. Grep shows nothing in `client/src` outside `vendor/` uses `GitClient`.
- [Q3] In-memory per-repo lock in the service. The GET response includes `generating: boolean`.
- [Q4] Polling stops when `generating=false` OR `generated_at` changes. A failure writes `last_error` into the meta and keeps the previous tour.
- [Q5] GET builds the skeleton live and returns `stored:false` when nothing is stored. Generate on a degraded repo persists a tour with source `skeleton`.
- [Q6] Reuse the exclusion list at `repo-intel/service.ts:709`. An indexed directory is a parent directory of an indexed file.
- [Q7] The model hint `{provider, model}` comes from `feature_models['onboarding']` or the default. It carries no key and makes no model call.
- [Q8] The v1 manifest list is `package.json`, `pnpm-workspace`, `pyproject`/`requirements.txt`, `go.mod`, `Cargo.toml`, compose files, and `.env.example` (key names only). The section shows an empty state when none is found.
- [Q9] EC-1 reason first, plus the EC-7 Settings link additionally.
- [Q10] 60 s history, 120 s model call, 200 s client give-up.
- [Q11] Language is effectively `en`.
- [Q12] Add-repository keys stay intact. Tour keys are rewritten.
- Q-1 (24 000-token budget using the existing estimator) and Q-7 (history stays deepened) → defaults accepted.
- Recommendations 1-7 → all accepted.
- Execution mode → multi-agent, layered in four slices. Execution goes through `/implement`. No implementer is hand-launched.

### Modules affected
- `server/`: new module `modules/onboarding-tour`, the `GitClient` port and its adapters, the prompt, and the contract.
- `client/`: route, components, hooks, sidebar, messages, contract copy.
- `e2e/`: new flow `10-onboarding-tour.flow.json`.
- `reviewer-core/`: not touched. It reads the server copy of shared, so only the typecheck gate is relevant.

### Constraints
- `CLAUDE.md` (root): the two `@devdigest/shared` copies change in the same commit. `*/src/vendor/**` is on the do-not-touch list, so only the authorised `server/src/vendor/shared/adapters.ts` edit is allowed beyond the contracts. Never edit applied migrations (`server/src/db/migrations/**`). Never edit lockfiles. Scope through `getContext()`.
- `server/CLAUDE.md`: modules register statically in `src/modules/index.ts`. Layer files are `routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `constants.ts`. No raw SQL and no HTTP in a service. Route `schema.body` and `schema.params` drive validation. Every handler starts with `getContext`. Take dependencies from `container`, never import a concrete adapter. No `process.env` outside `platform/config.ts`.
  - `repo-intel` always degrades and never throws, so the tour must not fail on a missing index.
  - A single API instance per database is assumed. The in-memory lock relies on that.
- `client/CLAUDE.md`: every component is a folder `<Name>/{Name.tsx, Name.test.tsx, styles.ts, constants.ts, helpers.ts, index.ts}`. Feature components sit in `app/<route>/_components/` with PascalCase folders. Pages stay thin. `fetch` only through `lib/hooks/*` and `lib/api.ts`. User-facing text goes through `next-intl`. Branch on `ApiError.status`. No route may import another route's `_components/`.
  - `MermaidDiagram` is staged, unused code in `components/mermaid-diagram/`. It is being given its first caller, so do not delete it.
- `e2e/CLAUDE.md`: flows are JSON in `specs/NN-name.flow.json`, and the assertions are `wait --text` and `wait --url`. Locators must be deterministic, with no `chat` command. Nothing may trigger a model call, and the data is the seeded `acme/payments-api`.
- `server/INSIGHTS.md` (Decisions, 2026-09-20): compute derived values live instead of storing them. The tour follows this for the skeleton (built on read) and for `stale` (computed on read). `server/INSIGHTS.md` (2026-09-26): the seeded repo always degrades.
- `server/INSIGHTS.md`, Open Questions, 2026-09-25: there are 5 pre-existing failures in `skills.it.test.ts` and `skills-stats.it.test.ts`. They are not caused by this work and are not a gate for it.

### Skills the implementer will apply
| Path / area | Bucket | Skills |
|---|---|---|
| `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts` | contracts | zod, typescript-expert |
| `server/src/vendor/shared/adapters.ts` | vendor | none. Explicit user sign-off. |
| `server/src/adapters/**`, `server/src/modules/onboarding-tour/**`, `server/src/modules/index.ts`, `server/src/prompts/onboarding.system.md`, `server/test/**` | backend | onion-architecture, fastify-best-practices, zod, security, typescript-expert. `repository.ts` also adds drizzle-orm-patterns. |
| `client/src/app/repos/[repoId]/onboarding-tour/**`, `client/src/components/app-shell/**`, `client/src/lib/**`, `client/messages/en/*.json` | frontend | frontend-ui-architecture, next-best-practices, react-best-practices, security, typescript-expert. `*.test.tsx` adds react-testing-library. |
| `e2e/specs/10-onboarding-tour.flow.json` | workflow | security, typescript-expert |
| `INSIGHTS.md` updates at session end | docs | engineering-insights, mermaid-diagram |

### Step-by-step plan

**Slice 1: contracts and adapter port**
1. **[server + client]** Replace the staged `Onboarding`, `OnboardingSection` and `OnboardingLink` with a typed tour contract: five section kinds, per-kind items, and a meta block (source, degraded reason, index SHA, ranking mode, window days, model, generated time, last error, dropped count, truncated flag). Persisted jsonb fields use `.nullish()`. The server copy uses `.default()` and the client copy uses `.optional()`. Add the GET response (`stored`, `generating`, `stale`, model hint, file count, `can_use_activity`) and the POST generate request (mode, window_days integer 7..730 → 422 `validation_error`). Both copies are edited in the same commit. Touches `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts`. (CONTRACT:tour, NFR-11, EC-10, AC-28, AC-17, AC-18, AC-19, EC-11, AC-29)
2. **[server]** Add a history method to `GitClient`. Signature: `historyCounts(repo, sinceDays): Promise<Record<string, number>>`, run with argv arrays (`git fetch --shallow-since`, `git log --name-only`) and a 60 s abort. Implement it in `simple-git.ts` and stub it in `mocks.ts`. Touches `server/src/vendor/shared/adapters.ts`, `server/src/adapters/git/simple-git.ts`, `server/src/adapters/mocks.ts`. (EC-9, UI-8, AC-26)
3. **[server + client]** Contract schema tests in both copies: defaults for missing meta, rejection of out-of-range windows, and an old-document round trip. Touches `server/test/onboarding-tour-contract.test.ts` and a test next to the client copy. (NFR-11, EC-10)
- Slice 1 gate: `server: typecheck`, `client: typecheck`, `core: typecheck`, `server: test-unit`.
- Suggested commit: `feat(shared): add typed onboarding tour contract and git history port`.

**Slice 2: skeleton, page, scroll-spy and e2e (no model call, no ranking toggle)**

Server, client and e2e run in parallel here, on disjoint files.

4. **[server]** Create module `modules/onboarding-tour`.
   - `constants.ts`: budgets and manifest list.
   - `helpers.ts`: pure facts collector, skeleton builder, rank/exclusion ordering (reusing `repo-intel/service.ts:709`), directory-set grounding.
   - `repository.ts`: reads and writes `onboarding`, joined through `repos.workspace_id`.
   - `service.ts`: live skeleton, persist on generate, in-memory lock, stale computation.
   - `routes.ts`: `GET /repos/:repoId/onboarding-tour` and `POST /repos/:repoId/onboarding-tour/generate` (stub that stores the skeleton in slice 2, 409 on concurrent, 202 `status: "running"`).
   - Register in `modules/index.ts`.
   - Touches `server/src/modules/onboarding-tour/*` and `server/src/modules/index.ts`. (AC-3, AC-4, AC-10, AC-19, AC-20, AC-28, AC-32, AC-33, EC-1, EC-4, EC-7, EC-11, EC-15, EC-16, EC-19, EC-21, EC-22, NFR-1, NFR-3, NFR-4, NFR-5, NFR-13, UI-9)
5. **[server]** Hermetic tests for the collector, skeleton determinism, exclusion, and per-package grouping. A DB-backed `.it.test.ts` covers workspace scoping, 409 and restart semantics. Touches `server/src/modules/onboarding-tour/helpers.test.ts` and `server/test/onboarding-tour.it.test.ts`. (NFR-3, NFR-5, EC-4, EC-16, EC-21, EC-22, UI-9)
6. **[client]** Fix `activeKeyFor`: add the precise tour match before the `includes("/onboarding")` line and stop mapping `/onboarding` to the tour key. Add the sidebar item between Pull Requests and Project Context. Add the `shell.json` label and update `helpers.test.ts` (three cases). Touches `client/src/components/app-shell/helpers.ts`, `helpers.test.ts`, the sidebar nav definition in `client/src/components/app-shell/`, `client/messages/en/shell.json`. (AC-1, AC-2)
7. **[client]** Route `app/repos/[repoId]/onboarding-tour/page.tsx` (thin), with `_components/` folders: `TourPage`, `TourHeader` (badges, status, ranking label, Stale, "~N files"), `TourSection` (collapsible, `aria-expanded`), `ArchitectureSection` (Markdown with code chips; `MermaidDiagram` built from grounded nodes and edges with quoted labels, `securityLevel: "strict"`), `CriticalPathsSection`, `RunLocallySection` (copy button, `aria-live`), `ReadingPathSection`, `FirstTasksSection`, `OnThisPage` (nav, scroll-spy). Hooks in `lib/hooks/useOnboardingTour.ts` (query, mutation, poll). (AC-3..AC-9, AC-11..AC-19, AC-21, AC-22, AC-30, AC-31, EC-3, EC-5, EC-6, EC-15, EC-18, EC-19, EC-20, EC-23, NFR-7..NFR-10, UI-4, UI-5, UI-6)
   - Scroll-spy specifics: `IntersectionObserver` with a top band, click-lock until `scrollend`, `replaceState` on spy, instant scroll under reduced motion, a collapsed target expands before scrolling, heading focus via `tabIndex=-1`, hash on load, exactly one `aria-current="true"`.
   - Strings go in `client/messages/en/onboarding.json`: Add-repository keys stay, tour keys are rewritten.
8. **[client]** Component and hook tests: scroll-spy, click-lock, collapse, hash load, copy success and denied, Open link rel and target, Stale and "No index yet", poll give-up and retry. Touches `*.test.tsx` next to each component. (AC-11..AC-16, AC-30, AC-31, EC-5, EC-6, EC-18, NFR-9)
9. **[e2e]** New flow `10-onboarding-tour.flow.json`: open the tour for the seeded repo, wait for the skeleton section headings, the status badge and the "On this page" menu, with no Generate click. Do NOT touch `06-onboarding.flow.json`. Touches `e2e/specs/10-onboarding-tour.flow.json`. (NFR-13, AC-2, AC-3, AC-17, EC-1)
- Slice 2 gate: `server: typecheck, lint, arch, test-unit`; `client: typecheck, lint, arch, test`; `e2e: typecheck`; DB-backed `cd server && pnpm exec vitest run onboarding-tour.it.test` (Docker).
- Suggested commit: `feat(onboarding-tour): add deterministic tour skeleton page with on-this-page menu`.

**Slice 3: LLM enrichment and grounding merge**

Server work and the client touches run in parallel where files are disjoint.

10. **[server]** Rewrite `server/src/prompts/onboarding.system.md`: five sections, structured nodes and edges instead of a markdown mermaid field, no `routes_and_apis`, `{{language}}`, and an untrusted-data rule. Touches `server/src/prompts/onboarding.system.md`. (UI-1, UI-10, UI-6, Q-6)
11. **[server]** Service: one `completeStructured` call with 120 s timeout using the `feature_models['onboarding']` model, facts wrapped with `wrapUntrusted`, `redactSecrets` applied to all repo text, `.env.example` key names only, 24 000-token budget with truncation in rank order (recorded in meta). Schema validation failure discards the output. The grounding merge drops unknown paths (counted), keeps only fact-derived commands, and drops unknown diagram nodes. Failure behaviour: no stored `llm` tour → store the skeleton with `last_error` (EC-2); a stored `llm` tour exists → keep it and write `last_error` (EC-3). Log per generation without prompt text (NFR-12). Touches `server/src/modules/onboarding-tour/service.ts`, `helpers.ts`, `constants.ts`. (AC-20, AC-22, AC-28, AC-29, AC-32, AC-33, EC-2, EC-3, EC-7, EC-12, EC-13, EC-14, EC-17, EC-20, NFR-1, NFR-2, NFR-6, NFR-12, UI-2, UI-3, UI-7, UI-10)
12. **[server]** Tests using the mock LLM: grounding drops, command allowlist, validation failure, timeout, budget truncation, and one call per generation. Touches `server/src/modules/onboarding-tour/helpers.test.ts` and `server/test/onboarding-tour.it.test.ts`. (EC-2, EC-3, EC-12, EC-13, EC-14, EC-17, NFR-1, NFR-2, NFR-6)
13. **[client]** Wire Generate/Regenerate: a "Generating…" disabled state until `generating=false` or `generated_at` changes, the model-hint tooltip, the "Written by <model>" badge, the EC-7 Settings link, and the EC-3 "Last regeneration failed" notice. Touches `_components/TourHeader/**`, `lib/hooks/useOnboardingTour.ts`, `client/messages/en/onboarding.json`. (AC-17, AC-20, AC-21, AC-22, AC-29, EC-3, EC-7)
- Slice 3 gate: same as slice 2.
- Suggested commit: `feat(onboarding-tour): enrich tour with grounded structured model output`.

**Slice 4: activity (hotness) mode**
14. **[server]** Service: call the history method before ranking when mode is `activity`. Rank by `pagerank × (1 + hotness)` where hotness is the commit count divided by the maximum, with path ascending tie-break. It is computed for the tour only (`file_rank` is untouched). On history failure or a 60 s timeout, fall back to import graph and record that in meta. A missing clone is refused with a clear reason. The `can_use_activity` field is false without a clone. Touches `server/src/modules/onboarding-tour/service.ts`, `helpers.ts`, `constants.ts`. (AC-26, AC-27, AC-28, NFR-4, EC-8, EC-9, EC-10, UI-8)
15. **[client]** Ranking-mode toggle next to Generate, days input prefilled 180 when activity is selected, disk-growth warning, the option disabled with the EC-8 reason, the "Active recently" label at hotness ≥ 0.5, and the fallback line from EC-9. Touches `_components/RankingToggle/**`, `_components/TourHeader/**`, `client/messages/en/onboarding.json`. (AC-23, AC-24, AC-25, AC-27, EC-8, EC-9, AC-18)
16. **[server + client]** Tests: the hotness formula and tie-break, 422 bounds (6, 7, 730, 731, non-integer), EC-9 fallback, `file_rank` unchanged, toggle and warning rendering. (AC-24, AC-25, AC-26, EC-9, EC-10, NFR-4)
- Slice 4 gate: same as slice 2.
- Suggested commit: `feat(onboarding-tour): add activity-weighted ranking mode`.

### Execution
Multi-agent, layered. Each slice is committed separately, and execution goes through `/implement`.

| Slice / workstream | Agent | Steps | Files owned | Depends on | Parallel with |
|---|---|---|---|---|---|
| S1 contracts + port | implementer | 1-3 | `*/src/vendor/shared/contracts/knowledge.ts`, server `adapters.ts`, `adapters/**` | — | — |
| S2 server | implementer | 4-5 | `server/src/modules/onboarding-tour/**`, `server/src/modules/index.ts` | S1 | S2 client, S2 e2e |
| S2 client | implementer | 6-8 | `client/src/app/**`, `client/src/components/app-shell/**`, `client/src/lib/**`, `client/messages/**` | S1 | S2 server, S2 e2e |
| S2 e2e | implementer | 9 | `e2e/specs/10-*` | S1 | the other S2 workstreams |
| S3 server | implementer | 10-12 | `server/src/prompts/**`, service, helpers | S2 | S3 client |
| S3 client | implementer | 13 | `TourHeader/**`, hooks | S2 | S3 server |
| S4 server | implementer | 14, 16 | service, helpers | S3 | S4 client |
| S4 client | implementer | 15, 16 | `RankingToggle/**` | S3 | S4 server |
| Tests | test-writer | as listed per slice | `*.test.ts(x)` | the slice's code | — |
| Review | architecture-reviewer ∥ security-reviewer ∥ plan-verifier | — | read-only | the slice | each other |

No file appears in two workstreams within a slice. `service.ts` and `helpers.ts` are edited in slices 2, 3 and 4 in sequence, never in parallel.

### Test plan
- `cd server && pnpm typecheck && pnpm lint && pnpm arch` catches layering, `process.env` and adapter-import violations.
- `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` runs the hermetic tests: collector, grounding, hotness, and the contract.
- `cd server && pnpm exec vitest run onboarding-tour.it.test` (Docker) covers tenancy scoping, the 409, and restart behaviour.
- `cd client && pnpm typecheck && pnpm lint && pnpm arch && pnpm test` covers `activeKeyFor`, scroll-spy and accessibility behaviour, and the `fetch` ban.
- `cd reviewer-core && npm run typecheck` (needed because it reads the server shared copy).
- `cd e2e && npm run typecheck`, then `./scripts/e2e.sh` on a freshly seeded DB for flow 10. The other flows must still pass.

### Risks / open questions
- **Explicit user sign-off recorded:** the user authorised editing `server/src/vendor/shared/adapters.ts` (the `GitClient` port). This is the only vendor edit beyond the `contracts/` edits. The client copy `client/src/vendor/shared/adapters.ts` is not edited, because nothing in `client/src` outside `vendor/` imports `GitClient`. The two `adapters.ts` copies are already drifted, so the port method is deliberately server-only.
- The `knowledge.ts` contract edits in both vendor copies are listed in root "Do not touch" territory (`*/src/vendor/**`) only nominally. The spec explicitly requires them, and the plan treats that as the requested edit.
- No migration is planned. All meta lives in the existing `json` jsonb. If review finds a need for a column, stop and ask.
- The in-memory lock assumes one API instance (`server/CLAUDE.md`). Replicas would allow two concurrent generations.
- The Stale badge over-reports on docs-only commits (Q-4, accepted).
- The history fetch deepens the local clone permanently (Q-7, accepted). The disk-growth warning covers it.
- The 200 s client give-up leaves only a 20 s margin over the 180 s server ceiling (Q-2, accepted).
- `SPEC-05` stays `Status: draft`. It has no changes from these decisions. Decisions Q1, Q3, Q4, Q5 and Q9 refine behaviour the spec leaves open (for example `stored:false`, `generating`, and the lock). If you want them recorded in the spec itself, that is a `spec-creator` edit of the draft, not part of this plan.
- Pre-existing failures from `server/INSIGHTS.md` (2026-09-25) in `skills*.it.test.ts` may show up in a full `.it` run and are unrelated.
- Next step: save and commit this plan, then run `/implement` for slice 1.

---

## Hand-back 3

Noted: SPEC-05 is now `Status: approved` (commit ce1e301, only line 3 changed, content identical). The plan I delivered in my previous handback is unchanged in substance. Apply these edits when saving it.

1. Objective: replace "(Status: draft, planned as-is)" with "(Status: approved, ce1e301)".
2. Risks, the `SPEC-05 stays Status: draft` bullet: replace it with the text below.
   - "SPEC-05 is approved (ce1e301). Decisions Q1, Q3, Q4, Q5 and Q9 refine behaviour the spec leaves open (for example `stored:false`, `generating`, the in-memory lock, and the EC-1 over EC-7 precedence). The spec is not edited. An approved spec is superseded by a new spec, which `spec-creator` writes. Do that only if you want these decisions recorded there."
3. The Phase 1 caveat about planning from a draft no longer applies.

Nothing else in the plan changes.