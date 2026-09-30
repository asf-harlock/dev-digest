# Implementation Plan: SPEC-06 PR Why + Risk Brief
Spec: `specs/06-pr-brief.md` · Status: approved · Execution: multi-agent, contract-first gate
Plan file: `specs/06-pr-brief.plan.md`

### Objective
On the Overview tab of `/repos/:repoId/pulls/:number`, add a PR Brief section.
It has a Generate brief button, a summary, Risk areas inside the Intent card next to the Blast radius card, and a full-width Review focus list.
Clicking a focus item or a risk's file reference deep-links to `?tab=diff&file=&line=`.
It is backed by a new server module `brief/` (`GET` and `POST /pulls/:id/brief`).
It satisfies US-1..US-6, AC-1..AC-27, AC-30, AC-31, EC-1..EC-26, NFR-1..NFR-14 and UI-1..UI-9 of `specs/06-pr-brief.md`.
AC-28 and AC-29 (US-7) are deferred by D10 and are not in this plan.

### Decisions from Phase 1
- [Q-2] The linked-issue regex and lookup move to `server/src/modules/_shared/linked-issue.ts`, used by both the classifier and the brief → accepted.
- [Q-5] A 90 s overall model deadline (`BRIEF_MODEL_DEADLINE_MS`), plus a per-attempt `timeoutMs` of about 40 s, plus a 120 s client give-up → accepted. Reason: `openai.ts:88-110` applies `timeoutMs` per HTTP attempt, so one call's worst case is about 3 × the per-attempt value.
- [Q-8] Keep `ConfigError`'s HTTP 500 `config_error`. The client branches on `code` → accepted.
- [Contract] Add `ReviewFocusItem`, `BriefModelOutput`, `BriefEnvelope` and `BriefResponse`. Leave `PrBrief` and `Risks` untouched. `Risk.file_refs` stays `string[]` of `path` or `path:start[-end]`, with one shared parse/format helper → accepted.
- [Q-A] The Risk areas row stays optional in `IntentCard` and is fed from the brief's `risks` → accepted.
- [Q-B] The summary renders as plain text inside the PR Brief section. There is no `VerdictBanner` (AC-28 is deferred) → accepted.
- [Q-E] One merged, de-duplicated `resolveProjectContext` call under the existing budget. Partially unreadable docs count as present → accepted.
- [Q-F] File order for EC-19 and for trimming: `core → wiring → tests → docs → boilerplate`, then path ascending → accepted.
- [Q-G] A null `generated_for_sha` is not stale → accepted.
- Execution mode → multi-agent, contract-first gate. Execution goes through `/run-plan`. No implementer is hand-launched.
- The vendor edit of `*/src/vendor/shared/contracts/brief.ts` (both copies, same commit) is user-approved.
- The spec was `draft` in Phase 1 and is now `approved`. This plan is written against the approved version.

### Modules affected
- `server/`: new module `modules/brief/`. New `_shared/` helpers (`linked-issue.ts`, `smart-diff-roles.ts`, `blast-map.ts`) with re-export shims left in `reviews/` and `blast/`. A prompt file. Route registration.
- `client/`: PR Brief section on Overview. A `brief` hook. Deep-link support in `DiffTab`, `SmartDiffGroups` and `FileCard`. `IntentCard` risk chips. `messages/en/brief.json`. Contract copy.
- `e2e/`: a flow for the no-brief state.
- `reviewer-core/`: not touched. It reads the server copy of shared, so only its typecheck gate applies.

### Constraints
- `CLAUDE.md` (root):
  - The two `@devdigest/shared` copies change in the same commit.
  - `*/src/vendor/**` is on the do-not-touch list, so only the approved `contracts/brief.ts` edit is allowed.
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
  - No cross-module imports. Pure shared helpers go in `modules/_shared/`.
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
- Adapter behaviour (`server/src/adapters/llm/openai.ts`): `completeStructured` retries at most `maxRetries` (default 2) and uses a strict `json_schema`. The output schema therefore has no optional fields. `withRetry` also retries transport errors internally.
- `server/src/modules/_shared/project-context.ts`: `PROJECT_CONTEXT_TOKEN_BUDGET` is 16 000, the same number as the brief's prompt cap. The spec-docs budget must be a separate, smaller constant so the rest of the prompt has room.

