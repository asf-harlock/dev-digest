## Hand-back 1

## Spec intake: Onboarding Tour (five-section repository tour)

### Framing
A developer who has just connected an unfamiliar repository wants one page that explains it: the architecture, the files that matter, how to run it locally, what to read first, and a few safe first tasks. Done means: they open **Onboarding Tour** from the sidebar and see five sections. Every file path, command and number on the page exists in the indexed repo. The page says plainly whether the content was written by the model or is a deterministic skeleton (index degraded, or the model call failed). Clicking an "On this page" item scrolls to that section and marks the item active.

This is mostly **not** new capability. The repo already ships parts of it that nothing calls yet: an `onboarding` table, an `Onboarding` contract, an `onboarding.system.md` prompt, an `onboarding` feature-model entry, `repoIntel.getTopFilesByRank` / `getCriticalPaths` (commented "onboarding reading-path"), an `activeKeyFor` case, an `onboarding.json` i18n namespace and a `MermaidDiagram` component with no caller. What is missing is the module that connects them, the entry point, and a contract that fits the mockup.

### Placement
Module(s): server + client + both `@devdigest/shared` copies + e2e → file `specs/05-onboarding-tour.md`, SPEC-05 (highest existing is `specs/04-project-context.md`) · Supersedes: —

### Insights read
Read `server/INSIGHTS.md` (relevant: repo-intel degrades and never throws; the seeded repo is always degraded; the clone is a reset mirror and `readFile` has no containment check; 422 not 400; feature-model re-query pattern), `client/INSIGHTS.md` (relevant: `isPending` is not progress, global error toast, sticky query error, `nav.ts` is editable, `activeKeyFor` dead cases) and root `INSIGHTS.md` (relevant because the feature is cross-module and changes shared contracts: `.nullish()` for persisted jsonb, client copy `.optional()`). Skipped `reviewer-core/`, `mcp/` and `e2e/INSIGHTS.md`: reviewer-core is only touched if approach D is picked, mcp is not touched, and I read `e2e/CLAUDE.md` for the flow rules.

