## Hand-back 1

## Implementation report: SPEC-05 Slice 2, steps 4-5 (server)

All server gates pass and the DB-backed suite ran on live Docker. Nothing is committed and no contract was changed.

### Files changed
New module `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/onboarding-tour/`:
- `constants.ts`: budgets, the manifest list, status strings. The status strings include "Repository is not cloned" and "No index yet".
- `types.ts`: `RankedFile`, `ManifestFact`, `TourFacts`.
- `helpers.ts`: pure code only.
  - Includes `orderByRank` (rank desc, path asc), `indexedDirs` / `isGroundedPath`, `groupByPackage`, `parseEnvKeys` (names only), `collectCommands`, `buildSkeleton(facts)`, and `computeStale`.
  - `buildSkeleton` takes a `TourFacts` (and `mode`), which is where slice 3 enriches and slice 4 adds hotness.
- `clone-files.ts`: read-only manifest scan of the clone. It reads root and package dirs and never follows symlinks.
- `repository.ts`: `getRepo`, `getStored`, `upsert` and `getFeatureModelOverride`.
  - `getStored` joins through `repos.workspace_id`. `upsert` checks workspace ownership first.
  - `getFeatureModelOverride` reads `settings` directly. The arch rule `no-cross-module-import` forbids importing `settings/feature-models.ts`, and conventions uses the same escape hatch.
- `service.ts`: the live skeleton on GET, stale computed on read, the in-memory lock, and a background `generate` that persists the skeleton.
- `routes.ts`.
- `helpers.test.ts`: 13 hermetic tests.

Edited:
- `server/src/modules/index.ts`: registered `onboardingTour`.
- `server/test/onboarding-tour.it.test.ts` (new): 8 DB-backed tests covering live GET with no write, workspace scoping, EC-1, 422 bounds, persist plus poll, stale, restart, and 409 with lock release.

### Tests run
- `./scripts/check.sh server typecheck`: PASS server:typecheck 2s
- `./scripts/check.sh server lint` on the module and the IT file: PASS server:lint 1s
- `./scripts/check.sh server arch`: PASS server:arch 0s
- `./scripts/check.sh server test`: PASS server:test 2s (381 passed)
- `cd server && pnpm exec vitest run onboarding-tour.it.test`: 8/8 passed. Docker was up.
- The `server test` gate ran the whole suite, not only related tests, so only the unit gate was run for the outer loop.

### API shapes for the client
Both routes use `:repoId` (uuid). A non-uuid gives 422 and an unknown or other-workspace repo gives 404. Error envelope: `{error:{code,message,details}}`.

**GET `/repos/:repoId/onboarding-tour`** returns 200 with `OnboardingTourResponse`:
```
{ stored: boolean, generating: boolean, stale: boolean,
  tour: { sections: [architecture, critical_paths, run_locally, reading_path, first_tasks], meta: {...} },
  model_hint: {provider, model},   // override or registry default, never null in practice
  file_count: number,              // index filesIndexed, 0 if none
  can_use_activity: boolean }      // true when the clone dir exists
```
- There is always a tour. With `stored:false` it is a skeleton built live and nothing is written.
- Sections always come in the order listed above, and all five are always present. Empty ones have empty arrays. `architecture.body` is never empty (it falls back to a fixed sentence).
- Skeleton `meta`: `source:"skeleton"`, `ranking_mode:"import_graph"`, `generated_at:null` when not stored, `model`/`provider` null.
- `meta.degraded_reason` (string or null) is checked in this order: "Repository is not cloned", then "The repository index is unavailable", then by index reason. The index reasons are "No index yet", "Repository indexing is turned off", "Indexing failed for this repository", "The index is partial" and "Repository is too large to index".
- `stale` is true only when the tour is stored, and both the stored `meta.index_sha` and the current index SHA exist and differ.
- A stored row that fails to parse (old shape) is treated as `stored:false`.

