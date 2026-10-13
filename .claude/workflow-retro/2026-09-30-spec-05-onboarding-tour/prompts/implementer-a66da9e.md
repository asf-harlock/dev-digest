Execute `.claude/sdd/SPEC-05/plan.md`, **Slice 2, steps 4-5 (server) only**. Spec: `specs/05-onboarding-tour.md` (approved). Repo: /Users/harlock/Downloads/Sites/devdigest, branch L05-lab. Slice 1 (typed contract in `server/src/vendor/shared/contracts/knowledge.ts`, `GitClient.historyCounts`) is committed as 402df9a — build on it; do not change the contracts (if you believe one must change, stop and report instead).

You are workstream S2-server of a multi-agent run. Files owned: `server/src/modules/onboarding-tour/**`, `server/src/modules/index.ts`, `server/test/onboarding-tour.it.test.ts`. The client and e2e workstreams run in parallel on other files — don't touch client/ or e2e/. Run only the inner loop.

Slice-2 scope: deterministic skeleton only — NO model call and NO activity/hotness mode yet (those are slices 3 and 4). `POST .../generate` in this slice persists the skeleton (source `skeleton`) with the in-memory per-repo lock, 409 on concurrent, 202 `status: "running"`. Structure service/helpers so slice 3 (LLM enrichment + grounding merge) and slice 4 (activity ranking) can be added without rewriting.

Gates: `./scripts/check.sh server typecheck`, `server lint`, `server arch`, `server test`; plus the DB-backed `cd server && pnpm exec vitest run onboarding-tour.it.test` (needs Docker/Postgres; if Docker is not running, say so and report it Blocked rather than skipping silently). Do not commit. Report: files changed, gate PASS/FAIL lines, deviations, and the exact GET/POST response shapes the client should rely on (route paths, status codes).

---
## Resume 1

Slice 2 is committed (7b3ecf3; note: contract `TourFirstTask` now also has `complexity: 'low'|'medium'|'high'` nullish, and `buildSkeleton` sets it via `firstTaskComplexity`). Now execute `.claude/sdd/SPEC-05/plan.md` **Slice 3, steps 10-12 (server)**. Spec `specs/05-onboarding-tour.md`.

You are workstream S3-server. Files owned: `server/src/prompts/onboarding.system.md`, `server/src/modules/onboarding-tour/**`, `server/test/onboarding-tour.it.test.ts`. The client workstream runs in parallel on client/ — don't touch client/ or contracts (stop and report if a contract change is needed). Run only the inner loop.

Scope reminders: one `completeStructured` call per generation with the `feature_models['onboarding']` model through `container.llm`/`buildLlm` (follow `server/src/modules/reviews/intent-classifier.ts`), 120 s timeout; `wrapUntrusted` + `redactSecrets` from reviewer-core on all repo-derived text; `.env.example` key names only; 24 000-token budget with deterministic truncation recorded in meta; the model may supply prose, descriptions, why-lines, task titles/complexity (incl. `high`), diagram nodes/edges — grounding merge drops unknown paths (count into meta), commands come ONLY from deterministic facts, unknown diagram nodes dropped, first tasks must target an existing file or indexed dir (EC-14); schema-invalid output discarded. Failure semantics: EC-2 (no stored llm tour → store skeleton + last_error), EC-3 (stored llm tour → keep it, write last_error + time), EC-7 missing key/ConfigError → skeleton with reason "model not configured" style; degraded index (EC-1) → no model call at all. NFR-12 logging without prompt text. Also add the forced-failure test that slice 2 couldn't (mock LLM throwing / timing out). Note the facts collector currently swallows errors — keep that, but the LLM path must be testable.

Gates: `./scripts/check.sh server typecheck`, `server lint`, `server arch`, `server test`, `core typecheck`, and `cd server && pnpm exec vitest run onboarding-tour.it.test`. Don't commit. Report files, PASS/FAIL lines, deviations, and any response-shape change the client must know about (meta fields populated for llm source, last_error format).