### Sources read
| Source | What I took from it |
|---|---|
| User request (translated) | 5 sections; deterministic facts from `repoIntel.*`; reading path = PageRank × (1 + hotness); one structured LLM call; honest skeleton on degraded index or LLM failure; TOC click → scroll + active item |
| Mockup PNG (pasted-image-20260930-100500.png) | New nav item "Onboarding Tour" under WORKSPACE; sticky ON THIS PAGE list with 5 anchors (active = left accent bar); header with Regenerate and Share link; subtitle "Generated from index of 12,450 files · last refreshed 2h ago"; 5 collapsible cards. Architecture: prose with code chips + node diagram (client → server.ts → middleware → redis, api/public/* → postgres). Critical paths: path — description + Open. Run locally: numbered commands + copy icon. Reading path: 3 numbered paths + why. First tasks: 3 cards with title, path (one is the directory `specs/`, one is `test/ratelimit.test.ts`), complexity badge |
| `server/src/modules/repo-intel/types.ts:25-32,137-172` | `IndexStatus` full/partial/degraded/failed; `DegradedReason` includes `flag_off`, `repo_too_large`, `no_data`; facade has `getRepoMap`, `getTopFilesByRank`, `getCriticalPaths`, but **no** stack/scripts/structure method |
| `server/src/modules/repo-intel/pipeline/rank.ts:4-7,51` | `hotness = 0` always ("Option B"), `rank = pagerank` |
| `server/src/modules/repo-intel/service.ts:639-702` | `getTopFilesByRank` filters junk paths; `getCriticalPaths` = greedy chains from the top 5 ranked roots (roots are not junk-filtered) |
| `server/src/modules/repo-intel/repository.ts:449-459` | `getRankedPaths` orders by `rank DESC` only, with no tie-break |
| `server/src/db/schema/context.ts:120-126` | `onboarding` table: `repo_id` PK → repos, `json` jsonb, `generated_at`. No workspace_id, status, source, index SHA or error |
| `server/src/vendor/shared/contracts/knowledge.ts:28-47` (client copy identical per grep) | `OnboardingSection { kind: string, title, body markdown, diagram mermaid?, links[{label,path}] }` |
| `server/src/prompts/onboarding.system.md` | Existing prompt: sections via `{{sections}}`, `<untrusted>` rule, "never invent paths", mermaid only for `architecture`/`routes_and_apis`, `{{language}}` |
| `server/src/vendor/shared/contracts/platform.ts:15-51` | `FeatureModelId 'onboarding'`, default `openrouter / deepseek/deepseek-v4-flash` |
| `server/src/modules/reviews/intent-classifier.ts:1-36`, `reviews/constants.ts:31` | Pattern for one structured call: resolve feature model → `container.llm` → `completeStructured` with timeout/retries; `redactSecrets` from reviewer-core; `INTENT_TIMEOUT_MS = 60_000` |
| `client/messages/en/onboarding.json:10` | Existing copy lists **different** five sections (overview, architecture, key modules, getting started, conventions & gotchas) |
| `client/src/app/onboarding/page.tsx:1`, `e2e/specs/06-onboarding.flow.json` | `/onboarding` is the **Add repository** screen |
| `client/src/components/app-shell/helpers.ts:29` | `pathname.includes("/onboarding") → "onboarding-tour"` |
| `client/src/vendor/ui/nav.ts:21-37` | WORKSPACE has only pulls + context; no tour entry |
| `client/src/components/mermaid-diagram/MermaidDiagram.tsx:37,45` | `securityLevel: "strict"`, `mermaid.render`; has no caller (client/CLAUDE.md) |
| `client/src/app/repos/[repoId]/context/_components/ContextPageView/ContextPageView.tsx` | Page analogue: AppShell + crumb, `RepoNotFound`, header + secondary Rescan button, hook in `lib/hooks/core` |
| Grep `client/src` for IntersectionObserver/scrollIntoView/aria-current | No scroll-spy component exists. `scrollIntoView` smooth is used in `ReviewRunAccordion.tsx:50`; `aria-current` in `ContextDocRow.tsx:115`; clipboard copies in `ConventionCard.tsx:48-52` (errors swallowed) |
| `server/CLAUDE.md`, `client/CLAUDE.md`, `e2e/CLAUDE.md` | Layer rules, `getContext`, secrets chokepoint; hooks-only fetch, i18n; flows run on the seeded `acme/payments-api` and must never trigger a model call |

### Constraints
- repo-intel must degrade, never throw; array methods return `[]` — `server/CLAUDE.md:54-55`, `repo-intel/types.ts:15-22`.
- `hotness` is always 0 because the clone is shallow (`CLONE_DEPTH = 1`) — `repo-intel/pipeline/rank.ts:4-7`, `repos/constants.ts:9`, `db/schema/repo-intel.ts:96-98`.
- Contract changes go into both vendor copies. The client copy uses `.optional()` where the server copy uses `.default()` — root `CLAUDE.md` Gotchas, root `INSIGHTS.md` 2026-09-29.
- A persisted jsonb document read by an older/newer shape needs `.nullish()` — root `INSIGHTS.md` 2026-09-16.
- `onboarding` has no `workspace_id`; it must be scoped through a `repos` join — `db/schema/context.ts:120-126`, `server/INSIGHTS.md` 2026-09-17.
- Migrations never run on boot — root `CLAUDE.md`.
- LLM keys only via `container.secrets` / `buildLlm` — `server/CLAUDE.md:40`.
- The seeded demo repo has `clonePath: null` and is therefore always degraded — `server/INSIGHTS.md` 2026-09-26 (`db/seed.ts:145`).
- e2e flows must not trigger a model call — `e2e/CLAUDE.md`.
- `readFile(repo, path)` has no containment check — `server/INSIGHTS.md` 2026-09-29 (`adapters/git/simple-git.ts:129-131`).
- A fire-and-forget UI must track the job until the result lands; errors are toasted globally, so no second toast — `client/INSIGHTS.md` 2026-09-24.
- Validation failures return 422 — `server/INSIGHTS.md` 2026-09-25.
- Every UI string goes through next-intl — `client/CLAUDE.md`.

### Findings
| ID | Pri | Lens | Finding | Evidence | Proposal |
|---|---|---|---|---|---|
| F1 | high | Corner case | "PageRank × (1 + hotness)" is really just PageRank. `hotness` is hard-coded 0 and the clone is depth 1, so there is no churn history. `HOTNESS_WINDOW_DAYS = 180` exists but nothing uses it. | `rank.ts:4-7,51`; `repos/constants.ts:9`; `repo-intel/constants.ts:50` | v1 reading path = stored `file_rank.rank` (PageRank), described honestly in the UI and spec. Computing hotness (deeper clone + git log) becomes a Non-goal or a separate spec (Q2) |
| F2 | high | Cross-module | The "stack, structure, routes, scripts" facts the request attributes to `repoIntel.*` do not exist as facade methods. Only endpoints/crons (`file_facts`), the repo map and rank reads exist. The prompt already expects "FACTS (stack, services, sizes, routes, tests)". | `types.ts:137-172`; `pipeline/full.ts:186`; `onboarding.system.md:17` | Specify a deterministic facts collector: manifests, lockfile → package manager, `scripts`, compose services, `.env.example` keys, top-level dirs, routes. Whether to restore it from history is **pending R1** |
| F3 | high | Cross-module | The staged contract (`kind: string`, markdown `body`, `links`), the prompt (sections include `routes_and_apis`) and the i18n copy (overview / architecture / key modules / getting started / conventions) all disagree with the mockup's 5 sections. The typed rows the mockup needs (Open, copy, complexity, why-read) are not in the contract at all. | `knowledge.ts:28-47` (both copies); `onboarding.system.md:4,23-27`; `messages/en/onboarding.json:10`; mockup cards 1-5 | Replace with a typed tour contract: 5 fixed section kinds with per-kind item shapes, in both vendor copies. Update the prompt and i18n copy to match (Q1) |
| F4 | high | Missing state | The honest skeleton-vs-LLM status has nowhere to live. The table stores only `json` + `generated_at`, with no source, reason, index SHA, model or last error. | `db/schema/context.ts:120-126` | The tour carries `source: llm \| skeleton`, `degraded_reason`, `index_sha`, `generated_at`, `model`, `last_error`, and the page shows a visible status badge. The planner picks jsonb meta vs columns |
| F5 | high | Missing state | The seeded `acme/payments-api` (the mockup's own repo) is always degraded, and e2e may not call a model. So in dev and e2e the skeleton is the path users actually hit. | `server/INSIGHTS.md` 2026-09-26; `e2e/CLAUDE.md` | The skeleton is a first-class, complete render of all 5 sections. A new `e2e/specs/10-onboarding-tour.flow.json` asserts the skeleton + status + TOC and never clicks Regenerate |
| F6 | high | Untrusted/grounding | LLM output may name paths or numbers that do not exist. The mockup's "used by 14 routes" is a number, `specs/` is a directory, and `test/ratelimit.test.ts` looks like a file to be created. | mockup Critical paths row 3, First tasks cards 2-3; `onboarding.system.md:16` | Every file path in every section, chip and diagram node is checked against the index; unknown paths are dropped and counted. First-task targets may be an existing file **or** existing directory. Counts are computed deterministically, never taken from the model |
| F7 | high | Untrusted input | README, manifests, script bodies, file names and `.env.example` flow into the prompt. That is a prompt-injection path, and `.env.example` often holds real-looking keys (secret leak to the provider). | `reviewer-core/src/prompt.ts` (`wrapUntrusted`); `intent-classifier.ts:9` (`redactSecrets`); `onboarding.system.md:11-12` | Wrap every repo-derived block with `wrapUntrusted` and run `redactSecrets` before the call. Never read `.env`, only `.env.example` key names. An instruction found in repo content is ignored and never echoed |
| F8 | high | Untrusted input | "How to run locally" invites copy-paste into a terminal. A model-authored command (`curl … \| sh`) is social-engineered command injection. | mockup card 3; security skill A05 / ASI05 | Commands come only from deterministic facts (existing scripts, detected package manager, compose file). The model may only add notes. Copy-only, never executed; free-text commands are rejected |
| F9 | high | Corner case | Generation is one LLM call of up to tens of seconds, and there is no stated guard against a double click or two tabs. | `reviews/constants.ts:31` (60 s precedent); `client/INSIGHTS.md` 2026-09-24 | `POST` returns `running` at once. The client polls until `generated_at` changes or a stated timeout passes. A second POST while one is running returns 409, and Regenerate is disabled |
| F10 | high | Corner case | A failed Regenerate must not destroy a good existing tour (data loss). | design-lenses "Replace / delete semantics" | Persist the new tour before replacing the old one. On failure keep the previous LLM tour and show "Last regeneration failed · <when>". Only a repo with no LLM tour falls back to the skeleton (Q4) |
| F11 | med | Cross-module | `/onboarding` is the Add-repository screen. `activeKeyFor` uses `includes("/onboarding")`, so once the nav item exists, the Add-repo page will highlight "Onboarding Tour". | `app/onboarding/page.tsx:1`; `app-shell/helpers.ts:29`; `e2e/specs/06-onboarding.flow.json` | Tour at `/repos/:repoId/onboarding-tour` (or `/tour`), matched precisely. Add a `nav.ts` WORKSPACE entry between Pull Requests and Project Context, as in the mockup |
| F12 | med | Missing state | Stale is undefined. "last refreshed 2h ago" could mean the index's `updatedAt` or the tour's `generated_at`. | mockup subtitle; `types.ts:42-46` | Subtitle shows file count (`filesIndexed`) + tour age. A "Stale — index changed since generation" badge appears when the tour's `index_sha` ≠ current `lastIndexedSha` |
| F13 | med | UX | Scroll-spy is the explicit requirement, and no component exists for it. Undecided: highlight on scroll as well as on click, a collapsed target, URL hash, deep link on load, reduced motion, narrow screens. | mockup ON THIS PAGE; grep: no `IntersectionObserver` in `client/src` | Click → scroll to the section heading (instant when `prefers-reduced-motion`), expand it if collapsed, move focus to the heading, set `#hash`, mark the item `aria-current`. Scrolling also updates the active item; on load, `#hash` scrolls to that section. Below a width breakpoint the menu becomes a non-sticky list. The ARIA token is **pending R4** |
| F14 | med | UX (a11y) | The collapsible cards need a real disclosure control. A chevron-only header is unlabeled, and a `role="button"` wrapper around nested buttons is a known trap in this repo. | mockup chevrons; design-lenses "Inherited debt" | The header is a `<button aria-expanded aria-controls>` inside the section heading. Expanded/collapsed state does not persist across reloads (Q8) |
| F15 | med | Grounding | The mockup diagram includes redis/postgres, which are infrastructure and not in the import graph. The prompt lets the model write free mermaid, and invalid diagrams are dropped silently. | mockup diagram; `onboarding.system.md:7,29-36`; `MermaidDiagram.tsx:37` | The model returns structured `nodes/edges`, and only nodes that match an indexed path/dir or a detected service are kept. It is rendered through the existing `MermaidDiagram` (strict). With no valid diagram, show text only |
| F16 | med | Cross-module | "Open" has no target. No in-app code file viewer exists (`context/file` serves specs only), and `readFile` has no containment check. | `server/INSIGHTS.md` 2026-09-23 fix note, 2026-09-29 | Open = link to the file on the repo host at the default branch, new tab, `rel=noopener`, only for index-validated paths. Whether a host URL is available is **pending R3** |
| F17 | med | Corner case | Huge repos (mockup: 12,450 files) could blow the prompt budget, and `repo_too_large` exists as a reason. | `types.ts:31`; `getRepoMap(tokenBudget)` `types.ts:148` | Fixed token budget for facts and the repo map, with deterministic truncation. When the index reports `repo_too_large`, go straight to the skeleton |
| F18 | med | Corner case | The reading path is not deterministic on ties. `ORDER BY rank DESC` has no tie-break, and `getCriticalPaths` roots include tests/configs. | `repo-intel/repository.ts:457`; `service.ts:679` | Tie-break by path ascending. Apply the junk filter to critical-path roots. Same index gives the same list |
| F19 | med | Corner case | Monorepos / multi-package repos, like this one with no root `package.json`: a root-only manifest probe finds nothing. | `server/INSIGHTS.md` 2026-09-20 (conventions `CONFIG_SEARCH_SKIP_DIRS`) | Probe the root + one level down. Group run commands per package with a `cd <pkg>` prefix derived from the path |
| F20 | med | Missing state | No provider key or unreachable model: `buildLlm` throws `ConfigError`. | `server/INSIGHTS.md` 2026-09-20; `platform/container.ts` | Skeleton with reason "model not configured" and a link to Settings → Feature Models / API Keys |
| F21 | med | Missing state | Empty repo, zero indexed files, non-JS/TS repo (empty import graph → empty reading path and critical paths). Which languages ast-grep indexes is unverified. | `rank.ts:29`; `service.ts:666` | Each section has its own empty state saying why (e.g. "No import graph for this language"). No section is ever hidden |
| F22 | med | UX | Share link has no meaning without auth. The app is localhost-only (`LocalNoAuthProvider`), so a link works only on the same machine. | root `CLAUDE.md` Gotchas | Copy the page URL (+ `#section`) and confirm with "Link copied — works only where this DevDigest instance runs". No public share (Q3) |
| F23 | med | UX | Regenerate spends money on a paid model with no confirmation or cost hint. | `platform.ts:46-51` (feature model) | Regenerate shows which model it will use; no confirm when there is no LLM tour yet (Q7) |
| … | low | UX (3) | Copy-button feedback (clipboard denial is currently swallowed, `ConventionCard.tsx:48-52`) → "Copied"/"Copy failed" in `aria-live`; complexity badge is model opinion → label "suggested", text not colour only; output language → the UI locale passed into `{{language}}` (`onboarding.system.md:42`) | as cited | as stated |

### Approaches
| Option | What | Touches | Size | Risk |
|---|---|---|---|---|
| A. On-demand, no persistence | `GET` computes facts + skeleton + LLM on every visit | server, client, contracts | S | Pays for a model call and waits 10-60 s on every visit; Regenerate is meaningless |
| B. Reuse the staged pieces as-is | Keep the generic `Onboarding` contract (markdown `body` + `links`) and existing prompt; client renders markdown per section | server, client | S-M | Cannot deliver the mockup's typed rows (Open, copy, complexity, why) without parsing markdown, so grounding and the command allowlist (F6, F8) cannot be enforced |
| C. Deterministic skeleton + LLM enrichment, persisted (recommended) | Server builds a typed 5-section skeleton from facts + rank. One `completeStructured` call adds prose, descriptions and why-lines, and proposes tasks/diagram against a typed schema. A grounding merge drops unknown paths and non-allowlisted commands. Stored in the existing `onboarding` table with source/status/index-SHA meta. Fire-and-forget generate + poll. Typed contract in both copies | server (new module, facts collector, migration if columns), both shared copies, client page + nav + TOC, i18n, e2e flow | M-L | Contract churn in both vendor copies; a migration if meta becomes columns |
| D. Engine in `reviewer-core` | Like C, but prompt assembly, schema and grounding merge are pure functions in `reviewer-core` (zero I/O); server only gathers facts and persists | + reviewer-core | L | Wider change. Worth it only if CI/MCP will also generate tours |

Recommendation: **C**. Pick **D** if you want the tour generated from CI or the MCP server later. Pick **B** only if you accept dropping the typed rows the mockup shows.

### Research requests (for the caller — run one `researcher` per row, in parallel)
| ID | Question | Scope | Where to look | Unblocks |
|---|---|---|---|---|
| R1 | Does git history contain a prior onboarding-tour implementation (server module, route, facts collector for stack/scripts/services, client page)? If yes, which commits add and remove it, and which section kinds and route path did it use? | repo | `git log -S 'onboarding.system.md' --oneline --all`; `git log -S 'OnboardingSection' --all`; `git log -S 'getCriticalPaths' --all`; `git log --all -- 'server/src/modules/onboarding/**' 'client/src/app/repos/*/onboarding*/**'` | F2, F3, F11, approach choice |
| R2 | When does indexing run for a repo (which callers enqueue the `indexRepo`/`refreshIndex` jobs: on clone, on resync, on poll)? Do `IndexState.lastIndexedSha` / `updatedAt` change on every resync? | repo | `server/src/modules/repo-intel/service.ts:160-180`; `grep -rn "enqueue(" server/src`; `server/src/modules/repos/`, `server/src/modules/polling/` | F12 (stale definition), Q5 |
| R3 | Does the `Repo` DTO (both vendor copies of `contracts/platform.ts`) or the `repos` table carry enough to build a host file URL (`html_url`, owner/name, default branch, provider)? And is there any in-app route today that returns a code file's contents by path? | repo | `server/src/vendor/shared/contracts/platform.ts` ~L150-270; `client/src/vendor/shared/contracts/platform.ts`; `server/src/db/schema/` repos table; `grep -rn "readFile(" server/src/modules` | F16, Q6 |
| R4 | For an in-page "On this page" table-of-contents link whose section is currently in view, which `aria-current` token is correct per WAI-ARIA 1.2 / APG (`location` vs `true` vs `step`)? Should a click also move keyboard focus to the target heading? | external | WAI-ARIA 1.2 spec `aria-current`; ARIA Authoring Practices; MDN `aria-current`; GOV.UK / USWDS "in-page navigation" component docs | F13 |

### Questions for the user
Blocking (the spec cannot be written without these):
- **Q1** Should the tour use a new **typed** contract with exactly the 5 mockup sections (architecture, critical_paths, run_locally, reading_path, first_tasks), replacing the staged generic `Onboarding` contract, the prompt's section list and the `onboarding.json` copy? — my default: yes, typed contract, staged pieces rewritten to match.
- **Q2** Hotness is always 0 today (shallow clone). Should v1 rank the reading path by PageRank alone and say so, or should this spec include computing git churn (deeper clone + a 180-day window)? — my default: PageRank only in v1, tie-break by path; hotness becomes a Non-goal and a later spec.
- **Q3** What should "Share link" do given there is no auth? — my default: copy the tour URL (with `#section` when one is active) to the clipboard, with copy that says it works only where this DevDigest instance runs. No public or exported link.

Non-blocking (go to `Open questions` unless answered):
- **Q4** When Regenerate fails, should the page keep the previous LLM tour and show the failure, or fall back to the skeleton? — my default: keep the previous tour + "Last regeneration failed" status; skeleton only when no LLM tour exists.
- **Q5** Should the tour regenerate automatically when the index changes, or only on Regenerate? — my default: only on Regenerate, plus a Stale badge; the first visit to a repo with no tour shows the skeleton and a "Generate" call to action.
- **Q6** Where does "Open" go? — my default: the file on the repo host at the default branch, new tab (pending R3); hidden when no host URL exists.
- **Q7** Should Regenerate confirm before a paid call? — my default: no confirm; the button's hint shows the model name.
- **Q8** Should collapsed/expanded state persist? — my default: all expanded on load, nothing persisted; a TOC click expands a collapsed target.
- **Q9** Which LLM timeout and client poll timeout? — my default: 60 s LLM (the `INTENT_TIMEOUT_MS` precedent) and 90 s client give-up.
- **Q10** Is the architecture diagram built from structured nodes/edges (grounded), or is free mermaid from the model acceptable? — my default: structured nodes/edges, filtered, rendered via `MermaidDiagram`.
- **Q11** Should first tasks be allowed to point at a file that does not exist yet (e.g. "add tests" → a new test file)? — my default: no; the target must be an existing file or directory, and a new file is described in the task text only.

Reply with answers, or "accept defaults", or per-finding keep/drop (F1 keep, F4 drop).

Self-check: all 9 items pass. No file was created or edited. The Insights line names server, client and root (root because the feature is cross-module). There is one findings table with evidence on every row, high first, exactly 10 high, and 26 findings with the 3 lows collapsed into one row. F2, F13 and F16 carry `pending R<n>`. There are 4 independent research requests. Supersedes is `—`. There are 3 blocking questions, each with a default. Unverified items are marked (which languages ast-grep indexes, whether a host URL exists).

Relevant paths:
- /Users/harlock/Downloads/Sites/devdigest/server/src/modules/repo-intel/service.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/modules/repo-intel/pipeline/rank.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/db/schema/context.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/vendor/shared/contracts/knowledge.ts
- /Users/harlock/Downloads/Sites/devdigest/client/src/vendor/shared/contracts/knowledge.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/prompts/onboarding.system.md
- /Users/harlock/Downloads/Sites/devdigest/client/messages/en/onboarding.json
- /Users/harlock/Downloads/Sites/devdigest/client/src/components/app-shell/helpers.ts
- /Users/harlock/Downloads/Sites/devdigest/client/src/vendor/ui/nav.ts
- /Users/harlock/Downloads/Sites/devdigest/client/src/components/mermaid-diagram/MermaidDiagram.tsx
- Target spec path (not yet written): /Users/harlock/Downloads/Sites/devdigest/specs/05-onboarding-tour.md

---

## Hand-back 2

I wrote the draft spec: `/Users/harlock/Downloads/Sites/devdigest/specs/05-onboarding-tour.md`, SPEC-05, `Status: draft`, `Supersedes: —`. I have not run the lint (I have no shell); please run it with the command at the end.

**Item counts:** 5 user stories (US-1…5), 33 acceptance criteria (AC-1…33), 23 edge cases (EC-1…23), 13 non-functional requirements (NFR-1…13), 10 untrusted-input items (UI-1…10) and 7 open questions (Q-1…7).

**How your answers landed:**
- **Approach C** is in Goals. Approaches A, B and D are recorded as rejected Non-goals.
- **Q1 (typed contract):** Goals name the five section kinds `architecture`, `critical_paths`, `run_locally`, `reading_path`, `first_tasks`. NFR-11 covers both vendor copies and old stored documents that lack the new meta fields. NFR-7 keeps the existing `onboarding.json` keys intact.
- **Q2 (ranking mode):**
  - The toggle and the days input (default 180) are AC-23 and AC-24; the disk-growth warning is AC-25.
  - The `pagerank × (1 + hotness)` ordering with a path tie-break is AC-26; "Active recently" is AC-27; mode and window are stored in the tour meta (AC-28) and shown on the page (AC-18).
  - Global `file_rank` is left untouched in both modes (NFR-4, plus a Non-goal).
  - With no local clone, the activity option is disabled with a reason (EC-8). If the history fetch fails, the tour falls back to import-graph ranking and says so (EC-9).
  - An out-of-range window returns 422 (EC-10). The window reaches git only as a validated integer argument (UI-8).
- **Q3:** Share link is removed and recorded as a Non-goal.
- **Timeouts:** the model call aborts after 120 s (NFR-2). The history fetch has a 60 s budget (EC-9). The client stops polling at 200 s (EC-5), which exceeds the 180 s server budget; this 200 s value is my assumption and is Q-2.
- **Your exact requirement** (clicking an "On this page" item scrolls to the block and highlights the item) is AC-11, word for word.
- **R1:** the route is `/repos/:repoId/onboarding-tour`, and the sidebar item is not active on `/onboarding` (AC-1, AC-2). The facts collector is described as written from scratch.
- **R2:** Stale compares the stored index SHA with the current one; an empty SHA shows "No index yet" (EC-11). The file count is shown as "~N files". The Stale badge also fires on docs-only commits (Q-4).
- **R3:** Open goes to GitHub via `githubBlobUrl`, pinned to the SHA the tour was built from (AC-31, UI-4).
- **R4:** the menu is a labelled `nav` with exactly one `aria-current="true"` link (NFR-9). Scroll-follow, expanding a collapsed section, focus plus URL hash, and deep links are AC-12…15. Reduced motion is NFR-10.
- **Q4–Q11 defaults:** EC-3, "Generate only, no auto-regeneration" (Non-goal), AC-31, AC-29 and AC-16, and the structured diagram (AC-5, EC-20). The existing-file-or-directory rule for first tasks is EC-14.

**Open questions left** (each has a default):
- Q-1: prompt budget of 24 000 tokens.
- Q-2: 60 s history fetch + 120 s model call, client gives up at 200 s.
- Q-3: activity window bounds of 7–730 days.
- Q-4: Stale badge over-reports on docs-only commits.
- Q-5: 0.5 hotness threshold for "Active recently".
- Q-6: prose language follows the UI locale.
- Q-7: fetched history stays in the clone after generation.

Self-check: all 12 items pass. I changed two items during the check: AC-2 no longer uses a second bare "shall", and NFR-10 now uses the plain "The system (shall)" form. A search for the banned vague words found none. I found no other spec numbered 05 or higher before writing.

Run: node .claude/skills/spec-authoring/scripts/lint-spec.mjs specs/05-onboarding-tour.md