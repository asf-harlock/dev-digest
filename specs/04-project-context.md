# Spec: Project Context
Spec ID: SPEC-04
Status: approved
Supersedes: —

## Проблема й користувач

An agent author (the person who configures reviewer agents and skills in Skills
Lab) wants the reviewer to enforce the repository's own written rules —
architecture invariants, security baselines, PRDs, incident insights — that
live as markdown files in the repo. Today there is no way to put that text
into an agent's prompt: `reviewer-core` already renders a `## Project context`
slot from `ReviewInput.specs` (`reviewer-core/src/prompt.ts:116-118,144`), but
the server never fills it (`server/src/modules/reviews/run-executor.ts:217-255`
passes no `specs`, and hard-codes `specs_read: []` at `:344`), and the
`GET /repos/:id/context` route the client already calls
(`client/src/lib/hooks/core.ts:122-137`) has no server implementation
(`server/INSIGHTS.md`, 2026-09-23; researcher R1: no prior implementation in
any branch). The author therefore copies rules into system prompts by hand,
where they go stale against the repo and cannot be traced back to a document.

The feature is small on purpose: it shows whether a spec attached to an agent
changes what the reviewer reports. Documents are chosen manually; the
PR-content-based auto-selector is a separate feature.

## Goals / Non-goals

**Goals**
- A per-repo **Project Context** page that lists every markdown document under
  the configured roots, with type, token estimate, preview, "Used by N agents"
  and Rescan.
- A **Context** tab on the agent editor and a **Project context to use** tab on
  the skill editor, where the author attaches, orders and previews documents
  and sees the token cost.
- Attachments are stored as repo-relative paths (never text) on the agent and
  on the skill; an agent inherits the documents of its enabled skills.
- At run start the server reads the attached files from the PR's repo clone at
  the default branch and injects them as delimited, untrusted blocks in
  `## Project context`, with zero extra LLM calls.
- The run trace lists every attached document with its tokens and stores the
  exact text sent, openable from the trace drawer's
  "Project context · attached specs" section.

**Non-goals**
- Automatic document selection by PR content — a separate future feature.
- Creating, uploading or editing documents from the UI (the design's `+`,
  folder, upload and Edit controls). Not doing it here — considered and
  rejected because the server clone is a shallow read-only mirror that `sync`
  hard-resets (`server/src/adapters/git/simple-git.ts:77-88`), so local edits
  are wiped and never reach git or the team. The correct form — "edit/create
  docs via commit/PR" through the GitHub API — is a separate future feature.
- The chunk/embedding index ("Indexed: 12 files · 1,240 chunks") and the
  `POST /repos/:id/context/reindex` + `IndexStatus` contract — they belong to
  the auto-selector; this spec leaves both untouched.
- The "78 COVERAGE" score — no metric or data source is defined.
- Passing project context to the intent classifier: its
  `resolveProjectContextSpecs` seam (`intent-classifier.ts:73-78`) keeps
  returning `[]`, because the classifier has no agent to take attachments from.
- CI / GitHub Action runs: `run-executor.ts` is the only caller of
  `reviewPullRequest` (researcher R2) and `AgentManifest` has no specs field; a
  future runner receives `ReviewInput.specs` unchanged but resolves the files
  itself.
- The design's agent-editor Evals, Stats and CI tabs.
- Settings UI for the search roots — they are server configuration.
- Not reading documents at the PR head — considered and rejected because the PR
  author could then weaken the rules that judge the same PR.
- Not storing attachments in join tables (`agent_context_docs`,
  `skill_context_docs`) or only inside `agent_versions.config_json` —
  considered and rejected: an ordered path list on the agent and the skill is
  the smallest change and snapshots into the agent version for free.
- Not reopening trace documents via `git show <sha>:<path>` or by splitting
  `prompt_assembly.specs` — considered and rejected: the first breaks after a
  reclone or shallow fetch, the second is brittle and has no per-document
  tokens; the run record stores the text instead.
- Not reusing `POST /repos/:id/context/reindex` for Rescan — considered and
  rejected because its `IndexStatus` response describes an embedding job
  (`cloning/parsing/embedding`, `chunks_indexed`), not a file listing.

## User stories

- **US-1** As an agent author, I want to see every markdown document the repo
  holds under the configured roots, with its type and token size, so that I
  know what context is available before attaching it.
- **US-2** As an agent author, I want to attach, order and preview documents on
  an agent, so that its reviews are grounded in the rules I chose.
- **US-3** As a skill author, I want to attach documents to a skill, so that
  every agent using the skill inherits them.