### Skills the implementer will apply
| Path / area | Bucket | Skills |
|---|---|---|
| `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts` | contracts | zod, typescript-expert |
| `server/src/modules/brief/**`, `server/src/modules/_shared/**`, `server/src/modules/reviews/**`, `server/src/modules/blast/**`, `server/src/modules/index.ts`, `server/src/prompts/**`, `server/test/**` | backend | onion-architecture, fastify-best-practices, zod, security, typescript-expert. `repository.ts` also adds drizzle-orm-patterns. |
| `client/src/app/repos/[repoId]/pulls/[number]/**`, `client/src/lib/**`, `client/messages/en/brief.json` | frontend | frontend-ui-architecture, next-best-practices, react-best-practices, security, typescript-expert. `*.test.tsx` adds react-testing-library. |
| `e2e/specs/11-pr-brief.flow.json` | workflow | security, typescript-expert |
| `specs/06-pr-brief.plan.md` (this file) | spec | spec-authoring |
| `INSIGHTS.md` updates at session end | docs | engineering-insights, mermaid-diagram |

### Step-by-step plan

**Slice 0: delivery gate (before any feature code)**
0. **[docs]** Commit `specs/06-pr-brief.md` and `specs/06-pr-brief.plan.md` together, before any code change. Suggested commit: `docs(brief): add SPEC-06 and its implementation plan`. (Delivery: P1, P2)

**Slice 1: contracts (W1)**
1. **[server + client]** Extend `contracts/brief.ts` in BOTH copies in the same commit. Leave `PrBrief`, `Risks` and `Risk` untouched.
   - `ReviewFocusItem { file, line, reason }`.
   - `BriefModelOutput { summary, risks: Risk[], review_focus: ReviewFocusItem[] }`. Every field is required (strict JSON schema) and `line` is an integer.
   - `BriefMissingInput { kind, reason? }`. `kind` is an enum: `intent_missing`, `intent_other_sha`, `blast_degraded`, `specs_missing`, `description_empty`, `issue_not_referenced`, `issue_unreachable`, `files_truncated`, `prompt_trimmed`.
   - `BriefEnvelope`: the brief plus nullish `intent` and `blast` snapshots, `generated_for_sha`, `generated_at`, `provider`, `model`, `missing_inputs`, tokens in and out, cost, `last_error` and `last_error_at`. Every persisted field is `.nullish()`.
   - `BriefResponse`: `brief`, `meta`, `generating`, `stale`, `missing_inputs`.
   - `parseFileRef` and `formatFileRef` for `path[:start[-end]]`. They are pure, dependency-free and identical in both copies.
   - Touches `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts`. (CONTRACT:brief.ts, NFR-7, NFR-10, EC-21, EC-22, AC-10, AC-14, AC-25, AC-21, AC-20)
2. **[server + client]** Contract tests in both copies: the old-envelope round trip with missing fields (EC-22), an invalid document (EC-21), and `parseFileRef`/`formatFileRef` cases including a colon in a path and bad ranges. Touches `server/test/brief-contract.test.ts` and a test next to the client copy. (NFR-7, EC-21, EC-22)
- Slice 1 gate: `server: typecheck`, `client: typecheck`, `core: typecheck`, `server: test-unit`, `client: test`.
- Suggested commit: `feat(shared): add brief model output, envelope and file-ref contracts`.

**Slice 2: server (W2), client (W3) and e2e (W5) run in parallel on disjoint files**

*Server*

3. **[server]** Move pure helpers into `_shared/`, with re-export shims left behind so the existing imports and tests keep working.
   - `_shared/linked-issue.ts`: `LINKED_ISSUE_RE` plus `resolveLinkedIssue({ container, repoRef, body })` returning `{ status: 'none' | 'used' | 'unreachable', text?, note? }`. It fetches through the `container.github().getIssue` port.
   - `_shared/smart-diff-roles.ts`: `classifyFile` and `SMART_DIFF_RULES`. The originals in `reviews/smart-diff/` re-export from here.
   - `_shared/blast-map.ts`: `toBlastRadius`. `blast/helpers.ts` re-exports it.
   - `reviews/intent-classifier.ts` calls the shared linked-issue helper. Its existing behaviour and tests stay green.
   - Touches `server/src/modules/_shared/linked-issue.ts`, `smart-diff-roles.ts`, `blast-map.ts`, `server/src/modules/reviews/intent-classifier.ts`, `server/src/modules/reviews/smart-diff/classify-file.ts`, `server/src/modules/reviews/smart-diff/constants.ts`, `server/src/modules/blast/helpers.ts`. (Q-2, EC-12, AC-25, NFR-13, arch)