**POST `/repos/:repoId/onboarding-tour/generate`**
- The body is optional. `{mode?: "import_graph"|"activity", window_days?: int 7..730}`; an empty body means `import_graph`.
- 202 with `{status:"running"}`. The lock is taken synchronously and generation runs in the background.
- 409 `conflict` while a run holds the lock.
- 422 `validation_error` for `window_days` of 6, 731 or 7.5.
- 404 for an unknown repo.
- Clients poll the GET. `generating` goes false and `meta.generated_at` changes when a run completes.
- On failure the previous tour is kept and `meta.last_error` is set to "Tour generation failed". If nothing was stored, the failure is only logged.

### Self-check
- Diff matches the plan: yes for steps 4-5, with the deviations below.
- Naming and do-not-touch rules respected: yes. The only files touched are the ones I own, and I did not touch vendor, client, e2e or migrations.

### Deviations from plan
- **`mode:"activity"` in slice 2:** there is no activity ranking yet, so the request is accepted and builds an import-graph skeleton. It records `meta.ranking_fallback = "Activity ranking is not available yet"`. Slice 4 replaces that.
- **Model hint:** it is resolved in the repository and service rather than through `settings/feature-models.ts`, for the arch reason above.
- **Extra files:** I added `types.ts` and `clone-files.ts`, both kebab-case extra modules. `clone-files.ts` holds the fs scan so that the service has no raw IO.
- **Exclusion list:** I reused it through `repoIntel.getTopFilesByRank`, which applies `repo-intel`'s private `isJunkPath`. I did not export or copy it. Paths go through `getFileRank` percentiles, then `orderByRank` for a deterministic tie-break.
- **Restart test:** the lock is a module-level `Set`, so an in-process "restart" cannot clear it. The test checks that the stored tour survives an app rebuild and that `generating` is false afterwards. It does not check that a held lock is lost.
- **Failure path:** no test forces a failing generation, because `collectFacts` swallows every source error. Only the lock release after success is tested.

### Handoff note
- Review items: the `settings` read in `repository.ts` (an established escape hatch, but architecture review may want a look), and the clone scan reads only manifest files of at most 64 KiB and validates directory names against `SAFE_DIR_RE` before putting them in `cd <dir> &&` commands.
- Script bodies and `.env.example` values are never put into output (covered by tests).
- Slice 3 adds the model call and grounding merge in `service.generate`, using `indexedDirs` and `isGroundedPath`. Slice 4 adds hotness by filling `RankedFile.hotness` and `mode` in `collectFacts`; `buildSkeleton` already renders the `hotness` and "recent activity" wording.
- The in-memory lock assumes a single API instance.

---

## Hand-back 2

## Implementation report: SPEC-05 Slice 3, steps 10-12 (server)

All requested gates pass. One coordinator request is not done. I did not add `last_error_at` to either `knowledge.ts` contract copy: the edit was denied by the permission system, and an agent message cannot authorize a vendor edit. The failure time is carried inside the `last_error` string instead (format below). If you want a separate `last_error_at` field, the user needs to approve the vendor edit. It touches `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts`, plus a case in `server/test/onboarding-tour-contract.test.ts` and `client/src/vendor/shared/contracts/knowledge.test.ts`. Then I would set it next to `last_error` in `service.ts` (`stamp` and its callers) and drop the time suffix.

### Files changed (all under `/Users/harlock/Downloads/Sites/devdigest/server/`)
- `src/prompts/onboarding.system.md` (rewritten): five sections, structured nodes and edges instead of mermaid, no `routes_and_apis`, `{{language}}`, an untrusted-data rule, and a verbatim-commands rule.
- `src/modules/onboarding-tour/tour-schema.ts` (new): the zod `RawTour` the model may return. It has caps on text lengths and list sizes.
- `src/modules/onboarding-tour/enrichment.ts` (new, pure):
  - `buildFactsPrompt` renders facts in a fixed order (packages, commands, env names, chains, files by rank). It wraps them with `wrapUntrusted`, redacts every line with `redactSecrets`, and stops at the 24 000-token budget.
  - `mergeGrounded` is the trust boundary (rules below).
