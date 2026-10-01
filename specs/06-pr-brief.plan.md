# Implementation Plan: SPEC-06 PR Why + Risk Brief
Spec: `specs/06-pr-brief.md` · Status: approved · Execution: multi-agent, contract-first gate
Plan file: `specs/06-pr-brief.plan.md` · Revision 2 (after the cross-model review in `specs/06-pr-brief.plan-review.md`)

### Objective
On the Overview tab of `/repos/:repoId/pulls/:number`, add a PR Brief section.
It has a Generate brief button, a summary, Risk areas inside the Intent card next to the Blast radius card, and a full-width Review focus list.
Clicking a focus item or a risk's file reference deep-links to `?tab=diff&file=&line=`.
It is backed by a new server module `brief/` (`GET` and `POST /pulls/:id/brief`).
It satisfies US-1..US-6, AC-1..AC-27, AC-30, AC-31, EC-1..EC-26, NFR-1..NFR-14 and UI-1..UI-9 of `specs/06-pr-brief.md`.
AC-28 and AC-29 (US-7) are deferred by D10 and are not in this plan.

### Decisions from Phase 1
- [Q-2] The linked-issue regex and lookup move to `server/src/modules/_shared/linked-issue.ts`, used by both the classifier and the brief → accepted.
- [Q-5] A 90 s overall model deadline (`BRIEF_MODEL_DEADLINE_MS`) and a 120 s client give-up → accepted. The per-attempt timeout is simplified to one `BRIEF_ATTEMPT_TIMEOUT_MS = 30_000` (review cut). Reason: `openai.ts:88-110` applies `timeoutMs` per HTTP attempt.
- [Q-8] Keep `ConfigError`'s HTTP 500 `config_error`. The client branches on `code` → accepted.
- [Contract] Add `ReviewFocusItem`, `BriefModelOutput`, `BriefEnvelope` and `BriefResponse`. Leave `PrBrief` and `Risks` untouched. `Risk.file_refs` stays `string[]` of `path` or `path:start[-end]`, with one shared parse/format helper → accepted.
- [Q-A] The Risk areas row stays optional in `IntentCard` and is fed from the brief's `risks` → accepted.
- [Q-B] The summary renders as plain text inside the PR Brief section. There is no `VerdictBanner` (AC-28 is deferred) → accepted.
- [Q-E] One merged, de-duplicated `resolveProjectContext` call under a dedicated, smaller budget. Partially unreadable docs count as present as long as at least one entry is `ok` with text (F9) → accepted.
- [Q-F] File order for EC-19 and for trimming: `core → wiring → tests → docs → boilerplate`, then path ascending → accepted.
- [Q-G] A null `generated_for_sha` is not stale → accepted.
- Execution mode → multi-agent, contract-first gate. Execution goes through `/run-plan`. No implementer is hand-launched.
- The vendor edit of `*/src/vendor/shared/contracts/brief.ts` (both copies, same commit) is user-approved. The vendor port `server/src/vendor/shared/adapters.ts` stays unchanged (no `signal` is added).
- Cross-model review (F1..F14): all findings accepted. See "Cross-model review resolution".

### Modules affected
- `server/`: new module `modules/brief/`. New `_shared/` helpers (`linked-issue.ts`, `smart-diff-roles.ts`, `blast-map.ts`, `hunk-headers.ts`). A prompt file. Route registration. Original callers in `reviews/` and `blast/` are edited in place (no re-export shims).
- `client/`: PR Brief section on Overview. A `brief` hook. Deep-link support in `page.tsx`, `DiffTab`, `SmartDiffGroups` and the shared `components/diff-viewer/{FileCard,DiffViewer,CodeLine}`. `IntentCard` risk chips. `messages/en/brief.json`. Contract copy.
- `e2e/`: a flow for the no-brief state.
- `reviewer-core/`: not touched. It reads the server copy of shared, so only its typecheck gate applies.

### Constraints
- `CLAUDE.md` (root):
  - The two `@devdigest/shared` copies change in the same commit.
  - `*/src/vendor/**` is on the do-not-touch list, so only the approved `contracts/brief.ts` edit is allowed. No test file is placed under `*/src/vendor/**` (F10).
  - Do not edit applied migrations or lockfiles.
  - Scope every query through `getContext()`.
  - Secrets are read only through `LocalSecretsProvider`.
  - `pnpm arch` must stay green.
- `server/CLAUDE.md`:
  - Modules register statically in `modules/index.ts`.
  - Layer files are `routes.ts`, `service.ts`, `repository.ts`, `helpers.ts`, `constants.ts`.
  - No raw SQL and no HTTP in a service.
  - Every handler starts with `getContext`.
  - Take dependencies from `container`. Do not import a concrete adapter (`no-concrete-adapter-in-modules`).
  - No cross-module imports (`no-cross-module-import` in `server/.dependency-cruiser.cjs`). The brief therefore does not import `settings/feature-models.ts` (F1). Pure shared helpers go in `modules/_shared/`.
  - No `process.env` outside `platform/config.ts`.
  - The in-memory lock assumes one API instance.
