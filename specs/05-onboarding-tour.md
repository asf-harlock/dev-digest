# Spec: Onboarding Tour
Spec ID: SPEC-05
Status: approved
Supersedes: —

## Проблема й користувач

A developer who has just connected an unfamiliar repository to DevDigest (a new
team member, a reviewer picking up a foreign codebase) has no single place that
tells them how the repo is built, which files matter, how to run it, what to
read first and what a safe first change looks like. Today they read the README,
guess entry points and ask colleagues.

Most of the parts are staged in the repo but have no caller. There is an
`onboarding` table (`server/src/db/schema/context.ts:120-126`), a generic
`Onboarding` contract (`server/src/vendor/shared/contracts/knowledge.ts:28-47`,
client copy identical), a prompt (`server/src/prompts/onboarding.system.md`),
an `onboarding` feature model (`contracts/platform.ts:46-51`),
`repoIntel.getTopFilesByRank`/`getCriticalPaths`
(`server/src/modules/repo-intel/service.ts:639-702`), an unused
`HOTNESS_WINDOW_DAYS = 180` (`repo-intel/constants.ts:50`) and the
`MermaidDiagram` component (`client/src/components/mermaid-diagram/`). Missing:
a facts collector (stack, scripts, services, manifests), researcher R1 found no
prior implementation on any branch. Also missing: a contract that fits the
design, the route, the page and its entry point. The staged contract, prompt
and i18n copy describe a different set of sections from the mockup.

Two constraints shape the feature. First, the index is often degraded: the
seeded `acme/payments-api` has `clonePath: null` and is always degraded
(`server/INSIGHTS.md`, 2026-09-26). Second, `file_rank.hotness` is always 0
because clones are shallow (`repo-intel/pipeline/rank.ts:4-7`,
`repos/constants.ts:9`). So the tour must say honestly when it is a
deterministic skeleton rather than model output. It must also let the user opt
in to activity-based ranking, which needs clone history.

## Goals / Non-goals

**Goals**
- A per-repo **Onboarding Tour** page at `/repos/:repoId/onboarding-tour`,
  reached from a new WORKSPACE sidebar item between Pull Requests and Project
  Context. It has five sections in fixed order:
  `architecture`, `critical_paths`, `run_locally`, `reading_path`,
  `first_tasks`.
- A typed tour contract with exactly those five section kinds and per-kind item
  shapes. It replaces the staged generic `Onboarding` contract in both
  `@devdigest/shared` copies. The prompt's section list and the tour copy in
  `client/messages/en/onboarding.json` are rewritten to match.
- A deterministic skeleton of all five sections is built from index facts
  (rank, import graph, manifests, scripts, compose services, routes).
  One structured model call then enriches the skeleton. A grounding merge keeps
  only paths and commands that exist in those facts.
- The tour is persisted per repo with honest meta: source (`llm` or
  `skeleton`), degraded reason, index SHA, ranking mode, activity window, model,
  generation time and last error.
- A user-chosen ranking mode. **Import graph only** is the default.
  **Include recent activity** computes per-file commit hotness over a chosen
  window, for this tour only.
- An "On this page" menu. Clicking an item scrolls to its section and marks
  the item active. The active item also follows scrolling.

**Non-goals**
- Not doing a **Share link** button. Sharing will come later through an
  artifact/share surface and is out of scope here.
- Not changing the globally stored `file_rank.rank` or `file_rank.hotness`.
  Blast radius, conventions sampling and `getRepoMap` keep their current
  ordering in both ranking modes.
- Not regenerating the tour automatically when the index changes. The page
  shows a Stale badge and the user clicks Regenerate.
- Not executing any command. "How to run locally" only offers copy to
  clipboard.
- Not an in-app source-file viewer. "Open" links to the file on GitHub.
- Not persisting which sections are collapsed.
- Not editing the tour by hand.
- Not doing on-demand generation without persistence. Considered and rejected
  because every visit would pay for a 10-120 s model call, and Regenerate would
  mean nothing.
- Not reusing the staged generic markdown contract as-is. Considered and
  rejected because it cannot carry the typed rows the design needs (Open,
  copy, complexity, why-read). Without them, path grounding and the command
  allowlist cannot be enforced.
- Not moving prompt assembly and grounding into `reviewer-core`. Considered and
  rejected for now because no CI or MCP consumer needs the tour yet.

## User stories