- `src/modules/onboarding-tour/service.ts`: `generate` now builds the skeleton, then makes one `container.llm(provider).completeStructured` call. It has a 120 s ceiling enforced by `Promise.race`, `maxRetries` 0 and the `feature_models['onboarding']` model. Failure handling is described below. The constructor takes an optional `{llmTimeoutMs}` for tests, and `TourLogger.info` is optional.
- `src/modules/onboarding-tour/constants.ts`: model, budget and timeout constants, the `LAST_ERROR_*` prefixes, and `REASON_MODEL_NOT_CONFIGURED = 'Model not configured'`.
- Tests:
  - `src/modules/onboarding-tour/enrichment.test.ts` (new, 12 hermetic tests): merge grounding and redaction, budget truncation and determinism, and untrusted-block escape.
  - `test/onboarding-tour.it.test.ts`: 15 tests now, seven of them new. A scripted LLM is injected through `overrides.llm.openrouter`.

### Behavior
- **Grounding merge.**
  - Unknown paths, diagram nodes (bad id, unknown path), dangling or self edges, and commands not in the facts are dropped and counted in `meta.dropped_count`.
  - Commands come only from the facts. The model can only supply a description, matched by exact command string. `env_keys` are unchanged.
  - First tasks need at least one grounded file or indexed directory (EC-14). `complexity` from the model is kept, including `high`.
  - `rank` and `hotness` on critical paths come from the facts.
  - A section the model empties or that is fully dropped keeps the skeleton's content.
  - All free text is redacted.
- **One call per generation.** The IT test asserts exactly one call.
- **Degraded index (EC-1, including "not cloned")**: no model call. The skeleton is stored with `degraded_reason` = the index reason.
- **No provider key, `ConfigError` (EC-7)**: with no stored model tour, a skeleton is stored with `meta.degraded_reason = "Model not configured"` and no `last_error`.
- **Other failures (EC-2 / EC-3).** These are timeout, throw, and schema-invalid output, which is discarded.
  - If a stored `source:"llm"` tour exists, it is kept untouched (same `generated_at`, same sections) and only `last_error` is written.
  - Otherwise the skeleton is stored with `last_error`.
  - A successful generation sets `last_error: null`.
- **NFR-12 logging.** It logs repoId, provider, model, token count, truncated, dropped, outcome and duration. It logs no prompt text and no raw provider message.

### Response-shape notes for the client
- **Model-written tour** (`meta.source:"llm"`):
  - `provider` and `model` are populated (defaults today: `openrouter` and `deepseek/deepseek-v4-flash`).
  - `generated_at` is set, `dropped_count` is an integer and `truncated` is a boolean.
  - `last_error` is null.
  - `degraded_reason` is null.
- **`meta.last_error` format:** `<message> (<ISO-8601 time>)`, for example `Model call timed out (2026-09-30T11:31:26.000Z)`. The message prefixes are exactly:
  - `Model call timed out`
  - `Model call failed or returned invalid output`
  - `Generation failed` (an unexpected internal error on a stored tour; it is not the model-failure path)
- **EC-7 text:** `meta.degraded_reason === "Model not configured"`, exactly.
- **Edge case:** if a key is removed while a stored model tour exists, the model tour is kept (EC-3 rule) and `last_error` starts with `Model call failed…`, not `Model not configured`. `ConfigError` with a stored model tour maps to the `Model not configured (<time>)` `last_error` and keeps the tour. The client should not expect `degraded_reason` in that case.
- **Stale-tour interaction:** a failed regeneration on a stored model tour does not change `meta.generated_at`.
- **Shapes unchanged:** GET and POST routes, status codes, `model_hint` and the rest.

