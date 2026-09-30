# Implementation Plan: SPEC-05 Onboarding Tour
Spec: `specs/05-onboarding-tour.md` · Status: approved (ce1e301) · Execution: multi-agent, 4 slices

### Objective
Per-repo page `/repos/:repoId/onboarding-tour` with five sections, "On this page" scroll-spy, honest source/stale/ranking status, and Generate/Regenerate with a ranking-mode toggle. It satisfies US-1..US-5 and AC-1..AC-33, EC-1..EC-23, NFR-1..NFR-13 and UI-1..UI-10 of `specs/05-onboarding-tour.md` (Status: approved, ce1e301).

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
- SPEC-05 is approved (ce1e301). Decisions Q1, Q3, Q4, Q5 and Q9 refine behaviour the spec leaves open (for example `stored:false`, `generating`, the in-memory lock, and the EC-1 over EC-7 precedence). The spec is not edited. An approved spec is superseded by a new spec, which `spec-creator` writes. Do that only if you want these decisions recorded there.
- Pre-existing failures from `server/INSIGHTS.md` (2026-09-25) in `skills*.it.test.ts` may show up in a full `.it` run and are unrelated.
- Next step: save and commit this plan, then run `/implement` for slice 1.