- **US-1** As a developer new to a repository, I want one page with an architecture overview, critical paths, run commands, a reading order and first tasks, so that I can find my way around the codebase on day one.
- **US-2** As a reader of the tour, I want an "On this page" menu that scrolls to a section and marks where I am, so that I can move between the five sections of a long page.
- **US-3** As a developer relying on the tour, I want to see whether the content was written by the model or is a deterministic skeleton, and whether it is stale, so that I know how far to trust it.
- **US-4** As a developer, I want to generate or regenerate the tour and choose whether files are ranked by the import graph alone or also by recent activity, so that the reading order matches how the repo is actually worked on.
- **US-5** As a developer, I want to copy a run command and open a referenced file in one click, so that I can act on the tour without retyping paths.

## Acceptance criteria (EARS)

- **AC-1** (US-1) The system (shall) show an **Onboarding Tour** item in the sidebar WORKSPACE group between Pull Requests and Project Context that links to `/repos/:repoId/onboarding-tour` for the active repo.
- **AC-2** (US-1) КОЛИ the current route is `/repos/:repoId/onboarding-tour`, the system (shall) mark the Onboarding Tour sidebar item active, leaving it inactive on `/onboarding` (Add repository).
- **AC-3** (US-1) КОЛИ the user opens the tour page for a repo that has a stored tour, the system (shall) render the five sections in the order Architecture overview, Critical paths, How to run locally, Guided reading path, First tasks.
- **AC-4** (US-1, US-4) КОЛИ the user opens the tour page for a repo with no stored tour, the system (shall) render the deterministic skeleton of all five sections together with a **Generate** button in the page header.
- **AC-5** (US-1) КОЛИ the Architecture overview section renders, the system (shall) show its prose with file and directory references as inline code chips and, when at least one grounded edge exists, a node diagram built from the section's structured nodes and edges.
- **AC-6** (US-1, US-5) КОЛИ the Critical paths section renders, the system (shall) show one row per critical file with its repo-relative path, a one-line description and an **Open** button.
- **AC-7** (US-1, US-5) КОЛИ the How to run locally section renders, the system (shall) show the commands as a numbered list of monospace rows, each with a labelled copy-to-clipboard button.
- **AC-8** (US-1) КОЛИ the Guided reading path section renders, the system (shall) show a numbered list of at most 5 file paths, each with a one-line reason to read it.
- **AC-9** (US-1) КОЛИ the First tasks section renders, the system (shall) show at most 3 task cards, each with a title, a target path and a complexity label rendered as text (`Low`, `Medium`, `High`) marked as a suggestion.
- **AC-10** (US-1) ДЕ the tour was generated in **Import graph only** mode, the system (shall) order the reading path and the critical-path roots by stored `file_rank.rank` descending, breaking ties by path ascending.
- **AC-11** (US-2) КОЛИ the user clicks an item in the "On this page" menu, the system (shall) scroll to the corresponding section and mark that menu item as active (click on a menu item under "On this page" scrolls to the matching block and highlights the item).
- **AC-12** (US-2) ПОКИ the user scrolls the page, the system (shall) mark as active the menu item of the section whose heading is inside the top band of the viewport.
- **AC-13** (US-2) КОЛИ the user clicks a menu item whose section is collapsed, the system (shall) expand that section before scrolling to it.
- **AC-14** (US-2) КОЛИ the user clicks a menu item, the system (shall) move keyboard focus to the target section heading and set the URL hash to that section's id.
- **AC-15** (US-2) КОЛИ the tour page loads with a URL hash that names a section, the system (shall) scroll to that section and mark its menu item active.
- **AC-16** (US-1) КОЛИ the user activates a section header's toggle, the system (shall) collapse or expand that section and reflect the state in the toggle's `aria-expanded`, with every section expanded on first load.
- **AC-17** (US-3) The system (shall) show a status badge in the page header reading "Written by <model>" when the tour source is `llm` and "Skeleton — <reason>" when the source is `skeleton`.
- **AC-18** (US-3) The system (shall) show under the title the approximate indexed file count as "~N files", the time since the tour was generated, and the ranking label "Ranked by import graph" or "Ranked by import graph + activity, last N days".
- **AC-19** (US-3) КОЛИ the stored tour's `index_sha` differs from the repo's current non-empty `lastIndexedSha`, the system (shall) show a **Stale** badge stating the index changed since generation.
- **AC-20** (US-4) КОЛИ the user clicks **Generate** or **Regenerate**, the system (shall) accept the request with the chosen ranking mode and window and respond with `status: "running"` without waiting for the model call to finish.
- **AC-21** (US-4) ПОКИ a generation for the repo is running, the system (shall) show a "Generating…" progress state on the button and keep it disabled until the stored tour's generation time changes.
- **AC-22** (US-4) КОЛИ a new generation finishes, the system (shall) replace the displayed tour with the new one without a page reload.
- **AC-23** (US-4) The system (shall) show, next to Generate/Regenerate, a ranking-mode toggle with the options "Import graph only" (default) and "Include recent activity (hotness)".
- **AC-24** (US-4) КОЛИ the user selects "Include recent activity (hotness)", the system (shall) show an integer days input prefilled with 180.
- **AC-25** (US-4) КОЛИ the user selects "Include recent activity (hotness)", the system (shall) show a visible warning that the local clone will grow on disk as history for the window is fetched and that the first generation can take longer on large repos.
- **AC-26** (US-4) ДЕ the generation runs in **Include recent activity** mode, the system (shall) order the tour's reading path and critical-path roots by `pagerank × (1 + hotness)`, where hotness is the file's commit count in the window divided by the highest commit count of any indexed file in that window, with ties broken by path ascending.
- **AC-27** (US-4) ДЕ the tour was generated in **Include recent activity** mode, the system (shall) mark with an "Active recently" label every listed file whose normalised hotness is at least 0.5.
- **AC-28** (US-3, US-4) КОЛИ a generation finishes, the system (shall) store with the tour its source, degraded reason, index SHA, ranking mode, window days, model, generation time and last error.
- **AC-29** (US-4) The system (shall) show on the Regenerate button's hint the provider and model the generation will use.
- **AC-30** (US-5) КОЛИ the user clicks a command's copy button, the system (shall) write that exact command text to the clipboard and announce "Copied" through an `aria-live` region.
- **AC-31** (US-5) КОЛИ the user clicks **Open** on a file, the system (shall) open the file on GitHub at the tour's `index_sha` (the default branch when that SHA is empty) in a new tab with `rel="noopener noreferrer"`.
- **AC-32** (US-1, US-3) The system (shall) show only file and directory paths that exist in the repo's index in every section, chip, diagram node and task target of the tour.
- **AC-33** (US-1, US-5) The system (shall) show in How to run locally only commands derived from the collected facts: the detected package manager's install command, scripts declared in a manifest, a copy of an `.env.example` that exists, and services declared in a compose file.