4. **[server]** Create module `modules/brief/`.
   - `constants.ts`: `MAX_RISKS = 8`, `MAX_FOCUS = 6`, `MAX_FILES = 200`, `PROMPT_TOKEN_CAP = 16_000`, `SPEC_DOCS_TOKEN_BUDGET` (smaller than the cap), `BRIEF_MODEL_DEADLINE_MS = 90_000`, `BRIEF_ATTEMPT_TIMEOUT_MS ≈ 40_000`, `SCHEMA_RETRIES = 2`, `GENERATE_STATUS_RUNNING`, error messages.
   - `helpers.ts` (pure, no I/O): `extractHunkHeaders(patch)`, ordering of files by role then path, `buildBriefPrompt` with `wrapUntrusted` per block, `groundBrief` (file grounding, unknown refs dropped, risks without refs dropped, dedupe focus on file and line, caps, `redactSecrets`), `computeMissingInputs`, `computeStale`, trimming order (hunk headers, then caller files, then spec docs).
   - `repository.ts`: reads and writes `pr_brief`, joined through `pull_requests.workspace_id`. A failure writes only the error fields.
   - `service.ts`: `get` (validates the stored envelope, treats an invalid one as no brief, returns `generating`, `stale` and `missing_inputs`) and `startGenerate`. `startGenerate` runs in this order: verify the PR in the workspace (404), check the API key for the `risk_brief` model (`ConfigError`), take the in-memory lock (`ConflictError`), then run in the background and release the lock in `finally`.
   - `routes.ts`: `GET /pulls/:id/brief` with response schema `BriefResponse` (NFR-10). `POST /pulls/:id/brief` returns 202 `{ status: "running" }` with `config: { rateLimit: { max: 10, timeWindow: '1 minute' } }`.
   - Register in `modules/index.ts`.
   - Touches `server/src/modules/brief/{constants,helpers,repository,service,routes}.ts` and `server/src/modules/index.ts`. (AC-2, AC-7, AC-8, AC-17..AC-21, AC-24, AC-25, AC-30, AC-31, EC-1, EC-3, EC-4, EC-8, EC-9, EC-10, EC-12, EC-13, EC-18..EC-23, EC-26, NFR-1, NFR-3, NFR-4, NFR-9, NFR-10, UI-3, UI-4, UI-5, UI-6)
   - Inputs gathered in the service:
     - PR and its files (no patch body lines are passed on), Smart Diff role per file.
     - Intent through `container.reviewRepo.getIntent`.
     - Blast through `container.repoIntel.getBlastRadius`.
     - Linked issue through the shared helper.
     - Spec docs: union of enabled agents' and their enabled skills' context paths, de-duplicated, one `resolveProjectContext` call. Locate the existing agent and skill listing in `modules/agents/` and `modules/context/`, reached through the container or an already-exposed repository. Add nothing from specs to the prompt when none resolve (EC-26).
5. **[server]** The model call in `service.ts`.
   - One `completeStructured` call with schema `BriefModelOutput` and `maxRetries: SCHEMA_RETRIES`, using the provider and model from `resolveFeatureModel('risk_brief')` at call time (AC-30). It is wrapped in an overall `BRIEF_MODEL_DEADLINE_MS` deadline (`AbortSignal` or `Promise.race`) with a per-attempt `timeoutMs`.
   - The system prompt is `server/src/prompts/brief.system.md`. It states that wrapped content is data and never instructions (UI-1, UI-9), and that output is written in English (NFR-12).
   - On success it persists the envelope (SHA, time, provider, model, missing inputs, tokens, cost). On failure it writes `last_error` and `last_error_at` only and keeps the last good brief (EC-4).
   - Exactly one structured log line per accepted generation (NFR-8, NFR-13), with no prompt text, description, issue body or spec content.
   - Touches `server/src/modules/brief/service.ts`, `server/src/prompts/brief.system.md`. (AC-9, AC-20, AC-30, EC-4, NFR-1, NFR-2, NFR-8, NFR-12, NFR-13, UI-1, UI-2, UI-3, UI-4, UI-5, UI-9)