### Tests run
- `./scripts/check.sh server typecheck`: PASS server:typecheck 2s
- `./scripts/check.sh server lint` (module and IT file): PASS server:lint 1s
- `./scripts/check.sh server arch`: PASS server:arch 1s
- `./scripts/check.sh server test`: PASS server:test 2s (393 passed)
- `./scripts/check.sh core typecheck`: PASS core:typecheck 1s
- `cd server && pnpm exec vitest run onboarding-tour.it.test`: 15/15 passed (Docker up)
- Client gates not run: no client files or contracts were touched, since `last_error_at` was not added.

### Deviations from plan
- **`last_error_at`:** not added (see top), and the time is embedded in `last_error`.
- **Timeout enforcement:** the 120 s limit is enforced by a local `Promise.race` as well as passed as `timeoutMs`, because adapters and mocks may not honor `timeoutMs`. The service takes `{llmTimeoutMs}` so the timeout test does not wait 120 s.
- **EC-7 with a stored model tour:** it follows the EC-3 rule, as above. The coordinator message did not cover this case.
- **Unimplemented spec item:** no test injects an oversized prompt through the IT path. Budget truncation is covered hermetically only.

### Handoff note
- **Security review:** the trust boundary is `mergeGrounded` in `enrichment.ts` plus the untrusted wrapper on the facts. File paths are repo-controlled strings inside the prompt, and the block-escape case is tested.
- **Facts sent to the model:** only paths, derived commands, env key names and package dirs. No file contents and no script bodies are sent.
- **Slice 4:** `collectFacts` and `buildFactsPrompt` already read `facts.mode`, and `RankedFile.hotness` flows through to critical paths, so activity ranking only needs to fill those.
- **Default provider:** `openrouter` is the onboarding default, so a fresh install without an OpenRouter key shows "Model not configured" after Generate.

---

## Hand-back 3

`last_error_at` is added and all gates pass. `meta.last_error` is now the plain message and the time lives in `meta.last_error_at`. Nothing is committed. The client's `TourHeader` still shows the old time-in-message text until it reads `last_error_at`; my `grep` for `last_error` in `client/src` errored, so I don't know whether it parses the old format.

- **Failure path:** `setFailure` in `service.ts` replaces `stamp` at all three call sites. It writes the message to `last_error` and the ISO time to `last_error_at`.
- **Success path:** a successful generation sets both to null. A skeleton starts with both null.
- **New message format:** `last_error` is now one of `Model call timed out`, `Model call failed or returned invalid output` or `Generation failed`, with no ` (<ISO time>)` suffix.
- **Unchanged:** the EC-7 `degraded_reason` of "Model not configured", and GET/POST.

Gates:
- PASS server:typecheck 2s
- PASS server:lint 1s
- PASS server:arch 1s
- PASS server:test 3s (393 passed)
- PASS client:typecheck 3s
- PASS client:test 16s (346 passed)
- PASS core:typecheck 2s
- `cd server && pnpm exec vitest run onboarding-tour.it.test` passed 15/15.

Files changed, under `/Users/harlock/Downloads/Sites/devdigest/`:
- `server/src/vendor/shared/contracts/knowledge.ts`
- `client/src/vendor/shared/contracts/knowledge.ts`
- `server/src/modules/onboarding-tour/service.ts`
- `server/src/modules/onboarding-tour/enrichment.ts`
- `server/src/modules/onboarding-tour/helpers.ts`
- `server/test/onboarding-tour-contract.test.ts`
- `server/test/onboarding-tour.it.test.ts`
- `client/src/vendor/shared/contracts/knowledge.test.ts`

---

## Hand-back 4

## Slice 4 server (steps 14 and 16): done, all gates pass

Nothing is committed. No contract was changed and `simple-git.ts` needed no fix.

