## Hand-back 1

## Plan verification: SPEC-05 Onboarding Tour (pass 1 of 2)

Method: I read the server module, the contract and git adapter, and the client page, hook and components. I re-ran the gates myself. "Pass" means I read the code that satisfies the item. Rows that only a test or browser could prove are marked Unverified. Suites that ran green count as evidence only for what they assert, and I did not open each test file.

### Gates re-run (my own runs)
- `./scripts/check.sh server typecheck|lint|arch|test`: all PASS. Tests: 400 passed.
- `./scripts/check.sh client typecheck|lint|arch|test`: all PASS. Tests: 357 passed.
- `./scripts/check.sh core typecheck`: PASS.
- `cd e2e && npm run typecheck`: PASS.
- `cd server && pnpm exec vitest run onboarding-tour.it.test`: 22/22 passed (Docker available).
- `./scripts/e2e.sh` 10/10: cited from your log, not re-run by me.

### Matrix
**Plan steps**

| ID | Status | Evidence |
|---|---|---|
| S1.1 contract and meta, both copies | Pass | Both `knowledge.ts` are in the diff (+140 each); `knowledge.test.ts` (client) and `server/test/onboarding-tour-contract.test.ts` pass |
| S1.2 `historyCounts`: argv, 60 s abort, mock | Pass | `server/src/adapters/git/simple-git.ts:133-167` (AbortController 60 s, argv `raw([...])`); `mocks.ts` (+7); the IT test runs it against a real clone |
| S1.3 contract tests | Pass | Both test files exist and pass |
| S2.4 server module, routes, registration | Pass | `routes.ts`; `modules/index.ts` (+2); `repository.ts` joins through `repos.workspace_id` |
| S2.5 server tests | Pass | `helpers.test.ts`, `onboarding-tour.it.test.ts` (22 passing) |
| S2.6 `activeKeyFor`, sidebar item, tests | Pass | `app-shell/helpers.ts:29-31`; `vendor/ui/nav.ts` adds the item between pulls and context |
| S2.7 client route and components | Pass | Every listed component exists under `_components/`; `page.tsx` is thin |
| S2.8 client tests | Pass | Tests sit next to the components; the client suite is green |
| S2.9 e2e flow 10 | Pass | `e2e/specs/10-onboarding-tour.flow.json`; logged 10/10 |
| S3.10 prompt rewrite | Pass | `onboarding.system.md` has the untrusted-data rule and no `routes_and_apis` (grep showed only the untrusted rule) |
| S3.11 single LLM call, merge, failure rules | Pass | `service.ts:170-292`, `enrichment.ts`. The NFR-12 logging inside this step fails; see NFR-12 |
| S3.12 enrichment tests | Pass | `enrichment.test.ts` (190 lines) |
| S3.13 header wiring | Pass | `TourHeader.tsx`, hook |
| S4.14 activity mode on the server | Fail | Uses `percentile` (smallint 0-100) in place of PageRank; see AC-26 |
| S4.15 `RankingToggle` | Pass | `RankingToggle.tsx` |
| S4.16 tests | Pass | `RankingToggle.test.tsx`; IT suite |
| Slice gates (plan Test plan) | Pass | See gates above |
| Skills-applied row | Unverified | No evidence of skill application is checkable |

**Spec US / AC**