- `client/CLAUDE.md`:
  - Every component is a folder `<Name>/{Name.tsx, Name.test.tsx, styles.ts, constants.ts, helpers.ts, index.ts}`.
  - Feature components sit in `app/**/_components/`.
  - Fetch only through `lib/hooks/*` and `lib/api.ts`.
  - User-facing text goes through `next-intl` and is never hardcoded.
  - Branch on `ApiError.status`/`code`.
  - Do not import another route's `_components/`.
- `e2e/CLAUDE.md`: flows are JSON in `specs/NN-name.flow.json` with `wait --text` and `wait --url` assertions. No `chat` command, no model call, and the data is the seeded `acme/payments-api`.
- `server/INSIGHTS.md` (Decisions, 2026-09-20): compute derived values live. `stale` and `generating` are therefore computed on read, never stored.
- `server/INSIGHTS.md` (Open Questions, 2026-09-25): there are pre-existing failures in `skills.it.test.ts` and `skills-stats.it.test.ts`. They are unrelated and are not a gate.
- Adapter behaviour (`server/src/adapters/llm/openai.ts`, `server/src/vendor/shared/adapters.ts:55-62`): `StructuredRequest` has `timeoutMs` but no `signal`, and `completeStructured` retries at most `maxRetries` (default 2) on a strict `json_schema`. `withRetry` also retries transport errors. The output schema therefore has no optional fields, and an in-flight call cannot be cancelled.
- `server/src/modules/_shared/project-context.ts`: `PROJECT_CONTEXT_TOKEN_BUDGET` is 16 000, the same as the brief's prompt cap. The spec-docs budget must be a separate, smaller constant.
- `server/src/app.ts:94-97`: the rate limiter is not registered when `nodeEnv === 'test'`, so NFR-9 needs a route-level test that registers it or asserts the route `config`.

### Skills the implementer will apply
| Path / area | Bucket | Skills |
|---|---|---|
| `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts` | contracts | zod, typescript-expert |
| `server/src/modules/brief/**`, `server/src/modules/_shared/**`, `server/src/modules/reviews/**`, `server/src/modules/blast/**`, `server/src/modules/index.ts`, `server/src/prompts/**`, `server/test/**` | backend | onion-architecture, fastify-best-practices, zod, security, typescript-expert. `repository.ts` also adds drizzle-orm-patterns. |
| `client/src/app/repos/[repoId]/pulls/[number]/**`, `client/src/components/diff-viewer/**`, `client/src/lib/**`, `client/messages/en/brief.json` | frontend | frontend-ui-architecture, next-best-practices, react-best-practices, security, typescript-expert. `*.test.tsx` adds react-testing-library. |
| `e2e/specs/11-pr-brief.flow.json` | workflow | security, typescript-expert |
| `specs/06-pr-brief.plan.md` (this file) | spec | spec-authoring |
| `INSIGHTS.md` updates at session end | docs | engineering-insights, mermaid-diagram |

### Step-by-step plan

**Slice 0: delivery gate (before any feature code)**
0. **[docs]** Commit `specs/06-pr-brief.md`, `specs/06-pr-brief.plan.md` and `specs/06-pr-brief.plan-review.md` together, before any code change. Suggested commit: `docs(brief): add SPEC-06, its implementation plan and cross-model review`. (Delivery: P1, P2)

**Slice 1: contracts (W1)**
1. **[server + client]** Extend `contracts/brief.ts` in BOTH copies in the same commit. Leave `PrBrief`, `Risks` and `Risk` untouched.
   - `ReviewFocusItem { file, line, reason }`.
   - `BriefModelOutput { summary, risks: Risk[], review_focus: ReviewFocusItem[] }`. Every field is required (strict JSON schema) and `line` is an integer.
   - `BriefMissingInput { kind, reason? }`. `kind` is an enum: `intent_missing`, `intent_other_sha`, `blast_degraded`, `specs_missing`, `description_empty`, `issue_not_referenced`, `issue_unreachable`, `files_truncated`, `prompt_trimmed`.
   - `BriefEnvelope`: the brief plus nullish `intent` and `blast` snapshots, `generated_for_sha`, `generated_at`, `provider`, `model`, `missing_inputs`, tokens in and out, cost, `last_error` and `last_error_at`. Every persisted field is `.nullish()`, so an error-only document validates (F8, EC-5, EC-21).
   - `BriefResponse`: `brief`, `meta`, `generating`, `stale`, `missing_inputs`.
   - `parseFileRef` and `formatFileRef` for `path[:start[-end]]`. They are pure, dependency-free and identical in both copies.
   - Touches `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts`. (CONTRACT:brief.ts, NFR-7, NFR-10, EC-21, EC-22, AC-10, AC-14, AC-25, AC-21, AC-20)