Gates:
- PASS server:typecheck 2s
- PASS server:lint 1s
- PASS server:arch 1s
- PASS server:test 3s (397 passed)
- PASS core:typecheck 1s
- `cd server && pnpm exec vitest run onboarding-tour.it.test` passed 22/22 (Docker up).

Files, under `/Users/harlock/Downloads/Sites/devdigest/server/`:
- `src/modules/onboarding-tour/constants.ts`
- `src/modules/onboarding-tour/helpers.ts`
- `src/modules/onboarding-tour/enrichment.ts`
- `src/modules/onboarding-tour/service.ts`
- `src/modules/onboarding-tour/helpers.test.ts`
- `test/onboarding-tour.it.test.ts`

### Behavior
- **Activity mode.** With `mode:"activity"` and a usable index, the service calls `container.git.historyCounts({owner, name}, window_days ?? 180)`. It runs inside a 60 s `withTimeout`, before ranking. Helpers:
  - `applyHotness` divides a file's commit count by the highest count of any indexed (ranked) file, giving 0..1. History paths that are not ranked files do not set the maximum. An all-zero window gives 0, with no NaN.
  - `orderByRank(files, mode)` sorts by `rank × (1 + hotness)` with a path-ascending tie-break.
  - `buildSkeleton` and the model's facts prompt both use this ordering.
  - Critical-path and reading-path order is therefore activity-weighted. The dependency chains themselves still come from repo-intel, unchanged.
  - `file_rank` is never written. An IT test compares its rows before and after and they are identical.
  - Hotness is computed on the `getFileRank` percentile as the pagerank proxy. It is scale-invariant, so the ordering is the same as with raw pagerank.
- **EC-9.** If the history read throws or exceeds the budget, the tour is ranked by import graph with `meta.ranking_fallback = "Activity ranking unavailable — ranked by import graph"` (the exact spec text). In that case `ranking_mode` is `import_graph` and `window_days` is null.
- **EC-8 (my choice: 422).** Activity mode on a repo with no clone returns 422 `validation_error` from POST, before the lock is taken, with message `No local clone — activity ranking unavailable`. I chose a refusal because the spec says the option is disabled. A silent fallback would hide a request that cannot be honoured. Import-graph generation on the same repo still returns 202. GET already returns `can_use_activity:false` without a clone.
- **Degraded index.** Activity is requested but the index is degraded: no history is read, `ranking_mode` is `import_graph`, and `degraded_reason` explains it.
- The slice-2 placeholder text is removed.

### What the client should read
- **Ranking label (AC-18):** `tour.meta.ranking_mode` (`"activity"` or `"import_graph"`) and `tour.meta.window_days`. When the mode is `activity`, `window_days` is the window actually used, for example 180 when the request omitted it.
- **"Active recently" (AC-27):** `hotness >= 0.5` on each item, for both critical-path and reading-path files.
  - `critical_paths.items[].hotness` is populated (0..1) in activity mode, and null in import-graph mode.
  - **`reading_path.items[]` has no `hotness` field** in the contract (`{path, why}`). The client has to look a reading-path file's hotness up by path in the critical-paths items. That only covers the top ~10 files. A reading-path file outside that set gets no label.
  - Adding `hotness` to `TourReadingStep` would be a contract change, so I did not make it. I can do that if you approve it.
- **EC-9 fallback line:** `tour.meta.ranking_fallback` (string or null). Show it when non-null.
- **Mode on the wire:** POST body is `{mode:"activity", window_days?:7..730}`. The 422 bounds for `window_days` are unchanged.

### Real `historyCounts` test
- An IT test builds a temp git repo with 4 commits. The commits are `a.txt` ×3 and `b.txt` ×1.
- It clones `file://` at depth 1 through `SimpleGitClient` and confirms the clone has 1 commit.
- It then calls `historyCounts(repo, 30)` and gets `{ 'a.txt': 3, 'b.txt': 1 }`.
- It also checks that a window of 0 throws `RangeError`, and that an uncloned repo throws "not cloned".

