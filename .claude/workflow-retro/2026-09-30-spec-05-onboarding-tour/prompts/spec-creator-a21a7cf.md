Phase 1 (intake report ONLY — write NOTHING to disk). Feature: **Onboarding Generator** in DevDigest (repo: /Users/harlock/Downloads/Sites/devdigest, branch L05-lab). Follow your two-phase flow: intake report with design gaps, uncovered corner cases, cross-module interactions, UX improvements, approach options (compare + recommend, user decides), numbered questions, and research requests for me to fan out to `researcher` agents. Read the relevant module CLAUDE.md / INSIGHTS.md files first and say in one line what you read.

## User's request (translated from Ukrainian)
The feature produces a tour of an unfamiliar repository made of five parts: architecture overview, critical paths, local run, recommended file reading order, and first tasks. It will be taken through the whole SDD pipeline (spec → plan → implement → verify …), with each stage's result committed separately. Right now we are at the spec stage — we need to gather all the information required.

Interaction requirement: clicking an item in the "On this page" menu scrolls to the corresponding block and highlights (marks as active) that menu item.

## Additional information from the user
- `repoIntel.*` deterministically collects the stack, structure, routes and scripts.
- The Reading path is computed from the import graph, e.g. PageRank × (1 + hotness).
- One structured LLM call turns the facts into the five sections.
- If the index is degraded or the LLM call fails, show a deterministic **skeleton** with an honest status (no pretending it's an LLM result).

## Design source
Screenshot mockup (dark UI), please Read the image file: /var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/7A7AC49F-4C79-457E-B797-6FAB0DA8677A-10131-000000184F1FABF4/pasted-image-20260930-100500.png

What it shows (my description, in case you can't read it):
- Breadcrumb/topbar: `acme/payments-api › Onboarding Tour`; search "Search to jump to… ⌘K", refresh, bell, avatar.
- Left sidebar (existing app nav): repo switcher (`acme/payments-api`, "main · synced 2m ago"); WORKSPACE: Pull Requests (badge 7), **Onboarding Tour** (active, new nav item), Project Context; SKILLS LAB: Skills, Agents, Conventions, Eval Dashboard; GLOBAL: Memory, Multi-Agent Review, Agent Performance, CI Runs.
- Page: left sticky "ON THIS PAGE" menu with 5 anchors (Architecture overview [active, left accent bar], Critical paths, How to run locally, Guided reading path, First tasks). Main column title "Onboarding for `payments-api`" with buttons **Regenerate** and **Share link**; subtitle "Generated from index of 12,450 files · last refreshed 2h ago".
- Five collapsible cards (chevron at right), each with icon + title:
  1. Architecture overview — prose paragraph with inline code chips (`src/server.ts`, `src/api/*`, `db`) + a small node diagram (client → server.ts → middleware → redis / api/public/* → postgres).
  2. Critical paths — rows: file path + em-dash description + "Open" button (e.g. `src/server.ts — App bootstrap + middleware chain`, `src/middleware/auth.ts — Token validation, used by 14 routes`).
  3. How to run locally — numbered command rows in monospace, each with a copy-to-clipboard icon (pnpm install / cp .env.example .env / docker compose up -d postgres redis / pnpm dev).
  4. Guided reading path — numbered list (1..3) of file paths with a one-line "why read it".
  5. First tasks — 3 cards: title, file path, complexity badge (Low / Medium / Low complexity, colour-coded).

## Things to investigate in the codebase (you have Read/Grep/Glob)
- Does `repoIntel` / repo-intel exist in server/ (kebab-case `repo-intel/`)? What does it expose today (stack, structure, routes, scripts, import graph, hotness)? What's missing for PageRank × (1 + hotness)?
- How existing features do one structured LLM call with Zod-validated output and grounded findings (reviewer-core, model-router), how "degraded" index states are represented, and how a deterministic fallback/status is surfaced elsewhere.
- Existing client nav (sidebar), the Project Context page (recently built on this branch) as the closest UI/module analogue, existing collapsible-card / code-row / copy components, i18n namespace conventions (`client/messages/en/*.json`), and whether an "On this page" scroll-spy component exists.
- Whether `specs/` already has SPEC-NN numbering and what number is next; whether this is cross-module (`specs/NN-*.md`) — it likely is (server + client + possibly reviewer-core + vendored shared contract in BOTH copies).
- Persistence: should the tour be stored (DB table? schema tables exist for every lesson) or computed on demand; caching/invalidation on index refresh; what "Regenerate" and "Share link" mean given there is no auth (LocalNoAuthProvider) — flag this.

## Points I expect you to probe (don't assume answers)
- Scroll-spy behaviour: click → smooth scroll + active highlight; also highlight-on-scroll? collapsed cards as scroll targets (expand on click?), URL hash, keyboard/a11y (aria-current), reduced motion, mobile behaviour of the sticky menu.
- Honest-status states: loading, no index yet, index degraded, LLM failed, partial sections, stale index, empty repo, monorepo, non-JS/TS repos, huge repos, cancelled regeneration.
- Untrusted inputs: repo content (README, scripts, file names) flowing into the LLM prompt (prompt injection), commands rendered in "How to run locally" with a copy button (must never auto-run; flag suspicious commands?), "Open" button targets/path traversal, Share link exposure of local data.
- Grounding: every file path in the LLM output must exist in the index (drop/flag hallucinated paths); the diagram — LLM-generated vs deterministic (Mermaid? structured nodes/edges?).
- Reading-path determinism, tie-breaking, how "hotness" is defined (git churn window?), and cost/latency/timeouts of the single LLM call.

Return the Phase-1 intake report with numbered questions for me. Do not write any spec file yet.

---
## Resume 1

Phase 2: user answers + research results are in — write specs/05-onboarding-tour.md as Status: draft (SPEC-05), then return a short summary of what you wrote (path, item-ID counts, remaining Open questions, lint result).

## User decisions
- **Approach: C** (deterministic typed 5-section skeleton + one `completeStructured` enrichment call + grounding merge + persisted in `onboarding` table with source/status/index-SHA meta + fire-and-forget generate & poll, 409 on concurrent run).
- **Q1: yes** — new typed contract with exactly the 5 mockup sections (architecture, critical_paths, run_locally, reading_path, first_tasks), in BOTH vendor copies (client copy `.optional()` vs server `.default()`, `.nullish()` for persisted jsonb); rewrite the staged generic `Onboarding` contract, `onboarding.system.md` section list and `client/messages/en/onboarding.json` copy to match (note `onboarding.json` namespace is also used by the Add-repository screen at `/onboarding` — keep those keys intact).
- **Q2: user-selected hotness mode (NEW requirement).** Before generating (Generate / Regenerate), the user picks a ranking mode via a toggle:
  - **Mode A "Import graph only"** — reading path / critical paths ranked by stored `file_rank.rank` (PageRank; hotness = 0), tie-break by path ascending. Default.
  - **Mode B′ "Include recent activity (hotness)"** — at generation time the server deepens the existing clone's history for the window (e.g. `git fetch --shallow-since=<window>`), counts commits touching each indexed file (`git log --since … --name-only`), normalises to 0..1, and orders the tour's reading path / critical paths by `pagerank × (1 + hotness)`. It must NOT change the globally stored `file_rank.rank`/`hotness` (blast radius, conventions, getRepoMap keep current behaviour). Files can be marked "active recently".
  - **Window:** a numeric days input shown when B′ is selected, default = `HOTNESS_WINDOW_DAYS` (180, `server/src/modules/repo-intel/constants.ts:50`, currently unused). Define sane bounds and a 422 for out-of-range values (you propose bounds, mark as default).
  - **Warning:** when B′ is selected, show a visible warning that the local clone will grow on disk (history for the window is fetched) and the first generation can take longer on large repos.
  - Honest degradation: repo without a clone (e.g. seeded `acme/payments-api`, `clonePath: null`) → B′ unavailable/disabled with the reason; history fetch failure → fall back to Mode A ordering and say so in the tour status (never silently). Persist the mode + window used in the tour meta and show it on the page ("Ranked by import graph" / "Ranked by import graph + activity, last N days").
  - Git commands go through the existing git adapter (command-injection lens: window is an integer, never interpolated from free text).
- **Q3: "Share link" button is REMOVED** from this spec. Record as Non-goal: sharing will later be done via an artifact/share surface, out of scope.
- **Q4–Q11: accept your defaults**, EXCEPT **Q9: LLM call timeout = 120 s** (not 60 s). The client poll give-up must exceed the server budget (history fetch + LLM) — propose a value (e.g. 150 s) and mark it as an assumption.

## Research results
- **R1 (git history):** no prior onboarding-tour implementation on any branch. Only the staged pieces from the initial squashed snapshot 587c46a (prompt, contract, table, `getCriticalPaths`/`getTopFilesByRank`, whose only callers are blast (be11a29) and conventions (b77650c)). The facts collector (stack/scripts/services/manifests) must be written fresh. No tour route path ever existed → use `/repos/:repoId/onboarding-tour`, matched precisely in `activeKeyFor` so `/onboarding` (Add repository) doesn't highlight it; add the WORKSPACE nav entry between Pull Requests and Project Context.
- **R2 (indexing):** indexing never runs automatically — only on clone (INDEX), manual refresh (CLONE+REFRESH), manual `POST /repos/:id/resync` (RESYNC). Polling doesn't index. `lastIndexedSha` changes only when HEAD moves; `updatedAt` bumps on every successful resync (liveness, not a change signal). Stale = tour's stored `index_sha` ≠ `getIndexState(repoId).lastIndexedSha`; empty `''` SHA = "no index", not stale. SHA also advances on docs-only commits → stale over-reports (acceptable v1, note it). `filesIndexed` is approximate after incremental runs (re-parsed files counted again) → subtitle shows "~N files". `GET /repos/:id/index-state` exposes it; no row → synthesized degraded `no_data`. `POST /repos/:id/reindex` is mentioned in a comment (`repos/service.ts:73`) but does not exist.
- **R3 (Open target):** `Repo` DTO/table have `full_name` + `default_branch`, no host/html_url (app is GitHub-only; `GITHUB_HTTPS_HOST`). Client helper `client/src/lib/github-urls.ts:24` `githubBlobUrl(full_name, ref, path)` already exists (used by FindingCard/BlastTree). No in-app route serves arbitrary source files (`context/file` is Project-Context-only). Decision: Open = `githubBlobUrl(full_name, <tour's index_sha>, path)` — pinned to the SHA the tour was generated from (fallback default_branch when SHA empty), new tab, `rel="noopener noreferrer"`, only for index-validated paths. No contract/DB change needed for the URL itself.
- **R4 (TOC a11y):** `<nav aria-label="On this page">` with `<a href="#id">`; `aria-current="true"` on exactly one active link (remove from others; `location`/`step` are wrong tokens, not `aria-selected`); target headings get `id` + `tabindex="-1"` and `scroll-margin-top`; IntersectionObserver with a top-band rootMargin (threshold 1 fails for tall sections); on click set active immediately and ignore observer updates until `scrollend` (~100 ms stable fallback for Safari) to avoid flicker; spy-driven hash updates use `history.replaceState`, clicks use native anchor/pushState; `prefers-reduced-motion` → instant scroll. Click on a collapsed target expands it. Note: no authoritative source names aria-current for TOCs — `true` by elimination + practitioner guidance.

Also: the user's original wording "Клик по меню під 'On this page' скролит до відповідного блоку й виділяє пункт меню" must be an explicit acceptance criterion. Remove Share link from the header in the UI description (only Regenerate / Generate remains, plus the hotness toggle).