---
## Resume 2

Coordination from the client workstream (it finished step 13):
1. EC-7: spec text is exact — the skeleton reason must be the string "Model not configured" (client matches `meta.degraded_reason === "Model not configured"`). Put it in `onboarding-tour/constants.ts` and emit exactly that when the onboarding feature model has no provider key / buildLlm throws ConfigError. EC-1 index reasons still take precedence (plan Q9) — in that case no model call is attempted, so EC-7 only applies when the index is usable.
2. EC-3 requires "Last regeneration failed · <time>", and plan Q4 says the failure writes last_error "and its time" — but `TourMeta` has no failure timestamp. You are authorised to extend the contract minimally: add `last_error_at` (ISO datetime string, `.nullish()`) to `TourMeta` in BOTH `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts` (same shape both copies, like `complexity`), plus a case in both contract tests. Set it with last_error on EC-2/EC-3 failures; clear both on a successful generation.
3. `model_hint`: currently empty strings when nothing resolves — fine, client hides it when `model` is empty.
Include these in your slice-3 report; add `client typecheck` + `client test` to your gates since you touch the client contract copy.

---
## Resume 3

The USER (via AskUserQuestion in the main session, not an agent) explicitly approved adding `last_error_at` to the contract. Please do it now: add `last_error_at` (ISO datetime string, `.nullish()`, same shape) to `TourMeta` in BOTH `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts`, a case in `server/test/onboarding-tour-contract.test.ts` and `client/src/vendor/shared/contracts/knowledge.test.ts`; in `service.ts` set it alongside `last_error` (stamp + callers), drop the ` (<ISO time>)` suffix from `last_error` so it is just the message, clear both on success; update IT tests. If the permission system prompts, that prompt goes to the user — do not work around a denial; if denied again, stop and report. Gates: server typecheck/lint/arch/test, client typecheck/test, core typecheck, `cd server && pnpm exec vitest run onboarding-tour.it.test`. Don't commit. Report PASS/FAIL lines only plus files.

---
## Resume 4

Slice 3 committed (edb17c8). Now execute `.claude/sdd/SPEC-05/plan.md` **Slice 4, steps 14 and 16 (server part)**. Spec `specs/05-onboarding-tour.md`. Workstream S4-server; files owned: `server/src/modules/onboarding-tour/**`, `server/test/onboarding-tour.it.test.ts`, and `server/src/adapters/git/simple-git.ts` only if `historyCounts` needs a fix once exercised. Client runs in parallel — don't touch client/ or contracts (stop and report if one must change). Run only the inner loop.

Scope: when `mode === "activity"`, call `container.git...historyCounts(repo, window_days)` before ranking (60 s budget); hotness = count / max count (0..1), tour ordering = `pagerank × (1 + hotness)` with path-ascending tie-break, for the tour only — `file_rank` untouched (add a test asserting it is unchanged, NFR-4). EC-9: history failure/timeout → import-graph ranking + meta fallback "Activity ranking unavailable — ranked by import graph" (exact spec text). EC-8: no clone → refuse activity with a clear reason (decide 422 vs honest fallback per spec EC-8 wording and report), `can_use_activity` false. Persist `ranking_mode` + `window_days` in meta; remove the slice-2 "Activity ranking is not available yet" placeholder. Also exercise `historyCounts` for real at least once in an IT test against a temporary local git repo with a few commits (a `file://` origin clone at depth 1), since slice 1 only covered it by typecheck. EC-10 422 bounds already covered — keep.

Gates: server typecheck/lint/arch/test, core typecheck, `cd server && pnpm exec vitest run onboarding-tour.it.test`. Don't commit. Report PASS/FAIL lines, files, deviations, and meta fields the client should read for "Active recently" (per-file hotness on reading_path/critical_paths items) and the fallback line.

---
## Resume 5