- **US-4** As an agent author, I want to see how many tokens the attached
  documents add to each prompt, so that I can control cost and context size.
- **US-5** As an agent author, I want every run to read the attached files from
  the repo and add their text to the prompt as untrusted data, so that the
  reviewer applies the current documented rules without being steered by them.
- **US-6** As a developer reading a run, I want the trace to list the attached
  documents with their tokens and open the exact text sent, so that I can
  verify what the reviewer was given.

## Acceptance criteria (EARS)

### Reader and Project Context page

- **AC-1** (US-1) КОЛИ the client calls `GET /repos/:id/context`, the system
  (shall) return one `SpecFile` per `.md` file in the repo clone's working tree
  at the default branch that matches the configured globs (default
  `**/{specs,docs,insights}/**/*.md`) and lies outside the excluded directories
  `node_modules`, `.git`, `dist`, `build` and `vendor`.
- **AC-2** (US-1, US-4) The system (shall) extend `SpecFile` in both
  `@devdigest/shared` copies with nullish fields `kind`
  (`specs | docs | insights`), `tokens`, `attachable`, `unattachable_reason`
  and `injection_flagged`, keeping `path`, `content`, `size` and `updated_at`.
- **AC-3** (US-1) The system (shall) set a document's `kind` from the root
  segment (`specs`, `docs` or `insights`) nearest to the file name in its path.
- **AC-4** (US-1) КОЛИ the user opens `/repos/:repoId/context`, the system
  (shall) show the document list with, per row, the path, a `kind` chip with a
  text label, and the token estimate prefixed with `≈`.
- **AC-5** (US-1) КОЛИ the user selects a document on the Project Context page,
  the system (shall) show its rendered markdown preview together with
  "Used by N agents".
- **AC-6** (US-1) The system (shall) compute "Used by N agents" as the number
  of distinct agents in the workspace that attach the path directly or through
  a skill linked to them with the link and the skill both enabled.
- **AC-7** (US-1) The system (shall) show the Project Context page without any
  create, upload, new-folder or Edit control.
- **AC-8** (US-1) The system (shall) show in the page footer the number of
  listed files and the time of the last scan, without a chunk count.
- **AC-9** (US-1) КОЛИ the user clicks Rescan, the system (shall) call
  `POST /repos/:id/context/rescan`, which brings the clone to the latest commit
  of the default branch and returns the new `SpecFile[]` listing.
- **AC-10** (US-1) The system (shall) add a "Project Context" item to the
  sidebar WORKSPACE group linking to `/repos/:repoId/context` and mark it
  active on that route.

### Attaching on agents and skills

- **AC-11** (US-2) The system (shall) show a Context tab in the agent editor
  that lists the active repo's documents with a checkbox, path, `kind` chip,
  Preview button, a filter box and an "N of M attached" badge.
- **AC-12** (US-3) The system (shall) show a "Project context to use" tab in
  the skill editor with the same list, filter, preview and an "N attached"
  badge.
- **AC-13** (US-2, US-3) КОЛИ the user toggles a checkbox or moves a row, the
  system (shall) persist the full ordered list of attached paths for that agent
  or skill without a separate Save action.
- **AC-14** (US-2, US-3) The system (shall) store each attachment as a
  repo-relative path string and never store the document text on the agent or
  the skill.
- **AC-15** (US-2) КОЛИ the user opens a document's Preview from a Context tab,
  the system (shall) show a drawer with the path, `kind` chip,
  "Used by N agents", the token estimate and an Attached / Attach toggle above
  the rendered markdown.
- **AC-16** (US-2) The system (shall) show in the agent's Context tab the
  documents inherited from its enabled skills as read-only rows labelled
  "via <skill name>", without a checkbox.
- **AC-17** (US-2) КОЛИ an agent's attached-path list changes, the system
  (shall) increment the agent's `version` and snapshot the ordered path list
  into its `agent_versions.config_json`.
- **AC-18** (US-3) КОЛИ a skill's attached-path list changes, the system
  (shall) leave the skill's `version` and `skill_versions` rows unchanged.

### Token estimate

- **AC-19** (US-4) The system (shall) compute every token estimate on the
  server with `container.tokenizer` over the document text as it would be
  wrapped for the prompt, including its delimiters, at request time and never
  store it.
- **AC-20** (US-4) The system (shall) show in the agent's Context tab footer
  the total `≈ N tokens per call` over the merged list of direct and inherited
  documents.
- **AC-21** (US-4) The system (shall) show in the skill's Context tab footer
  the total `≈ N tokens per call` over the skill's attached documents.