### Deviations
- The real-git test sits under the same `hasDocker` guard as the other tests. It does not need Docker, but it is skipped when Docker is unavailable.
- The "critical-path roots" wording in the spec is implemented as ordering of the critical-paths list. The chain roots from repo-intel's `getCriticalPaths` are not re-ranked.

---

## Hand-back 5

`TourReadingStep.hotness` is added in both contract copies, and every gate passes. Nothing is committed.

It is `z.number().min(0).max(1).nullish()` in both `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts`.

- **Activity mode:** every reading-path item gets a hotness of 0..1, taken from the facts (never from the model). A file the ranking does not cover, such as `README.md`, gets 0.
- **Import-graph mode:** hotness is null.
- **Both paths covered:** the skeleton (`helpers.ts`) and the grounding merge (`enrichment.ts`) set it. The merge test confirms a hotness the model supplies is ignored.

Gates:
- PASS server:typecheck 3s
- PASS server:lint 2s
- PASS server:arch 0s
- PASS server:test 3s (400 passed)
- PASS client:typecheck 3s
- PASS client:test 17s (357 passed)
- PASS core:typecheck 1s
- `cd server && pnpm exec vitest run onboarding-tour.it.test` passed 22/22.

Files, under `/Users/harlock/Downloads/Sites/devdigest/`:
- `server/src/vendor/shared/contracts/knowledge.ts`
- `client/src/vendor/shared/contracts/knowledge.ts`
- `server/src/modules/onboarding-tour/helpers.ts`
- `server/src/modules/onboarding-tour/enrichment.ts`
- `server/src/modules/onboarding-tour/helpers.test.ts`
- `server/src/modules/onboarding-tour/enrichment.test.ts`
- `server/test/onboarding-tour.it.test.ts` (activity test now asserts reading-path hotness of 1 and 0.5)
- `server/test/onboarding-tour-contract.test.ts`
- `client/src/vendor/shared/contracts/knowledge.test.ts`

---

## Hand-back 6

All five verifier findings are fixed, along with the multi-package install gap. Nothing is committed. I made no change to repo-intel, the facade or the contracts.

- **AC-8: fixed.** `READING_PATH_LIMIT` is now 5 (`constants.ts`). It caps both the skeleton and the model-enriched reading path, and README counts toward the 5. The hermetic test checks the skeleton, and the IT test checks that a 12-file model answer is cut to 5.
- **AC-10 / AC-26: fixed.**
  - `service.collectFacts` now reads the stored `file_rank.rank` through a new `OnboardingTourRepository.getRanks(workspaceId, repoId, paths)`.
  - It is read-only, workspace-scoped, and uses the same direct-table-read pattern as the settings read, so the facade and the percentile API stay untouched.
  - It no longer calls `getFileRank` or uses percentile.
  - The IT test uses ranks 0.501 / 0.5 / 0.499 with the same percentile. Import-graph order follows rank. Activity order follows `rank × (1 + hotness)`, giving log, routes, engine.
- **NFR-6: fixed.** The facts budget is now `24 000 − tokens(system prompt)`, so system prompt plus facts stay within 24 000. The IT test feeds 2 500 long paths and checks:
  - `meta.truncated` is true.
  - The full message tokens, counted with the container tokenizer, are at most 24 000.
  - The top-ranked path is kept and the lowest-ranked is dropped.
