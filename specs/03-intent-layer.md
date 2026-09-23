# Intent Layer — PR scope classification

**Status:** agreed
**Packages touched:** server, client, reviewer-core (schema/contracts/prompt/UI — no
change to `e2e`)
**Designed from:** the feature requirements, a read of the current tree (`server/`,
`client/`, `reviewer-core/` `CLAUDE.md`/`INSIGHTS.md`), external practice for
AI-PR-review intent/scope tools, and four decisions confirmed with the user
(D2, D5, D9, D11 below). §3 lists what the codebase already provides and, where
this design disagrees with it or corrects an assumption, says so.

---

## 1. Problem

The reviewer sees a diff with no explicit, checkable claim about what the PR is
*for*. A comment on an incidental refactor line reads the same as a comment on
the PR's actual purpose, and nothing distinguishes "true but unrelated to what
this PR is doing" from "in scope." Authors already write a title and (sometimes)
a description, but that text never reaches the review prompt as a structured,
verifiable object — it's just more prose the model may or may not weight
correctly, and the user has no way to confirm the system understood the task
before spending review budget on it.

Intent Layer makes that claim explicit and inspectable: a separate, cheap model
call turns the PR's title, description, linked issue, and changed-file/hunk-header
shape (never hunk *bodies*) into a structured `Intent { intent, in_scope[],
out_of_scope[] }`. It's shown to the user before the review results so they can
correct a misread task, and it's injected into the review prompt so findings stay
anchored to what the PR claims to do — without ever letting a real defect get
silently dropped just because it falls outside the stated scope.

## 2. Decisions

| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | Sources are **title, description, hunk headers (no bodies), the linked GitHub issue** (existing `#123` resolution), and — once it exists — repo-indexed Project Context specs. **No new outbound-URL adapter.** | `server/src/adapters/` has no generic HTTP-fetch port; adding one to follow an arbitrary Jira/Notion/Confluence link is a new untrusted-ingestion surface that needs its own security review — too large to fold into a first cut. Confirmed with the user. | Fetch arbitrary URLs found in the PR description — deferred, not ruled out forever. |
| — | **Correction, not a decision:** "repo-indexed Project Context specs" does not exist server-side yet — `GET /repos/:id/context` is called by `client/src/lib/hooks/core.ts` but no `modules/context/` (or any route) implements it; `repo-intel` indexes code symbols, not markdown. So D1 reduces, in practice, to **title + description + hunk headers + linked issue** until that module ships. The source-gathering code (§7) still takes a `specs` input so Project Context slots in later with no re-design — it will just return `[]` for now. | — |
| D2 | `review_intent`'s registry default moves from `{ openai, gpt-4.1 }` to a cheap OpenRouter flash default, `{ openrouter, deepseek/deepseek-v4-flash }` (mirrors `onboarding`'s existing default). | The feature's premise is "a separate CHEAP model call"; shipping an expensive default would only be cheap after every workspace manually reconfigures it. Confirmed with the user. | Leave `gpt-4.1` as the default and rely on users to override it — silently expensive by default. |
| D3 | Sources feeding the classifier prompt (title, description, linked-issue body) are wrapped the same way `reviewer-core` wraps untrusted content, at the classifier-prompt level. | They're author-controlled text and a prime injection vector — same reasoning as `prDescription` in `reviewer-core/src/prompt.ts`, just one layer earlier (the classifier is server-side, not inside the zero-I/O engine, so it needs its own instance of the same discipline). | Trusting classifier inputs because "it's just for scope, not the real review" — the classifier's output becomes part of the real review prompt, so the same threat model applies. |
| D4 | `Intent` gains `confidence` and `sources[]` (per-source `kind`/`status`/`note`). | Makes "never silently fabricate — flag missing context" *structural and auditable* in the DB/UI, not just a prompt-level instruction the model might ignore. | A single free-text caveat appended to `intent` — not queryable, not renderable as a distinct UI warning row. |
| D5 | Classification is a **manual, explicit action** (`POST /pulls/:id/intent`), never automatic on import or update. | Matches the explicit feature requirement ("коли PR оновився, користувач може запустити повторне визначення"). Confirmed with the user (implicit — not contested). | Auto-classify on every PR import/update — extra LLM cost per PR with no opt-out. |
| D6 | Classification runs as its own **fire-and-forget background task**, same shape as `POST /pulls/:id/review`. | Consistency with the one async-trigger pattern the codebase already has (`server/CLAUDE.md` gotcha: that route "is fire-and-forget… do not make it synchronous"); a cheap call still shouldn't block the HTTP response. | Synchronous — simpler, but blocks the request thread on an LLM round-trip for no reason. |
| D7 | The scope filter over findings is a **deterministic post-processing step in `run-executor.ts`** (server), not inside `reviewer-core`. | Keeps the engine zero-I/O and pure (`reviewer-core/CLAUDE.md`'s invariant); matches where `countBlockers` — the other severity-derived, non-prompt decision — already lives, outside the engine. | Ask the model to self-censor out-of-scope findings via a prompt instruction — contradicts the established "verdict is derived from findings, never trusted from the model" philosophy (`reviewer-core/INSIGHTS.md`), and known "severity inflation" research says a model's own severity self-assessment isn't a safe gate. |
| D8 | Placement of the Intent card: **Overview tab**, rendered first. | "Before the review results" reads most literally as "the first thing on the PR page," and Overview is the default tab. Confirmed with the user. | Findings tab — sits closer to what it contextualizes, but the user picked literal-first-thing. |
| D9 | Out-of-scope severity carve-out reuses the **agent's own `ciFailOn` gate** — same threshold that already decides CI pass/fail for that agent. | Confirmed with the user. Consistent with `countBlockers`; avoids introducing a second, disconnected severity concept. A workspace that already tuned `ciFailOn` gets consistent behavior in both places. | A fixed "always CRITICAL only" rule, independent of agent config — simpler, but a second severity concept nothing else in the codebase has. |
| D10 | The classifier resolves its own linked issue (calls `container.github`/the existing `resolveLinkedIssue` logic) rather than depending on a caller that already has a live `PrDetail`. | Keeps `POST /pulls/:id/intent` self-contained and callable from anywhere (including, later, a CI-triggered classification) without threading extra state through. | Require the caller to pass a pre-resolved `IssueMeta` — cheaper (no duplicate GitHub call) but couples the endpoint to whoever happens to have already fetched it. |
| D11 | Observability gets its **own small, PR-scoped log** rather than being folded into `run_traces`. | The classifier isn't an agent run — it has no `tool_calls`/per-file chunks, and forcing it into `RunTrace`'s shape means synthesizing a fake run id for something that was never queued as one. | Reuse `run_traces` with a synthetic run id — reuses existing SSE/`RunLogger` plumbing, but overloads a shape that means something specific ("one agent's execution of one review"). |

## 3. What the current tree already gives us

This is a starter whose schema carries tables for every lesson; a surprising
amount of Intent Layer's foundation is already in place from the initial
scaffold. Checked, not assumed:

| Layer | Present | Where |
|---|---|---|
| DB | `pr_intent(pr_id PK, intent, in_scope jsonb, out_of_scope jsonb)` | `server/src/db/schema/reviews.ts:57-64` |
| Contracts | `Intent { intent, in_scope, out_of_scope }`, `PrIntentRecord = Intent.extend({ pr_id })` | `contracts/brief.ts:9-14`, `contracts/review-api.ts:59-61` (both vendor copies) |
| Repository | `upsertIntent`/`getIntent` | `reviews/repository/pull.repo.ts:49-68`, re-exported via `ReviewRepository` (`reviews/repository.ts:130-136`) — **nothing calls either yet** |
| Model selection | `FeatureModelId` already includes `'review_intent'`; `FEATURE_MODELS` registry entry exists; `resolveFeatureModel`/`getFeatureModelOverride` (`settings/feature-models.ts`) is the generic read path | `contracts/platform.ts:14-79` |
| Settings UI | `SettingsModels.tsx` already iterates `FEATURE_MODELS` generically — `review_intent` already renders a picker with **no client change needed** | `client/.../SettingsModels/SettingsModels.tsx` |
| Prompt guard | `INJECTION_GUARD` already names "derived intent/scope" as an untrusted category the model must not treat as instructions | `reviewer-core/src/prompt.ts:16-28` |
| Linked issue | `#123`-style resolution already implemented (`resolveLinkedIssue` → `getIssue`), surfaced as `PrDetail.linked_issue: IssueMeta` — but **not** on the DB-persisted `PullRow`, only computed live in `GET /pulls/:id` | `server/src/adapters/github/octokit.ts:118-131, 351` |
| Diff shape | `UnifiedDiff.files[].hunks[]` gives `{file, oldStart, oldLines, newStart, newLines, newLineNumbers}` with **no content field** — exactly "hunk headers, no bodies" | `@devdigest/shared` (`adapters.ts`), parsed by `server/src/adapters/git/diff-parser.ts` |
| Structured LLM call pattern | `conventions/service.ts`'s AI-extraction path: `container.llm(provider)` → `llm.completeStructured({ model, schema, schemaName, messages, maxRetries, timeoutMs })` | `conventions/service.ts:108-126` — the reference shape for the classifier call |
| Redaction | `redactSecrets`/`redactReview` already strip secret-shaped strings from model-authored free text | `reviewer-core/src/review/redact.ts` |
| Severity gate | `countBlockers(findings, agent.ciFailOn)` — the existing deterministic severity-vs-threshold check, reused by D9 | `reviewer-core` (`output/to-review.ts`), called from `run-executor.ts` |

**Where this design disagrees with, or corrects, what's there:**

- `review_intent`'s registry default changes per D2.
- `Intent` needs new fields (`confidence`, `sources[]`) per D4 — `pr_intent` needs
  matching columns.
- "Project Context specs" is not a real source yet (see the correction row under
  D1) — treated as a future no-op input, not built against here.
- `ReviewRepository`'s facade re-types `upsertIntent`/`getIntent`'s signatures
  separately from `pull.repo.ts`'s real implementation
  (`server/INSIGHTS.md`, 2026-09-16 entry) — both must be updated together or a
  field addition compiles at the call site and fails at the facade.

**Not present, and therefore the work:** the classifier call itself; the
`POST /pulls/:id/intent` route; wiring `getIntent`/the diff's hunk headers into
`run-executor.ts`; the `reviewer-core` prompt slot; the deterministic scope
filter; the Intent card; the classifier's own observability log.

## 4. Scope

**In** — the classify endpoint + background task · `Intent`/`pr_intent` schema
extension (`confidence`, `sources[]`, `classifiedAt`, `classifiedForSha`) ·
hunk-header-only diff digest builder · linked-issue resolution reused inside the
classifier · a new `PromptParts.intent` slot + assembly section in
`reviewer-core` · the deterministic out-of-scope filter in `run-executor.ts` ·
the Intent card (Overview tab) with a re-run affordance and a staleness banner ·
`review_intent`'s default model change (D2) · a minimal classifier observability
log.

**Out** — automatic/on-import classification (D5) · generic outbound URL
fetching for arbitrary ticket/plan links (D1) · building the Project Context
module itself (referenced, not implemented, here) · per-finding "why was this
filtered" UI beyond a scope badge on the finding · CI-runner (agent-runner
outside the studio server) wiring — `reviewer-core`'s new field is available to
it for free, but threading intent through the CI entry point is a separate task
if wanted · retry/backoff policy beyond the existing `maxRetries`/`timeoutMs`
convention already used by `completeStructured` callers.