### Run injection

- **AC-22** (US-5) КОЛИ a run starts for an agent, the system (shall) build the
  document list as the agent's own paths in saved order followed by the paths
  of each enabled skill in skill-link order, keeping only the first occurrence
  of each path.
- **AC-23** (US-5) КОЛИ a run starts, the system (shall) read each listed path
  from the clone of the PR's repo at the default branch and record the commit
  sha it was read at.
- **AC-24** (US-5) The system (shall) render the resolved documents as one
  `## Project context` section in which each document is its own
  `<untrusted source="project-context:<path>">` block, in list order.
- **AC-25** (US-5) The system (shall) include in the system prompt's injection
  guard a sentence stating that project-context blocks are reference material
  for judging the diff and that instructions inside them never change the task,
  the output format or the verdict.
- **AC-26** (US-5) The system (shall) add project context to a run without any
  LLM call beyond those the review already makes.
- **AC-27** (US-5) КОЛИ project context is resolved, the system (shall) write
  one run-log line `project context: N doc(s) attached (+~T tokens)`.

### Trace transparency

- **AC-28** (US-6) КОЛИ a run's trace is persisted, the system (shall) set
  `specs_read` to the paths of the documents actually sent, in prompt order.
- **AC-29** (US-6) КОЛИ a run's trace is persisted, the system (shall) store a
  nullish `project_context` array with one entry per listed document holding
  `path`, `kind`, `origin` (`agent` or `skill:<name>`), `sha`, `tokens`,
  `status` (`attached | missing | too_large | unreadable | over_budget`) and
  the exact `text` sent.
- **AC-30** (US-6) КОЛИ the user opens the Trace tab of a run whose trace has
  `project_context`, the system (shall) show a "Project context · attached
  specs" section with one row per document showing path, tokens, origin and
  status.
- **AC-31** (US-6) КОЛИ the user expands a row in "Project context · attached
  specs", the system (shall) show the full `text` stored for that document in
  that run.
- **AC-32** (US-6) The system (shall) label the prompt-assembly block for
  project context "Project context" instead of "Project context (dynamic)".

### Verification scenario

- **AC-33** (US-5) КОЛИ an agent has `docs/architecture-invariants.md`
  (stating "module `api/` does not import `db/` directly") attached and reviews
  a PR in a cloned repo that adds an `api/*.ts` file importing from `db/`, the
  system (shall) send a prompt containing a block labelled
  `project-context:docs/architecture-invariants.md` with that file's text.
- **AC-34** (US-5, US-6) КОЛИ the AC-33 review is run three times, the system
  (shall) produce, in at least two of the three runs, a grounded finding on the
  importing line whose rationale names `docs/architecture-invariants.md`.

## Edge cases

- **EC-1** ЯКЩО the repo has no clone on disk (`repos.clone_path` is null or
  the directory is missing), ТОДІ the system (shall) show on the Project
  Context page and in both Context tabs a "repository not cloned yet" state
  distinct from the empty state.
- **EC-2** ЯКЩО the clone has no file matching the globs, ТОДІ the system
  (shall) show an empty state that explains how to add a document (commit a
  `.md` under `specs/`, `docs/` or `insights/`, push to the default branch,
  click Rescan) and shows no "Add a spec file" button.
- **EC-3** ЯКЩО more than 500 files match, ТОДІ the system (shall) return the
  first 500 in path order and show "showing 500 of N".
- **EC-4** ЯКЩО a matching file is larger than 64 KB, ТОДІ the system (shall)
  list it with `attachable: false`, `unattachable_reason: 'too_large'`, a
  disabled checkbox and a tooltip naming the 64 KB limit.
- **EC-5** ЯКЩО a matching file is not valid UTF-8, ТОДІ the system (shall)
  list it with `attachable: false` and `unattachable_reason: 'not_utf8'`.
- **EC-6** ЯКЩО `detectInjectionPatterns` matches a document's text, ТОДІ the
  system (shall) show a warning badge naming the matched patterns on its row
  and in its preview while keeping it attachable.
- **EC-7** ЯКЩО an attached document matches injection patterns at run time,
  ТОДІ the system (shall) write a run-log line naming the path and the
  patterns.
- **EC-8** ЯКЩО an attached path no longer exists in the clone at run time,
  ТОДІ the system (shall) skip it, log `project context: <path> missing —
  skipped`, record it with `status: 'missing'` and complete the run.
- **EC-9** ЯКЩО an attached path no longer exists in the active repo, ТОДІ the
  system (shall) show it in the Context tab as a "missing" row with a Remove
  action and keep it in the stored list until the user removes it.