2. **[server + client]** Contract tests, none under `*/src/vendor/**` (F10).
   - Server: `server/test/brief-contract.test.ts`. Client: `client/src/lib/brief-contract.test.ts`. Both import the contract through the `@devdigest/shared` alias and use identical `parseFileRef`/`formatFileRef` vectors, so any drift between the copies fails one of them.
   - Cases: the old-envelope round trip with missing fields (EC-22), an error-only envelope validates (F8), an invalid document (EC-21), a colon in a path, and bad ranges.
   - Both files are owned by W1. (NFR-7, EC-5, EC-21, EC-22)
- Slice 1 gate: `server: typecheck`, `client: typecheck`, `core: typecheck`, `server: test-unit`, `client: test`.
- Suggested commit: `feat(shared): add brief model output, envelope and file-ref contracts`.

**Slice 2: server (W2) and client plus e2e (W3) run in parallel on disjoint files**

*Server*

3. **[server]** Move pure helpers into `_shared/`. Callers are updated in place and their tests move with them. No re-export shims are left behind (F11).
   - `_shared/linked-issue.ts`: `LINKED_ISSUE_RE` plus `resolveLinkedIssue({ container, repoRef, body })` returning `{ status: 'none' | 'used' | 'unreachable', text?, note? }`. It fetches through the `container.github().getIssue` port. `reviews/intent-classifier.ts` calls it.
   - `_shared/smart-diff-roles.ts`: `classifyFile` and `SMART_DIFF_RULES`, moved from `reviews/smart-diff/`. Update `reviews/smart-diff/build-smart-diff.ts`, `reviews/service.ts` and `db/seed.ts` (the only importers), and move the existing tests.
   - `_shared/blast-map.ts`: `toBlastRadius` together with its `BlastFacadeResult` mirror type. `blast/service.ts` imports it.
   - `_shared/hunk-headers.ts`: `buildHunkHeaderDigest` (moved from `reviews/helpers.ts`) plus a per-file `hunkHeadersByFile(diff)` returning rebuilt `@@ -a,b +c,d @@` strings from the numeric hunk fields only. The function-context trailer after `@@` is never copied (F5). `reviews/intent-classifier.ts` imports it from here.
   - Touches `server/src/modules/_shared/{linked-issue,smart-diff-roles,blast-map,hunk-headers}.ts`, `server/src/modules/reviews/{intent-classifier,helpers,service}.ts`, `server/src/modules/reviews/smart-diff/*`, `server/src/modules/blast/{service,helpers}.ts`, `server/src/db/seed.ts` (import path only). (Q-2, EC-12, AC-25, AC-7, AC-8, NFR-14, arch)
4. **[server]** Create module `modules/brief/`.
   - `constants.ts`: `MAX_RISKS = 8`, `MAX_FOCUS = 6`, `MAX_FILES = 200`, `PROMPT_TOKEN_CAP = 16_000`, `SPEC_DOCS_TOKEN_BUDGET` (smaller than the cap), `BRIEF_MODEL_DEADLINE_MS = 90_000`, `BRIEF_ATTEMPT_TIMEOUT_MS = 30_000`, `SCHEMA_RETRIES = 2`, `GENERATE_STATUS_RUNNING`, error messages.
   - `helpers.ts` (pure, no I/O): ordering of files by role then path, `buildBriefPrompt`, `groundBrief` (file grounding, unknown refs dropped, risks without refs dropped, dedupe focus on file and line, caps, `redactSecrets` on output), `computeMissingInputs`, `computeStale`, and trimming order (hunk headers, then caller files, then spec docs).
   - `buildBriefPrompt` applies `redactSecrets` to every untrusted input (title, description, issue title and body, intent text, spec text) BEFORE `wrapUntrusted` (F6). It gets hunk headers only from `_shared/hunk-headers.ts`, parsing `pr_files.patch` with the same diff parser the reviews module already uses (locate it in `reviews/diff-loader.ts` or the shared parser it calls).
   - Spec documents are filtered to entries with status `ok` and non-empty text before prompting. `specs_missing` and EC-26 are defined on the filtered set, so no empty `wrapUntrusted` block, heading or placeholder is ever emitted (F9).
   - `repository.ts`:
     - reads and writes `pr_brief`, joined through `pull_requests.workspace_id`;
     - `getFeatureModelOverride(workspaceId, 'risk_brief')`, a brief-local lookup that mirrors `onboarding-tour/repository.ts:42`. The service falls back to the `FEATURE_MODELS` default from `@devdigest/shared`. No import from `modules/settings/` (F1);
     - every write is an atomic jsonb merge (`json = coalesce(json, '{}'::jsonb) || $patch`) with an upsert when the row is absent. A failure merges only `last_error` and `last_error_at`, and a success merges the full brief and sets the error fields to null. This cannot clobber a concurrent write (F8).
   - `service.ts`: `get` validates the stored envelope (an invalid one is treated as no brief, but an error-only one is valid) and returns `generating`, `stale` and `missing_inputs`. `startGenerate` runs in this order: verify the PR in the workspace (404), check the API key for the resolved model (`ConfigError`), take the in-memory lock (`ConflictError`), then run in the background.
   - `routes.ts`: `GET /pulls/:id/brief` with response schema `BriefResponse` (NFR-10). `POST /pulls/:id/brief` returns 202 `{ status: "running" }` with `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }`.
   - Register in `modules/index.ts`.
   - Inputs gathered in the service:
     - PR and its files (no patch body lines are passed on), Smart Diff role per file.
     - Intent through `container.reviewRepo.getIntent`.
     - Blast through `container.repoIntel.getBlastRadius`.
     - Linked issue through the shared helper.
     - Spec docs: the union of enabled agents' and their enabled skills' context paths, de-duplicated, from `container.agentsRepo.listEnabled(workspaceId)` and `enabledSkillsForPrompt(agent.id)` (usage pattern in `reviews/run-executor.ts:215-233`), in one `resolveProjectContext` call.
   - Touches `server/src/modules/brief/{constants,helpers,repository,service,routes}.ts` and `server/src/modules/index.ts`. (AC-2, AC-7, AC-8, AC-17..AC-21, AC-24, AC-25, AC-30, AC-31, EC-1, EC-3, EC-4, EC-8, EC-9, EC-10, EC-12, EC-13, EC-18..EC-23, EC-26, NFR-1, NFR-3, NFR-4, NFR-9, NFR-10, NFR-14, UI-1..UI-6)