## 5. Data model

### 5.1 Migration — generated, never hand-written

```
pr_intent   + confidence text not null default 'high'
            + sources jsonb not null default '[]'::jsonb
            + classified_at timestamptz
            + classified_for_sha text
```

`cd server && pnpm db:generate && pnpm db:migrate` → lands as `0015_*` (current
latest is `0014_modern_shinobi_shaw.sql`). `pr_intent` has **no `workspace_id`**
(`server/INSIGHTS.md`, 2026-09-17 entry) — it's tenant-scoped only via its
`pr_id` FK to `pull_requests`; any read/write goes through a workspace-scoped PR
lookup first, never a direct filter on `pr_intent` itself. Never hand-edit
`server/src/db/migrations/**` (root `CLAUDE.md`).

### 5.2 Findings — scope flag

The deterministic filter (§8.2) needs somewhere to record "kept despite being
out of scope." Add `findings.scope` (`text`, nullable, `'out_of_scope' | null` —
absence means "in scope / not evaluated," never a lie) in the same migration.
Dropped out-of-scope findings are not persisted at all (they never reach
`insertFindings`), so `scope` only ever marks the survivors that were kept
*despite* being out of scope.

## 6. Contracts (both vendor copies — `server/src/vendor/shared/` and
`client/src/vendor/shared/`, same commit)