## Edge cases

- **EC-1** ЯКЩО the repo's index state is `degraded` or `failed`, or has reason `no_data`, `flag_off`, `index_failed` or `repo_too_large`, ТОДІ the system (shall) produce the skeleton without a model call and show the reason in the status badge.
- **EC-2** ЯКЩО the model call fails, times out or returns output that fails schema validation and the repo has no stored `llm` tour, ТОДІ the system (shall) store and show the skeleton with source `skeleton` and the failure recorded as last error.
- **EC-3** ЯКЩО a regeneration fails while the repo already has a stored `llm` tour, ТОДІ the system (shall) keep showing the previous tour with a "Last regeneration failed · <time>" notice.
- **EC-4** ЯКЩО a generate request arrives while a generation for the same repo is running, ТОДІ the system (shall) reject it with `409` and start no second generation.
- **EC-5** ЯКЩО the client has polled for 200 s without the generation time changing, ТОДІ the system (shall) stop polling and show "Generation is taking longer than expected" with a Retry button.
- **EC-6** ЯКЩО a poll request fails, ТОДІ the system (shall) stop polling and show a Retry button, relying on the global error toast instead of adding a second toast.
- **EC-7** ЯКЩО no provider key is configured for the onboarding feature model, ТОДІ the system (shall) show the skeleton with the reason "Model not configured" and a link to Settings → Feature Models.
- **EC-8** ЯКЩО the repo has no local clone (`clone_path` is null), ТОДІ the system (shall) disable the "Include recent activity" option and show the reason "No local clone — activity ranking unavailable".
- **EC-9** ЯКЩО fetching or reading history for the window fails or exceeds its 60 s budget, ТОДІ the system (shall) rank by import graph only and state "Activity ranking unavailable — ranked by import graph" in the tour status.
- **EC-10** ЯКЩО the window days value is not an integer between 7 and 730 inclusive, ТОДІ the system (shall) reject the generate request with `422` and error code `validation_error`.
- **EC-11** ЯКЩО the repo's `lastIndexedSha` is empty, ТОДІ the system (shall) show "No index yet" instead of a Stale badge.
- **EC-12** ЯКЩО the model output names a file or directory path that is not in the index, ТОДІ the system (shall) drop the item that carries it and record the number of dropped items in the tour meta.
- **EC-13** ЯКЩО the model output contains a run command that is not in the collected facts, ТОДІ the system (shall) discard that command and keep the facts-derived command list.
- **EC-14** ЯКЩО a first task's target is neither an indexed file nor an indexed directory, ТОДІ the system (shall) drop that task.
- **EC-15** ЯКЩО a section has no items after grounding (no import graph, no manifest scripts, no tasks), ТОДІ the system (shall) show that section with an empty-state message naming the missing fact.
- **EC-16** ЯКЩО the repo has manifests in more than one top-level package directory and none at the root, ТОДІ the system (shall) group run commands per package, each group prefixed with `cd <package-dir>`.
- **EC-17** ЯКЩО the collected facts exceed the prompt input budget, ТОДІ the system (shall) truncate them in rank order and record the truncation in the tour meta.
- **EC-18** ЯКЩО the clipboard write is denied or unavailable, ТОДІ the system (shall) announce "Copy failed" through the `aria-live` region.
- **EC-19** ЯКЩО the `repoId` in the URL does not match a repo in the workspace, ТОДІ the system (shall) render the existing `RepoNotFound` state.
- **EC-20** ЯКЩО a diagram node from the model matches neither an indexed path or directory nor a detected compose service, ТОДІ the system (shall) drop the node and its edges and render the section as text only when no edge remains.
- **EC-21** ЯКЩО a top-ranked file is a test, config, declaration, migration or fixture path, ТОДІ the system (shall) exclude it from critical-path roots and the reading path.
- **EC-22** ЯКЩО the API restarts while a generation is running, ТОДІ the system (shall) report the repo as not generating on the next read, so Regenerate is enabled again.
- **EC-23** ЯКЩО the model output text contains raw HTML, ТОДІ the system (shall) render it as literal text.