5. **[server]** The model call and the lock in `service.ts`.
   - One `completeStructured` call with schema `BriefModelOutput`, `maxRetries: SCHEMA_RETRIES`, and `timeoutMs: BRIEF_ATTEMPT_TIMEOUT_MS`, using the provider and model resolved for `risk_brief` at call time (AC-30). The vendor port is not changed.
   - The system prompt is `server/src/prompts/brief.system.md`. It states that wrapped content is data and never instructions (UI-1, UI-9), and that output is written in English (NFR-12).
   - Lock and deadline (F2). The underlying call cannot be cancelled, so:
     1. The lock is held until the underlying `completeStructured` promise settles (released in `finally`). A second POST always gets 409 while a paid call may still be running, so a second concurrent call is never started.
     2. Each generation has a token. At `BRIEF_MODEL_DEADLINE_MS` the service records `last_error` (timeout) and marks the token expired. If the orphan call later resolves, its result is discarded and nothing is written.
     3. Double-spend window: none from concurrent starts. The only extra cost is an orphan call that finishes after the deadline, bounded by attempts × `BRIEF_ATTEMPT_TIMEOUT_MS` plus `withRetry`. Its tokens are logged but its output is not stored.
     4. `generating` stays true until the lock is released, which can be after the deadline. The client's 120 s give-up still ends its waiting (EC-6).
   - On success it persists the envelope (SHA, time, provider, model, missing inputs, tokens, cost). On failure it merges error fields only and keeps the last good brief (EC-4).
   - Exactly one structured log line per accepted generation (NFR-8, NFR-13), with no prompt text, description, issue body or spec content.
   - Touches `server/src/modules/brief/service.ts`, `server/src/prompts/brief.system.md`. (AC-9, AC-20, AC-30, AC-31, EC-3, EC-4, NFR-1, NFR-2, NFR-8, NFR-12, NFR-13, UI-1, UI-2, UI-3, UI-4, UI-5, UI-9)