`contracts/brief.ts`:

```ts
export const IntentSource = z.object({
  kind: z.enum(['title', 'description', 'linked_issue', 'spec', 'hunk_headers']),
  status: z.enum(['used', 'missing', 'unreachable']),
  note: z.string().nullish(),
});
export type IntentSource = z.infer<typeof IntentSource>;

export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']).default('high'),
  sources: z.array(IntentSource).default([]),
});
```

`PrIntentRecord = Intent.extend({ pr_id })` (`review-api.ts`) needs no change —
it inherits the new fields for free.

`Finding` (`contracts/findings.ts` or wherever it's declared) gains
`scope: z.enum(['out_of_scope']).nullish()`.

## 7. Server

### 7.1 Where it lives

Inside the existing `reviews` module — it's PR-scoped and already owns
`pr_intent`'s repository methods; a new top-level module would just duplicate
the PR-lookup/workspace-scoping plumbing `reviews` already has.

New files:

- `modules/reviews/intent-classifier.ts` — builds the classifier prompt (source
  gathering + `wrapUntrusted`-equivalent wrapping) and calls
  `llm.completeStructured`, following `conventions/service.ts`'s shape exactly.
- Additions to `modules/reviews/constants.ts` (schema name, max retries/timeout),
  `modules/reviews/helpers.ts` (hunk-header digest builder: one
  `@@ -oldStart,oldLines +newStart,newLines @@` string per hunk, grouped by
  file, from the already-loaded `UnifiedDiff` — no content).

### 7.2 Route

`POST /pulls/:id/intent` — fire-and-forget (D6), same `IdParams` shape as
`POST /pulls/:id/review`, own rate limit (looser than review's `10/min` since
it's one cheap call — `20/1min`, matching the `test-connection` route's
precedent). Response: `{ status: 'running' }` immediately; the classification
continues in the background and persists via `upsertIntent`.

Intent read path: fold `PrIntentRecord | null` into the existing
`GET /pulls/:id` (`PrDetail`) response rather than a separate route — the
Intent card renders on initial page load, not on demand, so this avoids an
extra round trip. `PrDetail` gains `intent: PrIntentRecord.nullish()`.

Both routes: `getContext(container, req)` first, then the existing
workspace-scoped `getPull` lookup (per `server/CLAUDE.md`) — `pr_intent` itself
carries no `workspace_id` (§5.1), so scoping happens through the PR, not a
direct filter.

### 7.3 `run-executor.ts` wiring

`executeRuns` currently loads only the diff (`loadDiff`) despite its own
docblock claiming "Loads the diff + intent once" — that was never wired. Add,
alongside the diff load:

```ts
const intent = await this.repo.getIntent(pull.id);
```

Pass it into `reviewPullRequest(...)` the same way `callers`/`repoMap` are
passed — `...(intent ? { intent } : {})` — once per `executeRuns` call, not
per-agent.

### 7.4 Scope filter (deterministic, D7)

Runs in `runOneAgent`, after `reviewPullRequest` returns grounded findings,
before `insertFindings`/`completeAgentRun`:

```
for each grounded finding:
  if finding.file (or a keyword in finding.title/rationale) matches
     an entry in intent.out_of_scope:
    if severity meets agent.ciFailOn (same check countBlockers uses):
      keep it, set finding.scope = 'out_of_scope'
    else:
      drop it (never persisted)
  else:
    keep it, scope stays null
```

The exact match heuristic (file-path glob vs. keyword/substring against the
free-text `out_of_scope` strings) is an implementation-time call — `out_of_scope`
entries are free text, not structured globs, so start with a conservative
substring/keyword match over `finding.file` + `finding.title`, and treat
over-matching (dropping too much) as the failure mode to bias against, per the
severity-inflation research: **when in doubt, keep the finding.**

## 8. reviewer-core

`PromptParts` (`reviewer-core/src/prompt.ts`) gains:

```ts
intent?: { summary: string; inScope: string[]; outOfScope: string[] };
```

Rendered as a new section, `## Declared intent & scope`, wrapped via
`wrapUntrusted('intent', formatted)`, placed near `## PR description` (both
describe "what this PR claims to do"). Omitted entirely when `undefined` — the
existing "byte-identical when the slot is empty" contract holds. `assembly`
gains `intent: string | null`, following the `pr_description`/`callers`/
`repo_map` precedent exactly. `ReviewInput` (`review/run.ts`) gains the matching
optional field so `reviewPullRequest` can pass it through to `assemblePrompt`.

No change needed to `INJECTION_GUARD` — it already names "derived intent/scope"
as untrusted, so this only fills in the section it already anticipated.

## 9. Client

New component: `client/src/app/repos/[repoId]/pulls/[number]/_components/IntentCard/`
(`IntentCard.tsx`, `IntentCard.test.tsx`, `styles.ts`, `constants.ts`,
`helpers.ts`, `index.ts` — full folder shape per `client/CLAUDE.md`), rendered
at the top of `OverviewTab.tsx` (D8).

Shows: `intent.intent` (summary), `in_scope`/`out_of_scope` lists, a confidence
badge, and any `sources` entries with `status !== 'used'` rendered as an
explicit warning row (e.g. "linked issue #123 could not be reached") — never
omitted, per the "don't silently fabricate" requirement.

Re-run affordance: a plain `Button` (no mode picker needed, unlike
`RunReviewDropdown`) wired through a new `lib/hooks/*` mutation hitting
`POST /pulls/:id/intent`; `fetch` inside a component stays banned per
`client/CLAUDE.md`.

Staleness: compare `pr_intent.classifiedForSha` to `pull_requests.head_sha`
(already on `PrMeta`); when they differ, show a "PR updated since this was
classified" banner next to the re-run button — mirrors the existing
reviewed/needs-review/stale distinction already driven by `head_sha` comparison.

Model picker: **no client change** — `SettingsModels.tsx` already renders
`review_intent` generically (§3); its `setModel` already hardcodes
`provider: 'openrouter'` on save, consistent with D2's OpenRouter-flash default.

i18n: new copy goes in `client/messages/<locale>/prReview.json` (or a new
`intent.json` namespace), never hardcoded in `IntentCard.tsx`.

## 10. Logging / observability (D11)

A minimal, PR-scoped log — not `run_traces`. Recommended shape: reuse
`pr_intent.sources` itself as the primary observability record (it already
carries "which sources were used/missing/unreachable"), plus log at `info`
level (via the existing `Logger`/pino path, not a new DB table) one line per
classify call: resolved `provider`/`model` (from `resolveFeatureModel`), a
token estimate (`container.tokenizer.count(...)`, already used in
`run-executor.ts` for the skills digest), and status
(`success`/`failed`/`partial`). No new table needed unless the user later wants
a queryable history of past classifications — flagged as a possible fast-follow,
not built here.

Secrets: `redactSecrets` runs over the classifier's own `intent`/`in_scope`/
`out_of_scope` output before persisting/logging, same as review output — it's
also LLM-authored free text that could echo something secret-shaped it was fed.
Diff bodies never enter the log because they never enter the classifier prompt
in the first place (structural, not filtered) — the log's source list records
file paths + synthetic hunk-header strings only.

## 11. Testing

- **Unit** (`reviewer-core`): `assemblePrompt` with/without `intent` (byte-identical
  when absent); the omit-when-undefined contract for the new slot.
- **Unit** (`server`): hunk-header digest builder; the scope-filter matching
  function as a pure helper (in `helpers.ts`, testable without a DB); confidence/
  sources fallback logic when description is empty or the linked issue fetch
  throws.
- **Integration** (`.it.test.ts`): `POST /pulls/:id/intent` round-trip against a
  mocked LLM adapter (`src/adapters/mocks.ts`); `run-executor.ts` picking up a
  persisted intent and producing the new prompt section + a scope-filtered
  finding set.
- **Client**: `IntentCard.test.tsx` (confidence badge, missing-source warning
  row, staleness banner); the new hook's test under `lib/hooks/*`.

## 12. Work breakdown

1. Contracts: `Intent`/`IntentSource`/`Finding.scope` (both vendor copies) +
   `review_intent` default (D2).
2. Schema + migration: `pr_intent` new columns, `findings.scope`, `pnpm db:generate`.
3. Repository: extend `upsertIntent`/`getIntent` (both `pull.repo.ts` and the
   `ReviewRepository` facade — server/INSIGHTS.md gotcha).
4. `intent-classifier.ts` + helpers (hunk digest, source gathering, linked-issue
   resolution reuse).
5. Route: `POST /pulls/:id/intent`; fold `intent` into `GET /pulls/:id`.
6. `reviewer-core`: `PromptParts.intent`, `ReviewInput.intent`, assembly section.
7. `run-executor.ts`: load intent, pass to `reviewPullRequest`, deterministic
   scope filter on the returned findings.
8. Client: `IntentCard/`, hook, staleness banner, i18n keys.
9. Tests per §11.
10. `engineering-insights` skill run at the end (root `CLAUDE.md` requirement).

## 13. Acceptance criteria

- Classifying a PR with an empty description still produces an `Intent` (from
  title + hunk headers), with `confidence: 'low'` and a `sources` entry marking
  `description` as `'missing'` — never a fabricated summary.
- Classifying a PR whose description mentions an external plan/spec link that
  isn't fetchable produces a `sources` entry `{ kind: 'spec', status:
  'unreachable', note: … }` — the intent never invents the plan's content.
- A review run against a PR with a persisted intent includes a
  `## Declared intent & scope` section in its prompt; a review run against a PR
  with no persisted intent produces a byte-identical prompt to before this
  feature.