| ID | Status | Evidence |
|---|---|---|
| US-1..US-5 | Pass | Covered by the AC rows below; the AC failures listed below also touch US-1 and US-4 |
| AC-1 | Pass | `nav.ts` |
| AC-2 | Pass | `helpers.ts:29-31` (`/onboarding` returns "") |
| AC-3 | Pass | `constants.ts` SECTION_DEFS order |
| AC-4 | Pass | `service.ts:127` builds a live skeleton; TourHeader shows Generate when `!stored` |
| AC-5 | Unverified | `ArchitectureSection.tsx` uses Markdown and a diagram only when an edge exists (`buildDiagramSource`). The inline code-chip styling was not checked |
| AC-6 | Pass | `CriticalPathsSection.tsx` |
| AC-7 | Pass | `RunLocallySection.tsx` |
| AC-8 | **Fail** | Reading path is limited to 8, not 5: `constants.ts:9` `READING_PATH_LIMIT = 8`. The same limit is used in `enrichment.ts:190`, and `ReadingPathSection.tsx` does no slice |
| AC-9 | Pass | `FirstTasksSection.tsx` slices to 3, shows a complexity label and a suggestion marker |
| AC-10 | **Fail** | `service.ts:302-305` replaces the stored `rank` with `percentile`, an integer 0-100 (`db/schema/repo-intel.ts:115`). `orderByRank` (`helpers.ts:36`) then sorts by percentile. Ties that stored `file_rank.rank` would separate get broken by path instead |
| AC-11 | Pass | `OnThisPage.tsx` `goTo` sets active, scrolls and expands. Test is `OnThisPage.test.tsx` |
| AC-12 | Unverified | Code is an IntersectionObserver with a top band; needs a test or browser |
| AC-13 | Pass | `flushSync(onExpand)` before the scroll |
| AC-14 | Pass | Heading focus plus `replaceState` |
| AC-15 | Pass | Hash-on-load effect |
| AC-16 | Pass | `TourSection.tsx` `aria-expanded`; all sections open on first load |
| AC-17 | Pass | `TourHeader/helpers.ts` `statusBadgeKey`, i18n keys |
| AC-18 | Pass | `TourHeader.tsx` meta line |
| AC-19 | Pass | `computeStale`; badge shown when `freshness === 'stale'` |
| AC-20 | Pass | `routes.ts:51`, 202 running |
| AC-21 | Pass | Hook `waiting` state, loading-disabled button; done on `generating=false` or a `generated_at` change per Q4 |
| AC-22 | Pass | Hook invalidates and refetches |
| AC-23 | Pass | `RankingToggle.tsx` |
| AC-24 | Pass | Days input prefilled with 180 |
| AC-25 | Pass | `tour.ranking.warning` |
| AC-26 | **Fail** | The score is `percentile × (1 + hotness)`, not `pagerank × (1 + hotness)`: `helpers.ts:32` with `rank` set from `percentile` at `service.ts:305`. Hotness is normalised by the max over ranked files only, which is acceptable |
| AC-27 | Pass | `isActiveRecently` (>= 0.5) in both the critical-paths and reading-path lists |
| AC-28 | Pass | `meta` fields set in `buildSkeleton`/`mergeGrounded` |
| AC-29 | Pass | `TourHeader.tsx` model hint |
| AC-30 | Pass | `RunLocallySection.tsx` writeText plus `aria-live` |
| AC-31 | Pass | `CriticalPathsSection.tsx` uses `githubBlobUrl` with `index_sha || default_branch`, `target=_blank`, `rel="noopener noreferrer"` |
| AC-32 | Pass | `mergeGrounded`'s `grounded` filter. Facts derive from the index. One caveat: a first task that mixes grounded and ungrounded paths keeps the task and strips the bad path (`enrichment.ts:201`) |
| AC-33 | Pass | `commandsFromManifest`. A `.env.example` copy command is not emitted, only env key names. "only" is a restriction, so that is acceptable. Subpackage manifests get no install command (`helpers.ts:138`); this is not a spec Fail |

**Spec EC**

| ID | Status | Evidence |
|---|---|---|
| EC-1 | Pass | `service.ts:181-185` stores the skeleton with no model call |
| EC-2 | Pass | `storeFailure` |
| EC-3 | Pass | `storeFailure` keeps the llm tour and writes `last_error`; `TourHeader` notice |
| EC-4 | Pass | `ConflictError` at `service.ts:155` |
| EC-5 | Pass | Hook `TOUR_POLL_TIMEOUT_MS = 200_000`, Retry button |
| EC-6 | Pass | Hook and `TourPage.tsx` |
| EC-7 | Unverified | Code path exists (ConfigError leads to "Model not configured", Settings link). I did not confirm that `/settings/models` resolves: `app/settings/[section]` exists, but I did not check that "models" is a valid `section` value |
| EC-8 | Pass | 422 at `service.ts:152`; option disabled with the reason text (approved deviation) |
| EC-9 | Pass | `service.ts:313-326`, `ranking_fallback` |
| EC-10 | Pass | Contract bounds 7..730; contract tests pass. The 422 at the route was not run by me beyond the IT suite |
| EC-11 | Pass | `freshnessState` |
| EC-12 | Pass | `groundList`, `dropped_count`. Same caveat as AC-32 |
| EC-13 | Pass | Commands come from the skeleton only (`enrichment.ts:172-181`) |
| EC-14 | Pass | `enrichment.ts:203` |
| EC-15 | Pass | `tour.empty.*` messages. "Naming the missing fact" is loosely met |
| EC-16 | Pass | `withDir` gives `cd <dir> && …` |
| EC-17 | Pass | `buildFactsPrompt` truncates in order and records `truncated` |
| EC-18 | Pass | `copyFailed` |
| EC-19 | Pass | `TourPage.tsx` `RepoNotFound`; server 404 |
| EC-20 | Pass | Nodes and edges dropped; diagram only with an edge. When no model node survives, the skeleton diagram is used instead of text only (acceptable) |
| EC-21 | Pass | `getTopFilesByRank` applies `isJunkPath`. I did not open the pattern list (`JUNK_PATH_PATTERNS`) to confirm it covers tests, config, declarations, migrations and fixtures |
| EC-22 | Pass | In-memory `Set`, reset on restart |
| EC-23 | Unverified | `Markdown` (react-markdown) with no raw-HTML plugin; no test seen |