6. **[server]** Tests: hermetic tests for `helpers.ts`, route tests with the mock LLM, and a DB-backed `*.it.test.ts`.
   - Grounding: unknown files dropped, refs dropped, caps, dedupe, the line kept when outside hunks (D4).
   - Prompt: a fixture whose patch has added, removed and context lines AND a hunk header with a function-context trailer; none of those lines or the trailer is in the prompt, and it is at most 16 000 tokens (NFR-14, F5). No spec section when there are none, or when only unreadable or empty entries exist (EC-26, F9).
   - A secret in the PR body, issue body and a spec document never reaches `calls[0].req` (F6).
   - Staleness: a null SHA is not stale (Q-G). Missing inputs for every AC-25 kind.
   - Routes: 202, 409, 404 for a foreign workspace (EC-23), `config_error` before the lock (EC-1).
   - Concurrent POSTs: the second gets 409 and the mock counts exactly one `completeStructured` call (F7, NFR-1, NFR-13).
   - Deadline and lock race: a mock call that outlives `BRIEF_MODEL_DEADLINE_MS` (use an injectable deadline) leaves the lock held, a second POST gets 409, `last_error` is written at the deadline, and the late resolution writes nothing (F2, F7).
   - A failure keeps the last good brief, and an error-only envelope validates and is served so the client can show EC-5 (F7, F8, EC-4, EC-5).
   - Atomic merge: a failure write that races a success write does not clobber it (F8, `*.it.test.ts`).
   - Rate limit: register the rate-limit plugin in the route test, or assert the route's `config.rateLimit` equals `{ max: 10, timeWindow: '1 minute' }`, since the limiter is off when `nodeEnv === 'test'` (F7, NFR-9).
   - The model comes from the workspace override, else the registry default (AC-30, F1).
   - Restart semantics (EC-8) and an invalid stored envelope (EC-21).
   - Touches `server/src/modules/brief/helpers.test.ts`, `server/test/brief.it.test.ts`, `server/test/brief-routes.test.ts`. (AC-8, AC-17..AC-19, AC-30, EC-1, EC-3, EC-4, EC-5, EC-8, EC-18, EC-21, EC-23, EC-26, NFR-1, NFR-9, NFR-13, NFR-14)

*Client and e2e (W3)*

7. **[client]** Hook `lib/hooks/brief.ts`: a query for `GET /pulls/:id/brief` and a mutation for `POST`.
   - Polling follows `lib/hooks/intent.ts`. The baseline (`generated_at` and `last_error_at`, each allowed to be null) is captured BEFORE the POST, so a 409 from another tab or an earlier run is tracked as the existing run (F12). It stops when either field changes, gives up after 120 s (EC-6), and stops after the first failed re-read (EC-7).
   - The `config_error` code is branched on (EC-2).
   - The margin between the 90 s server deadline and the 120 s give-up is only about 30 s. It is covered by a test, not widened (F12).
   - Touches `client/src/lib/hooks/brief.ts`, `client/src/lib/hooks/index.ts`. (AC-2, AC-3, AC-4, AC-21, AC-22, AC-31, EC-2, EC-5, EC-6, EC-7)