## Non-functional requirements

- **NFR-1** The system (shall) make at most one model call per generation and zero model calls when the tour page is read.
- **NFR-2** The system (shall) abort the model call after 120 s.
- **NFR-3** The system (shall) produce an identical skeleton, reading path and critical-path list for the same index SHA, ranking mode and window.
- **NFR-4** The system (shall) leave `file_rank.rank` and `file_rank.hotness` unchanged by any tour generation in either ranking mode.
- **NFR-5** The system (shall) scope every tour read and write to the caller's workspace through `getContext()` and a join on `repos.workspace_id`.
- **NFR-6** The system (shall) limit the model prompt input to 24 000 tokens.
- **NFR-7** The system (shall) serve every new user-facing string from `client/messages/<locale>/onboarding.json`, keeping the existing keys of that namespace intact.
- **NFR-8** The system (shall) meet WCAG 2.1 AA on the tour page: every control keyboard-operable with visible focus, targets at least 24×24 px, complexity and status conveyed by text and not by colour alone.
- **NFR-9** The system (shall) render the "On this page" menu as a `nav` labelled "On this page" in which exactly one link carries `aria-current="true"`.
- **NFR-10** The system (shall) jump to the target section without smooth scrolling whenever the user's system reports `prefers-reduced-motion: reduce`.
- **NFR-11** The system (shall) define the tour document as one contract present in both `@devdigest/shared` copies, with every persisted meta field readable when absent from an older stored document.
- **NFR-12** The system (shall) log for each generation the repo id, ranking mode, window, duration, model, token usage, dropped-item count and outcome, and never the prompt text or repo file contents.
- **NFR-13** The system (shall) render the tour page, including the skeleton path, with no model call so that an e2e flow over the seeded `acme/payments-api` can assert the skeleton, the status badge and the "On this page" menu.

## Inputs and provenance