- A grounded finding whose file matches an `out_of_scope` entry and whose
  severity is below the agent's `ciFailOn` gate is dropped before persistence.
- A grounded finding whose file matches `out_of_scope` but meets `ciFailOn` is
  kept, persisted with `scope: 'out_of_scope'`, and visually distinguished in
  the UI.
- The Intent card renders on the Overview tab before any review results, shows
  a re-run button, and shows a staleness banner when `head_sha` has moved since
  `classified_for_sha`.
- `review_intent`'s registry default is an OpenRouter flash model; the Settings
  page already renders its picker with no code change.

## 14. Risks / open questions (remaining — not yet locked)

- **Scope-filter match heuristic** is specified only at "substring/keyword,
  biased toward keeping" — needs calibration once real PR data is available;
  may need tightening if it over-keeps (defeats the filter) or loosening if it
  over-drops (the worse failure mode per severity-inflation research).
- **Cost**: an extra LLM call per manual classification, on top of per-agent
  review calls. No specific rate-limit number was required by the user;
  `20/1min` here is a reasonable guess, not a requirement.
- **Project Context dependency**: once that module ships, the classifier's
  `specs` source input needs to actually be populated — flagged so it isn't
  forgotten as a silent gap.
- **CI runner**: `reviewer-core`'s new `intent` field is available to the
  agent-runner for free, but nothing in this plan wires a CI-triggered review
  to look up or pass a persisted intent — follow-up if wanted.