8. **[client]** Page plumbing in ONE step (F4). Touches `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `_components/OverviewTab/OverviewTab.tsx`, `_components/PrBrief/**`.
   - In `page.tsx`, add `setParams(record)`, which builds one `URLSearchParams` from the current query, applies every change, and makes a single `router.replace`. `setTab` clears `file` and `line` when the tab changes. `onOpenFile(file, line?)` calls `setParams({ tab: 'diff', file, line })` in one call, and is passed down through `OverviewTab` to `PrBrief` and `IntentCard`.
   - `PrBrief` section: no-brief state with **Generate brief** (no model call, NFR-11), skeleton while generating, summary as plain text (UI-7), missing-inputs list, stale note with short SHA plus a **Regenerate** icon button named "Regenerate brief", error with **Retry**, and an `aria-live` region.
   - The two-column Intent and Blast row (EC-11) and the full-width Review focus list (count badge, one row per item `file:line — reason`, empty text for EC-15).
   - The section sits above the PR Description block (AC-27). Buttons are disabled while generating (AC-31).
   - (AC-1, AC-3..AC-6, AC-12, AC-13, AC-23, AC-24, AC-26, AC-27, AC-31, EC-2, EC-5, EC-6, EC-11, EC-15, EC-24, NFR-5, NFR-6, NFR-11, UI-7)
9. **[client]** `IntentCard` Risk areas row: one chip per risk with severity icon and text label, title, and `path[:start[-end]]`. Each chip calls `onOpenFile` (AC-14). The no-risks text covers EC-14. Touches `_components/IntentCard/IntentCard.tsx`, `styles.ts`. (AC-10, AC-11, AC-14, EC-14, NFR-6)
10. **[client]** Deep link to Files changed. Touches `_components/DiffTab/{DiffTab.tsx,helpers.ts,styles.ts}`, `_components/SmartDiffGroups/{SmartDiffGroups.tsx,helpers.ts}`, and the shared `client/src/components/diff-viewer/{FileCard/FileCard.tsx,DiffViewer/DiffViewer.tsx,CodeLine/CodeLine.tsx}` plus their `styles.ts`/`helpers.ts` (F3). All are owned by W3.
    - A pure helper in `DiffTab/helpers.ts` parses `file` and `line`. `file` is matched only by exact equality against the PR file list, and `line` is accepted only as a positive integer (UI-8).
    - `SmartDiffGroups` opens the target group (it unmounts collapsed groups today). `FileCard` gains an optional `forceOpen` prop so a large file that starts collapsed opens. `DiffViewer` gains optional `highlightLine` and `scrollTargetRef`, and `CodeLine` an optional `highlighted` prop. Every new prop is optional with a default that keeps today's behaviour, because `DiffViewer` has other callers.
    - The target file scrolls into view and the exact new-side line is scrolled into the viewport and visibly highlighted (AC-15, AC-16), in both Smart order and Original order. A line that is not a rendered new-side line opens the file without highlighting (EC-17). A file not in the PR shows the "File not in this PR's diff" notice and scrolls nowhere (EC-16).
    - URLs are built with encoded query parameters (UI-6).
    - (AC-13..AC-16, EC-16, EC-17, UI-6, UI-8)
11. **[client]** `client/messages/en/brief.json`: add keys for every label and message (PR Brief, Generate brief, Regenerate brief, Risk areas, Review focus, no-focus, missing-input kinds, stale note, error, timeout, config_error with Settings link, File not in this PR's diff). Keep the existing keys intact (NFR-5). Touches `client/messages/en/brief.json`. (NFR-5, AC-1, AC-12, AC-23, AC-24, AC-25, AC-26, EC-2, EC-5, EC-6, EC-14, EC-15, EC-16)
12. **[client]** Component and hook tests. Touches `*.test.tsx` and `helpers.test.ts` next to each component.
    - New behaviour: no-brief, skeleton, summary, stale, retry, timeout, poll stops, 409 tracks the existing run with a null baseline (F12), risk chips and severity text, a focus row click makes a single URL update with `tab`, `file` and `line` together, switching tab clears `file` and `line` (F4), the deep-link helper with bad values, scroll and highlight, the notice for an unknown file, and markup rendered as literal text.
    - Regression tests for the backward-compatible props (F3): `FileCard`, `DiffViewer` and `CodeLine` render exactly as before when the new props are absent, and the existing `SmartDiffGroups.test.tsx` and `DiffTab.test.tsx` still pass.
    - (AC-1..AC-6, AC-10..AC-16, AC-23, AC-24, EC-5..EC-7, EC-14..EC-17, EC-24, NFR-6, UI-7, UI-8)
13. **[e2e]** New flow `e2e/specs/11-pr-brief.flow.json`: open the seeded PR Overview and wait for the PR Brief section text and the **Generate brief** button, without clicking it. The flow relies on the seed having no `pr_brief` row and on the seeded repo having no clone (`clonePath: null`), so add a one-line note saying so in the flow's description (F13). Touches `e2e/specs/11-pr-brief.flow.json`. (NFR-11, AC-1, AC-27)
- Slice 2 gate: `server: typecheck, lint, arch, test-unit`; `client: typecheck, lint, arch, test`; `e2e: typecheck`; DB-backed `cd server && pnpm exec vitest run brief.it.test` (Docker).
- Suggested commit: `feat(brief): add PR Why + Risk Brief module, Overview section and file deep link`.

**Slice 3: delivery (final steps, performed by the user after the code, not by the implementer)**
14. **[delivery]** Open the PR with a description of the implementation and a demo video of: generate, reload without a new call, Regenerate, stale note and a focus item deep link. (Delivery P1)
15. **[delivery]** Add a short cross-model review note to the PR description. Use the summary at the top of `specs/06-pr-brief.plan-review.md` (Claude Sonnet 5.5 reviewed the Opus-written plan and found 2 blockers, 6 majors and 6 minors; all were resolved here). (Delivery P2)
16. **[delivery]** Attach the final `plan-verifier` report to the PR, with no open requirement. (Delivery P2)
17. **[delivery]** Attach the `workflow-retro` result and the run's cost report to the PR. (Delivery P3)

### Requirements-to-step traceability
| Spec IDs | Steps |
|---|---|
| US-1..US-6 | 4, 5, 7, 8, 9, 10 |
| AC-1, AC-27 | 8, 11, 13 |
| AC-2, AC-31 | 4, 5, 7, 8 |
| AC-3 | 8 |
| AC-4 | 7, 8 |
| AC-5, AC-6 | 8 |
| AC-7, AC-8 | 3, 4, 6 |
| AC-9, AC-30 | 4, 5, 6 |
| AC-10, AC-11 | 1, 9 |
| AC-12 | 8, 11 |
| AC-13..AC-16 | 8, 10 |
| AC-17..AC-19 | 4, 6 |
| AC-20, AC-21 | 1, 4, 5 |
| AC-22 | 7, 8 |
| AC-23, AC-24 | 8, 11 |
| AC-25, AC-26 | 1, 3, 4, 8, 11 |
| EC-1 | 4, 6 |
| EC-2, EC-5, EC-6, EC-7 | 7, 8, 11, 12 |
| EC-3 | 4, 5, 6 |
| EC-4 | 5, 6 |
| EC-8 | 4, 6 |
| EC-9, EC-10, EC-11 | 4, 8 |
| EC-12 | 3, 4 |
| EC-13 | 4 |
| EC-14, EC-15 | 8, 9, 11 |
| EC-16, EC-17 | 10 |
| EC-18 | 4, 6 |
| EC-19 | 4 |
| EC-20 | 4, 8 |
| EC-21, EC-22 | 1, 2, 4, 6 |
| EC-23 | 4, 6 |
| EC-24 | 8, 12 |
| EC-25 | 8 (no review banner in this slice; the summary shows alone, Q-B, D10) |
| EC-26 | 4, 6 |
| NFR-1, NFR-13 | 5, 6 |
| NFR-2 | 5, 6 |
| NFR-3, NFR-14 | 3, 4, 6 |
| NFR-4 | 4 |
| NFR-5 | 8, 11 |
| NFR-6 | 8, 9, 12 |
| NFR-7, NFR-10 | 1, 2, 4 |
| NFR-8, NFR-12 | 5 |
| NFR-9 | 4, 6 |
| NFR-11 | 8, 13 |
| UI-1, UI-2, UI-9 | 4, 5 |
| UI-3, UI-4, UI-5 | 4, 5 |
| UI-6 | 4, 10 |
| UI-7 | 8, 12 |
| UI-8 | 10, 12 |
| CONTRACT:brief.ts | 1, 2 |
| Delivery checklist | 0, 14..17 |
| AC-28, AC-29 | not planned (D10) |

### Execution
Multi-agent, contract-first. Execution goes through `/run-plan`.

| Workstream | Agent | Steps | Files owned | Depends on | Parallel with |
|---|---|---|---|---|---|
| W0 docs | implementer | 0 | `specs/06-pr-brief.md`, `specs/06-pr-brief.plan.md`, `specs/06-pr-brief.plan-review.md` | — | — |
| W1 contracts | implementer | 1, 2 | `*/src/vendor/shared/contracts/brief.ts`, `server/test/brief-contract.test.ts`, `client/src/lib/brief-contract.test.ts` | W0 | — |
| W2 server | implementer | 3, 4, 5 | `server/src/modules/brief/**` (except tests), `server/src/modules/_shared/{linked-issue,smart-diff-roles,blast-map,hunk-headers}.ts`, `server/src/modules/reviews/**`, `server/src/modules/blast/**`, `server/src/db/seed.ts` (import path only), `server/src/modules/index.ts`, `server/src/prompts/brief.system.md` | W1 | W3 |
| W3 client + e2e | implementer | 7..11, 13 | `client/src/app/repos/[repoId]/pulls/[number]/**` (except tests), `client/src/components/diff-viewer/{FileCard,DiffViewer,CodeLine}/**` (except tests), `client/src/lib/hooks/brief.ts`, `client/src/lib/hooks/index.ts`, `client/messages/en/brief.json`, `e2e/specs/11-pr-brief.flow.json` | W1 | W2 |
| W4 tests | test-writer | 6, 12 | `server/src/modules/brief/helpers.test.ts`, `server/test/brief.it.test.ts`, `server/test/brief-routes.test.ts`, client `*.test.ts(x)` (except the W1 contract test) | W2, W3 | — |
| Review | architecture-reviewer ∥ security-reviewer ∥ plan-verifier | — | read-only | W4 | each other |

No file appears in two workstreams. W5 from revision 1 is folded into W3. `server/src/db/seed.ts` is listed in W2 for an import-path edit only, because the smart-diff move changes its import. Delivery steps 14..17 are done by the user after review.

### Test plan
- `cd server && pnpm typecheck && pnpm lint && pnpm arch` catches layering, cross-module import, `process.env` and concrete-adapter violations.
- `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` runs the hermetic tests: grounding, prompt assembly, contract, lock and deadline race, rate-limit config, and the moved classifier and smart-diff tests.
- `cd server && pnpm exec vitest run brief.it.test` (Docker) covers workspace scoping, 202 and 409, restart behaviour, and the atomic merge.
- `cd client && pnpm typecheck && pnpm lint && pnpm arch && pnpm test` covers the deep link, the hook, the diff-viewer regression tests and the fetch ban.
- `cd reviewer-core && npm run typecheck` (it reads the server shared copy).
- `cd e2e && npm run typecheck`, then `./scripts/e2e.sh` on a freshly seeded DB for flow 11. The other flows must still pass.
- The `spec:lint` gate from `/pr-self-review` runs for the `specs/06-*` files.

### Risks / open questions
- **Explicit user sign-off recorded:** the `*/src/vendor/shared/contracts/brief.ts` edit in both copies (same commit) is requested by the task. `PrBrief` and `Risks` stay untouched so existing consumers do not change. No other vendor file is edited, and in particular `server/src/vendor/shared/adapters.ts` is not changed, so there is no `signal` on `StructuredRequest`.
- No migration is planned. The `pr_brief.json` jsonb column holds the whole envelope. If review finds a column is needed, stop and ask.
- No lockfile or `package.json` change is planned.
- The in-memory lock assumes one API instance (`server/CLAUDE.md`). It is the same limitation as the reaper.
- An LLM call that outlives the 90 s deadline cannot be cancelled. The lock stays held until it settles and its result is discarded (step 5). The cost of that orphan call is logged but not stored.
- `withRetry` inside the adapter also retries transport errors. The one-call count (NFR-13) is of `completeStructured` invocations. The deadline is what bounds wall time.
- `PROJECT_CONTEXT_TOKEN_BUDGET` equals the brief's 16 000 prompt cap. `SPEC_DOCS_TOKEN_BUDGET` is therefore set smaller in `constants.ts`. The exact split is a tunable constant (D8).
- `missing_inputs` is a structured list (`kind`, optional `reason`). The client maps each `kind` to an i18n message. This is a planner decision inside the approved contract and needs no spec change.
- No fix in this revision needs a spec change. Decisions that refine behaviour the spec leaves open (the `missing_inputs` shape, EC-19 ordering, the lock-until-settle rule) are recorded here only. If you want them in the spec, an approved spec is superseded by a new spec that `spec-creator` writes.
- The diff-viewer files in `client/src/components/diff-viewer/` are shared. Their new props are optional and default to today's behaviour, and the regression tests in step 12 guard that.
- Pre-existing failures from `server/INSIGHTS.md` (2026-09-25) in `skills*.it.test.ts` may appear in a full DB-backed run and are unrelated.
- AC-28 and AC-29 remain deferred (D10). US-7 has no implementation in this plan.
- Next step: save and commit this plan (step 0), then run `/run-plan`.

### Cross-model review resolution
Review: `specs/06-pr-brief.plan-review.md` (Claude Sonnet 5.5). I verified each finding against the code. All 14 are accepted.

| ID | Sev | Resolution | Step changed |
|---|---|---|---|
| F1 | blocker | Accepted. `resolveFeatureModel` lives in `settings/` (cross-module import). The brief now uses its own `repository.getFeatureModelOverride`, like `onboarding-tour/repository.ts:42`, with a `FEATURE_MODELS` fallback. | 4, 6 |
| F2 | blocker | Accepted. The vendor port stays unchanged. The lock is held until the underlying call settles, and a per-generation token discards late results. No double-spend from concurrent starts, and the orphan-call cost is bounded and logged. Deadline and lock race test added. | 5, 6 |
| F3 | major | Accepted. `components/diff-viewer/{FileCard,DiffViewer,CodeLine}` are named and assigned to W3. New props are optional and backward compatible. Regression tests added. | 10, 12, Execution |
| F4 | major | Accepted. `setParams` builds one query and does one `router.replace`. `page.tsx` plumbing is one step, and `file` and `line` are cleared on tab change. | 8, 12 |
| F5 | major | Accepted. `buildHunkHeaderDigest` moves to `_shared/hunk-headers.ts` and headers are rebuilt from the numeric fields, so the trailer is never copied. A fixture with a trailer was added. | 3, 4, 6 |
| F6 | major | Accepted. `redactSecrets` is applied to every untrusted input before `wrapUntrusted`. Test that a secret never reaches `calls[0].req`. | 4, 6 |
| F7 | major | Accepted. Added: rate-limit config test, deadline and lock race, failure keeps the last good brief, error-only envelope validates, concurrent POST gives 409 and one call, and no spec section with only unreadable entries. | 6 |
| F8 | major | Accepted. Writes are an atomic jsonb merge with upsert. An error-only envelope validates. Atomic merge test added. | 1, 2, 4, 6 |
| F9 | minor | Accepted. Spec entries are filtered to status `ok` with non-empty text. `specs_missing` and EC-26 use the filtered set. | 4, 6 |
| F10 | minor | Accepted. The client contract test moves to `client/src/lib/brief-contract.test.ts` (not under `vendor/`) and is owned by W1. Vectors are identical to the server test. | 2, Execution |
| F11 | minor | Accepted, no shims. `classifyFile` has only three importers (`reviews/service.ts`, `build-smart-diff.ts`, `db/seed.ts`) and `toBlastRadius` one. Editing them in place is cheaper than keeping duplicate symbols. `BlastFacadeResult` moves with `toBlastRadius`. Tests move with their subjects. | 3 |
| F12 | minor | Accepted. The baseline is captured before POST and tolerates null. A 409 tracks the existing run. The 30 s margin is tested. | 7, 12 |
| F13 | minor | Accepted. One-line note in the flow on the seed having no `pr_brief` row and no clone. | 13 |
| F14 | minor | Accepted. Traceability rows patched: AC-23/24 and AC-25/26 include step 11, EC-25 notes that there is no banner, NFR-9 includes step 6. | Traceability |
| Cuts | — | Accepted: W5 folded into W3, the per-attempt timeout simplified to one 30 s constant, and no re-export shims. | Decisions, Execution, 3, 5 |