6. **[server]** Hermetic tests for `helpers.ts`, plus route tests with the mock LLM and a DB-backed `*.it.test.ts`.
   - Grounding: unknown files dropped, refs dropped, caps, dedupe, the line kept when outside hunks (D4).
   - Prompt: no hunk body lines, at most 16 000 tokens, no spec section at all when there are none (EC-26).
   - Staleness: a null SHA is not stale (Q-G).
   - Missing inputs for every AC-25 kind.
   - Routes: 202, 409 (no second model call), 404 for a foreign workspace (EC-23), `config_error` before the lock (EC-1).
   - The mock provider counts exactly one `completeStructured` per POST (NFR-13).
   - Restart semantics (EC-8) and an invalid stored envelope (EC-21).
   - Touches `server/src/modules/brief/helpers.test.ts`, `server/test/brief.it.test.ts`. (AC-8, AC-17..AC-19, EC-1, EC-3, EC-4, EC-8, EC-18, EC-21, EC-23, EC-26, NFR-1, NFR-13, NFR-14)

*Client*

7. **[client]** Hook `lib/hooks/brief.ts`: a query for `GET /pulls/:id/brief` and a mutation for `POST`.
   - Polling follows `lib/hooks/intent.ts`. It stops when `generated_at` or `last_error_at` changes, gives up after 120 s (EC-6), and stops after the first failed re-read (EC-7).
   - The `config_error` code is branched on (EC-2). A 409 is handled as "already running".
   - Touches `client/src/lib/hooks/brief.ts`, `client/src/lib/hooks/index.ts`. (AC-2, AC-3, AC-4, AC-21, AC-22, AC-31, EC-2, EC-5, EC-6, EC-7)
8. **[client]** `PrBrief` section on the Overview tab, in `_components/PrBrief/`. Pages stay thin.
   - Sub-components: no-brief state with **Generate brief** (no model call, NFR-11), skeleton while generating, summary as plain text (UI-7), missing-inputs list, stale note with short SHA plus a **Regenerate** icon button named "Regenerate brief", error with **Retry**, and an `aria-live` region.
   - The two-column Intent and Blast row (EC-11) and the full-width Review focus list (count badge, one row per item `file:line — reason`, empty text for EC-15).
   - The section sits above the PR Description block (AC-27). Buttons are disabled while generating (AC-31).
   - Touches `client/src/app/repos/[repoId]/pulls/[number]/_components/PrBrief/**`, `OverviewTab/OverviewTab.tsx`. (AC-1, AC-3..AC-6, AC-12, AC-23, AC-24, AC-26, AC-27, AC-31, EC-2, EC-5, EC-6, EC-11, EC-15, EC-24, NFR-5, NFR-6, NFR-11, UI-7)
9. **[client]** `IntentCard` Risk areas row: one chip per risk with severity icon and text label, title, and `path[:start[-end]]`. Each chip links to the deep link (AC-14). The no-risks text covers EC-14. Touches `_components/IntentCard/IntentCard.tsx`, `styles.ts`. (AC-10, AC-11, AC-14, EC-14, NFR-6)
10. **[client]** Deep link to Files changed: `page.tsx` reads `file` and `line` from the query and passes them to `DiffTab`.
    - A pure helper in `DiffTab/helpers.ts` parses them. `file` is matched only by exact equality against the PR file list, and `line` is accepted only as a positive integer (UI-8).
    - `SmartDiffGroups` opens the target group (it unmounts collapsed groups today), and `FileCard` expands the target file even when large files start collapsed. Both work in Smart order and Original order.
    - The diff scrolls the exact new-side line into view and highlights it (AC-16), and does not highlight when the line is not rendered (EC-17). A file not in the PR shows the "File not in this PR's diff" notice and scrolls nowhere (EC-16).
    - URLs are built with encoded query parameters (UI-6).
    - Touches `client/src/app/repos/[repoId]/pulls/[number]/page.tsx`, `_components/DiffTab/{DiffTab.tsx,helpers.ts,styles.ts}`, `_components/SmartDiffGroups/{SmartDiffGroups.tsx,helpers.ts}`, and the `FileCard` component (locate it under `client/src/`). (AC-13..AC-16, EC-16, EC-17, UI-6, UI-8)