**Spec NFR**

| ID | Status | Evidence |
|---|---|---|
| NFR-1 | Pass | One `completeStructured` call, `maxRetries: 0`; GET makes no call |
| NFR-2 | Pass | `withTimeout` and `timeoutMs` at 120 s |
| NFR-3 | Unverified | `helpers.test.ts` covers determinism. It depends on the AC-10 ordering |
| NFR-4 | Pass | No writes to `file_rank` anywhere in the module |
| NFR-5 | Pass | `repository.ts` joins through `repos.workspace_id`; handlers call `getContext` |
| NFR-6 | **Fail** | The 24 000-token budget applies to the facts block only (`enrichment.ts:37,43`). The system prompt (343 words) is added on top, so total input can exceed 24 000 |
| NFR-7 | Unverified | Tour strings are in `onboarding.json`. The diff shows no removed lines, so existing keys are intact. The stale `generate.body` text still describes the old sections |
| NFR-8 | Unverified | Needs an a11y check. Complexity is text |
| NFR-9 | Pass | `OnThisPage.tsx` nav with an aria-label and one `aria-current` |
| NFR-10 | Pass | `prefersReducedMotion` |
| NFR-11 | Pass | Contract tests cover an old-document round trip |
| NFR-12 | **Fail** | Logs omit ranking mode and window. `service.ts:183,216,232-243` log repoId, provider, model, tokens, dropped, outcome and ms, but never `opts.mode` or `window_days`. The degraded-skeleton log also has no model or tokens |
| NFR-13 | Pass | e2e 10/10 (your log) |

**Spec UI**

| ID | Status | Evidence |
|---|---|---|
| UI-1 | Pass | `wrapUntrusted` at `enrichment.ts:74`; prompt instructs the model to treat it as data |
| UI-2 | Pass | `redact` on every line; key names only; `.env` is not in `MANIFEST_NAMES` |
| UI-3 | Pass | `RawTour` schema via `completeStructured`; failure stores the skeleton |
| UI-4 | Pass | `githubBlobUrl` uses `encPath` |
| UI-5 | Unverified | See EC-23 |
| UI-6 | Pass | `ArchitectureSection/helpers.ts` (quoted, escaped, synthetic ids); `MermaidDiagram.tsx:37` `securityLevel: "strict"` |
| UI-7 | Pass | Clipboard only; commands come from facts |
| UI-8 | Pass | Integer validated; argv `raw([...])` |
| UI-9 | Unverified | `clone-files.ts` uses `readContextFile` (its comment says it refuses symlinks). The `..` and absolute-path rejection is not checked |
| UI-10 | Pass | Prompt rule plus grounding merge |

### Verdict
Fails found: 6 rows — AC-8, AC-10, AC-26, NFR-6, NFR-12, and plan step S4.14 (which follows from AC-26). Unverified rows (test or browser needed): AC-5, AC-12, EC-7, EC-23, NFR-3, NFR-7, NFR-8, UI-5, UI-9, and the skills-applied row. All other rows Pass. All gates I re-ran are green.

### Fail rows
- **AC-8**: the reading path allows 8 items. Spec says at most 5. `server/src/modules/onboarding-tour/constants.ts:9`; `enrichment.ts:190`.
- **AC-10**: ordering uses `file_rank.percentile`, not stored `file_rank.rank`. Ties follow the path tie-break even when the ranks differ. `server/src/modules/onboarding-tour/service.ts:302-305`; `helpers.ts:36`.
- **AC-26 / S4.14**: the activity score is `percentile × (1 + hotness)`, not `pagerank × (1 + hotness)`. `helpers.ts:32`; `service.ts:305`.
- **NFR-6**: the 24 000 budget excludes the system prompt, so total input can exceed the limit. `enrichment.ts:37`; `service.ts:189-195`.
- **NFR-12**: generation logs do not include ranking mode or window. `service.ts:183,216,232-243`.

### Not covered by the plan
- Multi-package repos get no install command. The package manager is detected from root lockfiles only, so a repo like this one with `server/` and `client/` subpackages defaults to `npm` (`helpers.ts:138`; `clone-files.ts:70`). This is behavioural, not a spec Fail.
- Stale legacy text remains in `client/messages/en/onboarding.json` (`generate.body` describes the old five sections).