The USER (via AskUserQuestion in the main session) explicitly approved adding `hotness` to `TourReadingStep` for AC-27. Please: add `hotness` (number 0..1, `.nullish()`, same shape as on `TourCriticalPath`) to `TourReadingStep` in BOTH `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts`, with a case in both contract tests; populate it for every reading-path item in activity mode (null in import-graph mode), in both the skeleton and the grounding merge (hotness always from facts, never the model); update tests. If the permission system prompts, that goes to the user; if denied, stop and report. Gates: server typecheck/lint/arch/test, client typecheck/test, core typecheck, `cd server && pnpm exec vitest run onboarding-tour.it.test`. Don't commit. Report PASS/FAIL lines + files.

---
## Resume 6

plan-verifier pass 1 found these server Fail rows (details in `.claude/sdd/SPEC-05/verify-1.md`). Fix them within your owned files (onboarding-tour module + IT test; a read-only addition to the repo-intel facade/repository only if strictly needed to get stored `rank` — report it if you do):
- AC-8: reading path must list at most 5 files (`constants.ts:9` READING_PATH_LIMIT = 8; `enrichment.ts:190`).
- AC-10 / AC-26: ordering must use the stored `file_rank.rank` (PageRank), not `percentile` (`service.ts:302-305`, `helpers.ts:32,36`); activity score = `rank × (1 + hotness)`, tie-break path ascending. Percentile collapses distinct ranks into ties.
- NFR-6: the 24 000-token budget must cover the whole model input (system prompt + facts), not just facts (`enrichment.ts:37,43`, `service.ts:189-195`).
- NFR-12: the per-generation log must include ranking mode and window (and model/provider where one applies, also on the degraded-skeleton path) — still no prompt text (`service.ts:183,216,232-243`).
Also, not a Fail but plan-adjacent: multi-package repos get no per-package install command and the package manager is detected from root lockfiles only (`helpers.ts:138`, `clone-files.ts:70`). SPEC EC-16 says run commands are grouped per package with a `cd <pkg>` prefix — please make sure each detected package gets its install step from its own lockfile/manifest; report if that is out of reach.
Add tests for each. Gates: server typecheck/lint/arch/test, core typecheck, `cd server && pnpm exec vitest run onboarding-tour.it.test`. Don't commit. Report `fixed`/`disputed` per ID with PASS/FAIL lines.

---
## Resume 7

Fix mode. Findings file: `.claude/sdd/SPEC-05/review-round-1.json`, ids: A1, B1 (both decision "fix" by the user). HEAD is 81581d8, working tree clean.
- A1: stop reading `file_rank` directly from `onboarding-tour/repository.ts` (`getRanks`). Add a read-only method on `RepoIntelService` (facade in `server/src/modules/repo-intel/types.ts` + `service.ts`, backed by the existing `repo-intel/repository.ts` `getRankedPaths` or a sibling query) that returns `{path, rank}[]` — keep repo-intel's degrade-never-throw contract (`[]` on degraded), apply the same junk-path filter as `getTopFilesByRank`, deterministic order (rank desc, path asc). Call it via `container.repoIntel` in `onboarding-tour/service.ts` and delete `getRanks`. Update the degraded-facade test (`server/test/repo-intel-facade-degraded.test.ts`) and any mocks of the facade. You now own those repo-intel files for this fix.
- B1: in `service.generate`, when `facts.degradedReason` is set and a stored tour with `meta.source === 'llm'` exists, keep that tour unchanged and record the degraded reason in `meta.last_error` + `meta.last_error_at` (as `storeFailure` does); write the skeleton only when no llm tour is stored. Add an IT test (stored llm tour → index degraded → Regenerate → llm content kept, last_error set).
Gates: server typecheck/lint/arch/test, core typecheck, `cd server && pnpm exec vitest run onboarding-tour.it.test repo-intel`. Don't commit. Reply with the Fix-mode table (id | fixed/disputed | file:line evidence) + PASS/FAIL lines.