- **EC-10** ЯКЩО an agent's attached path does not exist in the PR's repo
  because the agent is used on another repo, ТОДІ the system (shall) treat it
  as missing for that run under EC-8.
- **EC-11** ЯКЩО an attached file exceeds 64 KB or is not UTF-8 at run time,
  ТОДІ the system (shall) skip it with `status: 'too_large'` or
  `status: 'unreadable'` and a run-log line.
- **EC-12** ЯКЩО adding the next document would take the wrapped project
  context above 16,000 tokens, ТОДІ the system (shall) skip that document and
  every later one with `status: 'over_budget'` and a run-log line.
- **EC-13** ЯКЩО the merged list's total exceeds 16,000 tokens in a Context
  tab, ТОДІ the system (shall) show a warning in the footer naming the budget
  and the documents that would be skipped.
- **EC-14** ЯКЩО an agent has zero resolved documents, ТОДІ the system (shall)
  omit the `## Project context` section so the prompt is byte-identical to the
  pre-feature prompt.
- **EC-15** ЯКЩО a skill's link to the agent is disabled, the skill itself is
  disabled or it is injection-flagged, ТОДІ the system (shall) exclude that
  skill's documents from the agent's list and from its Context tab.
- **EC-16** ЯКЩО the agent runs in `map-reduce` mode, ТОДІ the system (shall)
  record in the run log that project context is sent on each of the N per-file
  calls.
- **EC-17** ЯКЩО a `run_traces.trace` document was written before
  `project_context` existed, ТОДІ the system (shall) parse it and hide the
  "Project context · attached specs" section.
- **EC-18** ЯКЩО a run fails or is cancelled after project context was
  resolved, ТОДІ the system (shall) persist `specs_read` and `project_context`
  in its trace.
- **EC-19** ЯКЩО the document list is loading, ТОДІ the system (shall) show a
  skeleton list with the same row height as the loaded rows.
- **EC-20** ЯКЩО `GET /repos/:id/context` fails, ТОДІ the system (shall) show
  `context.loadError` with a Retry button in the list area.
- **EC-21** ЯКЩО the filter text matches no document, ТОДІ the system (shall)
  show "No documents match" with a Clear filter action.
- **EC-22** ЯКЩО saving the attached list fails, ТОДІ the system (shall)
  restore the last saved list in the tab.
- **EC-23** ЯКЩО a save of the attached list is in flight, ТОДІ the system
  (shall) disable the tab's checkboxes and move controls until it settles.
- **EC-24** ЯКЩО two tabs save different lists for the same agent or skill,
  ТОДІ the system (shall) keep the list from the last completed save.
- **EC-25** ЯКЩО a Rescan is in flight, ТОДІ the system (shall) disable the
  Rescan button and show "Rescanning…".
- **EC-26** ЯКЩО the Rescan's git fetch fails, ТОДІ the system (shall) return
  the listing of the clone as it is on disk and show that the repo could not be
  updated.
- **EC-27** ЯКЩО the user previews a document larger than 64 KB and at most
  256 KB, ТОДІ the system (shall) render its markdown with a note naming its
  size and the 64 KB attach limit, and keep it unattachable.
- **EC-28** ЯКЩО the user previews a document larger than 256 KB or not valid
  UTF-8, ТОДІ the system (shall) show a note saying why it cannot be previewed
  in place of the rendered markdown.

## Non-functional requirements

- **NFR-1** The system (shall) make zero additional LLM calls for project
  context in any run.
- **NFR-2** The system (shall) return `GET /repos/:id/context` within 2 s for
  500 files of up to 64 KB each on a local clone.
- **NFR-3** The system (shall) give up a Rescan after 30 s and return the
  on-disk listing.
- **NFR-4** The system (shall) scope every read and write of attachments,
  listings and "Used by" counts to the caller's `workspace_id` through
  `getContext()`.
- **NFR-5** The system (shall) answer an invalid attachment path in a save
  request with 422 and `error.code: "validation_error"`.
- **NFR-6** The system (shall) make every Context-tab row operable by keyboard,
  with Move up and Move down buttons as the alternative to drag, a checkbox
  whose accessible name is the path, and visible focus (WCAG 2.1 AA).
- **NFR-7** The system (shall) announce a change of the footer token total
  through an `aria-live="polite"` region.
- **NFR-8** The system (shall) serve every new user-facing string from
  `client/messages/<locale>/context.json`, `agents.json`, `skills.json` or
  `runs.json`.