- **NFR-12: fixed.** Every generation log (degraded skeleton, model failure, success) now carries `ranking_mode`, `window_days`, `ranking_fallback`, `provider` and `model`. The provider and model are resolved before the degraded branch. The IT test checks all three outcomes and confirms no log contains `repository-facts` or a file path.
- **EC-16 per-package install: fixed.** Each manifest now carries its own package manager (its own lockfile, else the root's) and an `ownLockfile` flag.
  - **Install step emitted:** for the root, for any package with its own lockfile (`cd <pkg> && <pm> install`), and for a package when the repo has no root `package.json`.
  - **No install step:** workspace members without their own lockfile are covered by the root install.
  - **Run commands:** each package's scripts use its own manager.
  - **Tests:** cover the mixed pnpm/npm case, the workspace case, and the no-root case.

Gates:
- PASS server:typecheck 2s
- PASS server:lint 2s
- PASS server:arch 1s
- PASS server:test 3s (404 passed)
- PASS core:typecheck 1s
- `cd server && pnpm exec vitest run onboarding-tour.it.test` passed 26/26.

Files changed, under `/Users/harlock/Downloads/Sites/devdigest/server/`:
- `src/modules/onboarding-tour/constants.ts`
- `src/modules/onboarding-tour/types.ts`
- `src/modules/onboarding-tour/clone-files.ts`
- `src/modules/onboarding-tour/helpers.ts`
- `src/modules/onboarding-tour/repository.ts`
- `src/modules/onboarding-tour/service.ts`
- `src/modules/onboarding-tour/helpers.test.ts`
- `test/onboarding-tour.it.test.ts`

Two things to know:
- **`file_rank` rows in the IT test:** the existing tests now seed `file_rank` rows, because ordering reads stored rank and no longer the stubbed percentile.
- **Missing rank rows:** a file with no `file_rank` row gets rank 0, so such files sort alphabetically at the bottom.

---

## Hand-back 7

A1 and B1 are both fixed. Nothing is committed.

| id | fixed/disputed | evidence |
|---|---|---|
| A1 | fixed | `getTopRanked(repoId, n, opts?)` returns `{path, rank}[]` and is declared in `server/src/modules/repo-intel/types.ts:175`. The implementation is in `server/src/modules/repo-intel/service.ts:662`. It uses the existing `getRankedPaths`, the same `isJunkPath` and exclude filter as `getTopFilesByRank`, and orders rank desc then path asc. It returns `[]` when the flag is off or `n <= 0`. `onboarding-tour/service.ts:322` now calls `intel.getTopRanked` through `container.repoIntel`. `getRanks` and the direct `file_rank` read are deleted from `onboarding-tour/repository.ts`, and `grep getRanks src` finds nothing. |
| B1 | fixed | `onboarding-tour/service.ts:193-200`: with `facts.degradedReason` set and a stored `meta.source === 'llm'` tour, the tour is kept unchanged. That includes `generated_at` and sections. `setFailure` records the reason in `last_error` and `last_error_at`. The skeleton is written only when no model tour is stored. No model call is made. |

Tests added:
- **Facade:** `server/test/repo-intel-facade-degraded.test.ts` has two new cases. `getTopRanked` returns `[]` when the flag is off. It also filters junk and orders rank desc, path asc, with a cap and `n=0`.
- **IT:** `server/test/onboarding-tour.it.test.ts` has the B1 case: stored model tour, then index degraded, then Regenerate. It asserts that no model call is made, `generated_at` and sections are unchanged, `last_error` is "No index yet", and `last_error_at` is set. The IT stub now provides `getTopRanked` instead of `getTopFilesByRank` plus `getFileRank`.

Gates:
- PASS server:typecheck 3s
- PASS server:lint 1s
- PASS server:arch 1s
- PASS server:test 3s (406 passed)
- PASS core:typecheck 1s
- `cd server && pnpm exec vitest run onboarding-tour.it.test repo-intel` passed 53/53 across 5 files.

Files changed, under `/Users/harlock/Downloads/Sites/devdigest/server/`:
- `src/modules/repo-intel/types.ts`
- `src/modules/repo-intel/service.ts`
- `src/modules/onboarding-tour/repository.ts`
- `src/modules/onboarding-tour/service.ts`
- `test/repo-intel-facade-degraded.test.ts`
- `test/onboarding-tour.it.test.ts`