| Value | Source | Trusted? | Design source |
|---|---|---|---|
| Repo name in title and crumb | `repos.full_name` | yes | mockup header; `ContextPageView.tsx` crumb |
| Index status, degraded reason, `lastIndexedSha`, `filesIndexed` | `repoIntel.getIndexState` / `GET /repos/:id/index-state` | yes; `filesIndexed` approximate after incremental runs (researcher R2) | mockup subtitle; `repo-intel/types.ts:25-50` |
| File rank (PageRank) | `file_rank.rank` | yes | user text; `pipeline/rank.ts` |
| Import edges | `file_edges` | yes | `repo-intel/service.ts:663-702` |
| Per-file commit count in window | git history of the local clone, fetched at generation time through the git adapter | yes, derived from repo history | user decision Q2 |
| Routes / endpoints | `file_facts` endpoints (`extractEndpoints`) | derived from repo content — untrusted text | `pipeline/full.ts:186` |
| Stack, package manager, scripts, compose services, `.env.example` key names, top-level dirs | new deterministic facts collector over repo files (no prior implementation, researcher R1) | untrusted (repo content) | user text; mockup card 3 |
| Prose, descriptions, why-read lines, task titles, complexity, diagram nodes/edges | model output via `completeStructured` | untrusted until validated and grounded | mockup cards 1-5 |
| Model and provider | `feature_models['onboarding']` override, else `FEATURE_MODELS` default | yes | `contracts/platform.ts:46-51` |
| Provider API key | `LocalSecretsProvider` via `container.secrets` | yes (secret, never shown) | `server/CLAUDE.md` |
| Ranking mode and window days | user input on the page | untrusted input, validated | user decision Q2 |
| Stored tour + meta | `onboarding.json`, `onboarding.generated_at` | yes (validated on write) | `db/schema/context.ts:120-126` |
| Open link target | `githubBlobUrl(full_name, index_sha, path)` | built from trusted parts + grounded path | researcher R3; `client/src/lib/github-urls.ts:24` |
| Default activity window 180 days | `HOTNESS_WINDOW_DAYS` | yes (config constant) | `repo-intel/constants.ts:50` |

Stale detection compares the stored `index_sha` with the current
`lastIndexedSha`. The SHA also moves on docs-only commits, so the Stale badge
over-reports in v1 (researcher R2).

## Untrusted inputs

- **UI-1** README, manifest, script and file-name text from the repo → model prompt: the system (shall) wrap every repo-derived block with `wrapUntrusted()` and instruct the model to treat it as data.
- **UI-2** `.env.example` and other repo text → model prompt and logs: the system (shall) pass only `.env.example` key names, apply `redactSecrets` to all repo text before the call, and never read `.env`.
- **UI-3** Model output → stored tour: the system (shall) validate the output against the tour output schema and discard it entirely on validation failure.
- **UI-4** Model-named paths → Open link URL: the system (shall) build the URL only for index-validated paths through `githubBlobUrl`, with each path segment URL-encoded.
- **UI-5** Model prose → rendered Markdown: the system (shall) render through the existing `Markdown` component with raw HTML disabled.
- **UI-6** Model diagram nodes and labels → Mermaid render: the system (shall) build the diagram source from grounded structured nodes with quoted, escaped labels and render it with `securityLevel: "strict"`.
- **UI-7** Repo scripts and commands → clipboard: the system (shall) never execute a command and take command text only from the collected facts.
- **UI-8** User-entered window days → git history arguments: the system (shall) accept only a validated integer and pass it to the git adapter as an argv element, never through a shell string.
- **UI-9** Repo-relative paths read by the facts collector → server file reads: the system (shall) reject `..` segments, absolute paths and symlinks that resolve outside the clone.
- **UI-10** Instructions embedded in repo content or model output → tour content: the system (shall) not follow them and render any such text only as quoted data.

## Open questions

- **Q-1** Is 24 000 tokens the right prompt input budget? — default: 24 000 tokens (NFR-6) — owner: implementation-planner.
- **Q-2** Is 60 s for the history fetch plus 120 s for the model call, with the client giving up at 200 s, the right budget? — default: yes; 200 s client give-up is an assumption that exceeds the 180 s server budget — owner: user.
- **Q-3** Are 7-730 days the right bounds for the activity window? — default: 7 to 730 inclusive (EC-10) — owner: user.
- **Q-4** Is a Stale badge that also fires on docs-only commits acceptable in v1? — default: yes, documented in Inputs and provenance — owner: user.
- **Q-5** Is a normalised hotness of 0.5 the right threshold for the "Active recently" label? — default: 0.5 (AC-27) — owner: user.
- **Q-6** Which language is the model's prose written in? — default: the UI locale, passed as `{{language}}` — owner: user.
- **Q-7** Does the deepened clone history stay after generation or get re-shallowed? — default: it stays; the warning in AC-25 covers disk growth — owner: implementation-planner.