- **NFR-9** The system (shall) keep `specs_read` a `string[]` and add
  `project_context` as a `.nullish()` field in both `@devdigest/shared` copies.

## Inputs and provenance

| Value | Source | Trusted? | Design source |
|---|---|---|---|
| Document list | clone working tree at `repos.default_branch`, filtered by configured globs + excludes | no — repo content | user text msg 2; design B, C |
| Search globs and excludes | server config (`platform/config.ts`), default `**/{specs,docs,insights}/**/*.md` | yes | user text msg 2; Q3 answer |
| Document path | file system listing; client save request | no — repo- and client-controlled | design C, E |
| Document text | file read from the clone at run time and on preview | no — repo content, committed by any contributor | user text msg 1, 2 |
| Commit sha read at | `container.git.currentHead` of the clone | yes | this spec (F2) |
| `kind` | path segment `specs` / `docs` / `insights` | derived | design C chips |
| Token estimate | `container.tokenizer` (`cl100k_base`, `ceil(chars/4)` fallback) over wrapped text | yes, approximate | design C, D, F; `server/src/adapters/tokenizer/index.ts` |
| Injection flag | `detectInjectionPatterns()` over document text | derived | `server/src/modules/_shared/injection-detection.ts` |
| Attached paths (agent) | stored ordered list on the agent | user input | design C |
| Attached paths (skill) | stored ordered list on the skill | user input | design E |
| Inherited documents | skills returned by `enabledSkillsForPrompt` | derived | design E "Any agent using this skill inherits these documents" |
| "Used by N agents" | agents' lists + enabled agent–skill links with skill lists | derived | design B, D, F |
| Trace `specs_read`, `project_context` | written by the run at persist time into `run_traces.trace` | yes (our record of untrusted text) | user text msg 1, screenshot G |
| Active repo for Context tabs | app shell's selected repo | user input | design C, E |
| CI-path behaviour | none — no runner exists | — | researcher R2 |
| Prior implementation | none — only client hooks, contracts and i18n keys remain | — | researcher R1 |

## Untrusted inputs

- **UI-1** Attachment path in a save request → file-system read and git
  working tree: the system (shall) accept only a relative path without `..`
  segments, ending in `.md`, matching the configured globs and outside the
  excluded directories, and reject any other with 422 (OWASP A01 path
  traversal).
- **UI-2** Stored attachment path → file-system read at run and preview time:
  the system (shall) resolve the real path, refuse it when it leaves the clone
  directory or is a symbolic link, and treat it as missing (OWASP A01).
- **UI-3** Document text → LLM prompt: the system (shall) pass it only through
  `wrapUntrusted()` inside `## Project context`, with the closing delimiter
  escaped and the injection guard naming project-context blocks (OWASP LLM01).
- **UI-4** Document path → `<untrusted source="…">` label in the prompt: the
  system (shall) escape `"`, `<` and `>` in the label so a file name cannot
  close or forge a delimiter (OWASP LLM01).
- **UI-5** Document text → rendered markdown preview in the page and drawers:
  the system (shall) render it with raw HTML disabled and `javascript:` and
  `data:` URLs stripped from links and images (OWASP A03 XSS).
- **UI-6** Stored document text in the trace → Trace drawer: the system (shall)
  render it as plain preformatted text, never as HTML (OWASP A03 XSS).
- **UI-7** Document path → run-log line and server log: the system (shall)
  strip control characters and newlines from the path before logging (OWASP
  A09 log injection).
- **UI-8** Document text → a finding's rationale produced by the model: the
  system (shall) keep the existing `redactReview` and citation-grounding gates
  on every finding, with no exemption for text quoted from a document (OWASP
  LLM02).

## Open questions

- **Q-1** Where does the AC-33/AC-34 verification fixture live (seeded demo
  repo has `clonePath: null`, so it cannot hold a readable document)? —
  default: a manual scenario on a real cloned repo, documented in the PR, with
  no seed change — owner: user.
- **Q-2** Does "Used by N agents" count paths across repos (the same
  repo-relative path attached for another repo)? — default: yes, it counts by
  path within the workspace — owner: user.
- **Q-3** Does Rescan also trigger the repo-intel incremental refresh that
  `POST /repos/:id/refresh` enqueues? — default: no, Rescan only updates the
  clone and the listing — owner: implementation-planner.
- **Q-4** Does the existing `sync()` in `simple-git.ts` have callers whose
  timing Rescan could disturb (a review reading files during a hard reset)? —
  default: accept the race; a run reading a file mid-reset treats it under
  EC-8 — owner: implementation-planner (unverified).