11. **[client]** `client/messages/en/brief.json`: add keys for every label and message (PR Brief, Generate brief, Regenerate brief, Risk areas, Review focus, no-focus, missing-input kinds, stale note, error, timeout, config_error with Settings link, File not in this PR's diff). Keep the existing keys intact (NFR-5). Touches `client/messages/en/brief.json`. (NFR-5, AC-1, AC-12, AC-24, AC-26, EC-2, EC-5, EC-6, EC-14, EC-15, EC-16)
12. **[client]** Component and hook tests: no-brief, skeleton, summary, stale, retry, timeout, poll stops, risk chips and severity text, focus row click sets the query, deep-link helper (bad values), scroll and highlight, the notice for an unknown file, markup rendered as literal text. Touches `*.test.tsx` and `helpers.test.ts` next to each component. (AC-1..AC-6, AC-10..AC-16, AC-23, AC-24, EC-5..EC-7, EC-14..EC-17, EC-24, NFR-6, UI-7, UI-8)

*E2E*

13. **[e2e]** New flow `11-pr-brief.flow.json`: open the seeded PR Overview and wait for the PR Brief section text and the **Generate brief** button, without clicking it. Touches `e2e/specs/11-pr-brief.flow.json`. (NFR-11, AC-1, AC-27)
- Slice 2 gate: `server: typecheck, lint, arch, test-unit`; `client: typecheck, lint, arch, test`; `e2e: typecheck`; DB-backed `cd server && pnpm exec vitest run brief.it.test` (Docker).
- Suggested commit: `feat(brief): add PR Why + Risk Brief module, Overview section and file deep link`.

**Slice 3: delivery (final steps, performed by the user after the code, not by the implementer)**
14. **[delivery]** Open the PR with a description of the implementation and a demo video of: generate, reload without a new call, Regenerate, stale note and a focus item deep link. (Delivery P1)
15. **[delivery]** Add a short cross-model review note to the PR description (which model reviewed the plan, what it found). (Delivery P2)
16. **[delivery]** Attach the final `plan-verifier` report to the PR, with no open requirement. (Delivery P2)
17. **[delivery]** Attach the `workflow-retro` result and the run's cost report to the PR. (Delivery P3)

### Requirements-to-step traceability
| Spec IDs | Steps |
|---|---|
| US-1..US-6 | 4, 5, 7, 8, 9, 10 |
| AC-1, AC-27 | 8, 11, 13 |
| AC-2, AC-31 | 4, 7, 8 |
| AC-3 | 8 |
| AC-4 | 7, 8 |
| AC-5, AC-6 | 8 |
| AC-7, AC-8 | 4, 6 |
| AC-9, AC-30 | 5 |
| AC-10, AC-11 | 1, 9 |
| AC-12 | 8, 11 |
| AC-13..AC-16 | 10 |
| AC-17..AC-19 | 4, 6 |
| AC-20, AC-21 | 1, 4, 5 |
| AC-22 | 7, 8 |
| AC-23, AC-24 | 8 |
| AC-25, AC-26 | 1, 3, 4, 8 |
| EC-1 | 4, 6 |
| EC-2, EC-5, EC-6, EC-7 | 7, 8, 11, 12 |
| EC-3 | 4, 6 |
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
| EC-25 | 8 (summary shown alone, no verdict; Q-B) |
| EC-26 | 4, 6 |
| NFR-1, NFR-13 | 5, 6 |
| NFR-2 | 5 |
| NFR-3, NFR-14 | 4, 6 |
| NFR-4 | 4 |
| NFR-5 | 8, 11 |
| NFR-6 | 8, 9, 12 |
| NFR-7, NFR-10 | 1, 4 |
| NFR-8, NFR-12 | 5 |
| NFR-9 | 4 |
| NFR-11 | 8, 13 |
| UI-1, UI-2, UI-9 | 5 |
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
| W0 docs | implementer | 0 | `specs/06-pr-brief.md`, `specs/06-pr-brief.plan.md` | — | — |
| W1 contracts | implementer | 1, 2 (contract tests) | `*/src/vendor/shared/contracts/brief.ts`, `server/test/brief-contract.test.ts` | W0 | — |
| W2 server | implementer | 3, 4, 5 | `server/src/modules/brief/**` (except tests), `server/src/modules/_shared/{linked-issue,smart-diff-roles,blast-map}.ts`, `server/src/modules/reviews/**`, `server/src/modules/blast/helpers.ts`, `server/src/modules/index.ts`, `server/src/prompts/brief.system.md` | W1 | W3, W5 |
| W3 client | implementer | 7..11 | `client/src/app/repos/[repoId]/pulls/[number]/**` (except tests), `client/src/lib/hooks/brief.ts`, `client/src/lib/hooks/index.ts`, `client/messages/en/brief.json` | W1 | W2, W5 |
| W5 e2e | implementer | 13 | `e2e/specs/11-pr-brief.flow.json` | W1 | W2, W3 |
| W4 tests | test-writer | 6, 12 | `server/src/modules/brief/helpers.test.ts`, `server/test/brief.it.test.ts`, client `*.test.ts(x)` | W2, W3 | — |
| Review | architecture-reviewer ∥ security-reviewer ∥ plan-verifier | — | read-only | W4 | each other |

No file appears in two workstreams. The `_shared/linked-issue` refactor touches `reviews/intent-classifier.ts`, so it stays inside W2. Delivery steps 14..17 are done by the user after review.

### Test plan
- `cd server && pnpm typecheck && pnpm lint && pnpm arch` catches layering, cross-module import, `process.env` and concrete-adapter violations.
- `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` runs the hermetic tests: grounding, prompt assembly, contract and classifier regression.
- `cd server && pnpm exec vitest run brief.it.test` (Docker) covers workspace scoping, 202 and 409, and restart behaviour.
- `cd client && pnpm typecheck && pnpm lint && pnpm arch && pnpm test` covers the deep link, the hook and accessibility behaviour, and the fetch ban.
- `cd reviewer-core && npm run typecheck` (it reads the server shared copy).
- `cd e2e && npm run typecheck`, then `./scripts/e2e.sh` on a freshly seeded DB for flow 11. The other flows must still pass.
- The `spec:lint` gate from `/pr-self-review` runs for the two `specs/06-*` files.

### Risks / open questions
- **Explicit user sign-off recorded:** the `*/src/vendor/shared/contracts/brief.ts` edit in both copies (same commit) is requested by the task. `PrBrief` and `Risks` stay untouched so existing consumers do not change. No other vendor file is edited.
- No migration is planned. The `pr_brief.json` jsonb column holds the whole envelope. If review finds a column is needed, stop and ask.
- No lockfile or `package.json` change is planned.
- The in-memory lock assumes one API instance (`server/CLAUDE.md`). It is the same limitation as the reaper.
- `completeStructured` has its own `withRetry` for transport errors. The one-call count (NFR-13) is of `completeStructured` invocations, which the mock provider counts. The overall 90 s deadline is what bounds wall time.
- `PROJECT_CONTEXT_TOKEN_BUDGET` equals the brief's 16 000 prompt cap. `SPEC_DOCS_TOKEN_BUDGET` is therefore set smaller in `constants.ts`. The exact split is a tunable constant (D8).
- The `FileCard` location and the agent/skill `context_paths` listing were not fully traced in planning. The implementer locates both before editing. Any further shared-helper move needed to keep `arch` green follows the step 3 shim pattern.
- `missing_inputs` is a structured list (`kind`, optional `reason`). The client maps each `kind` to an i18n message. This is a planner decision inside the approved contract and needs no spec change.
- The spec itself is unchanged. The decisions above (for example the `missing_inputs` shape and the ordering in EC-19) refine behaviour the spec leaves open. If you want them recorded there, an approved spec is superseded by a new spec that `spec-creator` writes.
- Pre-existing failures from `server/INSIGHTS.md` (2026-09-25) in `skills*.it.test.ts` may appear in a full DB-backed run and are unrelated.
- AC-28 and AC-29 remain deferred (D10). US-7 has no implementation in this plan.
- Next step: save and commit this plan (step 0), then run `/run-plan`.
