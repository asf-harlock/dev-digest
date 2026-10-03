# Spec: PR Context
Spec ID: SPEC-07
Status: implemented
Supersedes: [SPEC-06](06-pr-brief.md) (D5, AC-7, EC-13, EC-26 — partial), [SPEC-04](04-project-context.md) (two Non-goals — partial), [SPEC-03](03-intent-layer.md) (D1 — partial)

## Проблема й користувач

Every `file:line` reference in this spec is at branch `L05-homework`, commit
`97b8614`, the branch whose code lands on `main` together with this spec.

A reviewer running DevDigest on a pull request knows what that PR is supposed
to do — its spec, PRD or plan is a markdown file in the repo — but has no way to
tell DevDigest so. Every feature that needs "what should this PR do" uses a
proxy or nothing:

- the PR Brief uses the union of every enabled agent's and skill's attached
  documents as its "spec documents" (`server/src/modules/brief/service.ts:365-397`,
  SPEC-06 D5) — those are review rules (HOW to review), not this PR's intent;
- Intent classification receives no documents at all: its seam
  `resolveProjectContextSpecs` always returns `[]`
  (`server/src/modules/reviews/intent-classifier.ts:62-67`);
- agent runs receive only the agent's and its skills' documents
  (`server/src/modules/reviews/run-executor.ts:222-240`), read from the
  default-branch clone.

The PR's own spec is often not on the default branch yet: PR #16 of this repo
added SPEC-04/05 before they were on `main`, so the default-branch clone cannot
read it. Real specs are also larger than the current limits allow:
`specs/06-pr-brief.md` is 34,962 bytes / 9,684 tokens, over the 32 KB read cap
(`server/src/modules/_shared/context-paths.ts:18`), so it is dropped whole as
`too_large` today (researcher R1). And under the current resolver, once one
document overflows the budget every later one is skipped too
(`server/src/modules/_shared/project-context.ts:299-303`), so putting a large PR
spec first would push an agent's own policy out of its prompt.

The result: the brief, the intent and the reviewers judge a PR without the
document that says what it is for, and the reviewer has no place to supply it.

## Goals / Non-goals

**Goals**
- A **Context** tab on the PR page (`/repos/:repoId/pulls/:number?tab=context`)
  where the user attaches, orders, previews and removes repo markdown documents
  for that one PR, accepts suggestions, and sees per-document token counts,
  status and the budget.
- Two kinds of context, kept distinct:
  - agent/skill context (SPEC-04) = HOW to review, same for every PR, read from
    the default branch — unchanged;
  - PR context (this spec) = WHAT this PR should do, per PR, read at the PR's
    head SHA.
- Agent runs: PR context is **additive** to the agent's and its skills'
  documents and never replaces them, inside the existing 16,000-token cap: PR
  context gets its own 10,000-token budget, and agent and skill documents get
  the remainder (at least 6,000).
- Brief: PR context replaces the "union of enabled agents' documents" proxy;
  the proxy stays only as the fallback when the PR has nothing attached.
- Intent: PR context becomes the classifier's spec input; no agent-document
  fallback.
- PR-context documents are read at `pull_requests.head_sha` from the local
  clone, fetching the head commit on demand, with a 64 KB read cap and
  truncation (marked, never silent) instead of whole-document drop.
- Suggestions (never auto-attach) from `.md` files under `specs/` in the PR's
  changed files and from `SPEC-NN` / `specs/NN-…` references in the PR title,
  description and branch name.
- A context fingerprint stored on every brief, intent and run, so a result
  produced with different PR context is shown as stale.
- Partial amendments to approved specs (also listed in `Supersedes:`):
  - SPEC-06 D5, AC-7, EC-13, EC-26 — the brief's spec documents are the PR
    context when the PR has any attached; the D5 union applies only to a PR
    with an empty attached list;
  - SPEC-04 Non-goals "passing project context to the intent classifier" and
    "not reading documents at the PR head" — lifted for PR context only; agent
    and skill documents keep both rules;
  - SPEC-03 D1 — the classifier's `specs` seam is filled from PR context.
- Vendor edits approved by the user (2026-10-01, "yes to the vendor edits"),
  each in **both** copies (`server/src/vendor/shared/…` and
  `client/src/vendor/shared/…`):
  - `adapters.ts` — a `GitClient` method that reads one file at a commit and
    reports why it could not (not found, symlink, submodule, not a blob, too
    large, fetch failed);
  - `contracts/trace.ts` — `ProjectContextEntry.status` gains `truncated`;
    `RunTrace` gains a nullish context fingerprint;
  - `contracts/brief.ts` — `BriefEnvelope` gains a nullish context fingerprint;
    the intent record gains a nullish context fingerprint (with
    `contracts/review-api.ts` `PrIntentRecord` if the field is exposed there);
  - `contracts/platform.ts` — the PR-context response and save-body contracts,
    next to `ContextListing`.

**Non-goals**
- Not reading PR context through the GitHub contents API when the repo is not
  cloned — considered and judged scope creep for this spec: it needs a new
  GitHub-port method, spends one core-bucket request per file (60/h without a
  token), and a symlink whose target is a regular file comes back as the
  target's content unless `type === 'file'` is checked (researcher R4). An
  uncloned repo shows the "not cloned" state instead (EC-1); the fallback is
  Q-2.
- Not reconstructing PR-added files from `pr_files.patch` with no port change —
  considered and rejected because a spec *modified* in the PR would still be
  read in its stale default-branch version.
- Not reading PR context from the default branch (SPEC-04's rule) — considered
  and rejected because it fails the motivating case (a spec introduced in the
  PR itself).
- Not storing PR attachments in a new join table (`pr_context_docs`) —
  considered and rejected: an ordered path list on the pull request mirrors
  `agents.context_paths` / `skills.context_paths` and the PR upsert already
  leaves extra columns untouched (`server/src/modules/pulls/routes.ts:85-93`).
- Not replacing an agent's or skill's documents with PR context in agent runs.
- Not feeding agent or skill documents to the intent classifier — their text
  would steer `out_of_scope`, which drives the deterministic scope filter that
  drops findings (SPEC-03 D7/D9, `server/src/modules/reviews/helpers.ts:208`).
- Not changing SPEC-04 behaviour for agent and skill documents: their attach cap (32 KB at the time; 64 KB since SPEC-04 EC-4 was amended),
  whole-document drop and sticky over-budget skip stay as they are.
- Not regenerating the brief, re-classifying intent or re-running reviews when
  PR context changes — each is a paid call; the user triggers it.
- Not auto-attaching suggestions, and not remembering dismissed suggestions.
- Not counting PRs in the Project Context page's "Used by N agents".
- Not widening the SPEC-04 globs (`**/{specs,docs,insights}/**/*.md`) for PR
  context.
- Not creating, uploading or editing documents from the tab.
- Not PR context in CI runs, the MCP server or the PR list.
- Not moving the existing PR tab labels (Overview, Agent runs, Files changed)
  to i18n (Q-4).

## User stories

- **US-1** As a reviewer, I want to attach, order, preview and remove repo documents for one pull request on a Context tab, so that every feature knows what this PR is supposed to do.
- **US-2** As a reviewer, I want to see each attached document's token count, status and the PR-context budget, and to know when a document was truncated or skipped, so that I control what the model actually reads.
- **US-3** As a reviewer, I want DevDigest to suggest the PR's own spec documents, so that I attach the right files without searching for them.
- **US-4** As a reviewer, I want PR-context documents read at the PR's head commit, so that a spec added or edited in the PR itself is readable.
- **US-5** As a reviewer, I want agent runs to receive the PR context in addition to their own rules, so that reviewers judge the PR against its spec without losing their policies.
- **US-6** As a developer reading a run, I want the trace to show the PR-context documents sent, so that I can verify what the reviewer was given.
- **US-7** As a reviewer, I want the PR Brief to use the PR context as its spec documents, falling back to the agents' documents only when the PR has none, so that the brief explains the PR against its own spec.
- **US-8** As a reviewer, I want Intent classification to use the PR context, so that the declared intent and scope come from the PR's spec as well as its description.
- **US-9** As a reviewer, I want to see when a brief, an intent or a run was produced with different PR context than the current one, so that I know which results to regenerate.

## Acceptance criteria (EARS)

### Context tab

- **AC-1** (US-1) The system (shall) add a **Context** tab with key `context` to the PR page tab bar after **Files changed**, with the number of attached documents as its badge when that number is above zero.
- **AC-2** (US-1, US-2) КОЛИ the user opens `?tab=context`, the system (shall) list the PR's attached documents in saved order, each row showing the path, a `kind` chip with a text label, an origin badge (`added in this PR`, `modified in this PR` or `default branch`), the status and the token estimate prefixed with `≈`.
- **AC-3** (US-1) КОЛИ the user opens the Context tab, the system (shall) show an attachable list made of the repo's Project Context listing at the default branch plus every `.md` file among the PR's changed files that passes the SPEC-04 path rules, with a checkbox, a Preview button and a filter box.
- **AC-4** (US-1) КОЛИ the user toggles a checkbox, removes a row or moves a row, the system (shall) persist the full ordered list of attached paths for that PR through `PUT /pulls/:id/context` without a separate Save action.
- **AC-5** (US-1) The system (shall) store PR-context attachments as an ordered list of repo-relative path strings on the pull request and never store document text on it.
- **AC-6** (US-1, US-2) КОЛИ a client calls `GET /pulls/:id/context`, the system (shall) return the attached entries (path, kind, origin badge, status, tokens, head SHA read at), the suggestions, the attachable list, the PR-context budget and the current context fingerprint.
- **AC-7** (US-1) КОЛИ the user opens a document's Preview from the Context tab, the system (shall) show a drawer with the path, `kind` chip, origin badge, token estimate and an Attach / Attached toggle above the text returned by `GET /pulls/:id/context/preview?path=<path>`, rendered as markdown.
- **AC-8** (US-2) The system (shall) show in the Context tab footer the total `≈ N of 10,000 tokens` over the attached documents and the line that agent and skill documents keep at least 6,000 tokens per review call.
- **AC-9** (US-2) ДЕ at least one enabled agent of the workspace uses the `map-reduce` strategy, the system (shall) show in the Context tab footer that PR context is sent on each per-file call of those agents.

### Suggestions

- **AC-10** (US-3) КОЛИ the Context tab loads, the system (shall) list as suggestions, each with an Attach button and its reason, every not-attached path in the attachable list (AC-3) that is a `.md` file inside a `specs` directory among the PR's changed files or that a `SPEC-NN` or `specs/NN-…` reference in the PR title, description or branch name resolves to.
- **AC-11** (US-3) The system (shall) resolve a `SPEC-NN` reference to every path in the attachable list that is a `.md` file inside a `specs` directory whose file name starts with `NN-`.
- **AC-12** (US-3) The system (shall) add a suggested document to the attached list only when the user activates its Attach button.
- **AC-13** (US-3) The system (shall) recompute suggestions each time the Context tab loads, keeping no record of an ignored suggestion.

### Reading at the head SHA

- **AC-14** (US-4) КОЛИ PR context is resolved for the tab, a preview, an agent run, a brief or an intent classification, the system (shall) read each attached path at the commit `pull_requests.head_sha` from the PR repo's local clone and record that SHA on the entry.
- **AC-15** (US-4) The system (shall) read a PR-context document only when its tree entry at the head SHA is a regular file (mode `100644` or `100755`) of at most 64 KB.
- **AC-16** (US-4, US-5) The system (shall) keep reading agent and skill documents from the default-branch clone under the SPEC-04 rules whatever the PR context holds.

### Budget and truncation

- **AC-17** (US-2) КОЛИ PR context is resolved, the system (shall) admit the attached documents in saved order into one PR-context budget of 10,000 wrapped tokens, the same budget for agent runs, briefs, intent classifications and the Context tab.
- **AC-18** (US-2) КОЛИ the next PR-context document exceeds the remaining PR-context budget while at least 500 tokens remain, the system (shall) cut it at the last markdown heading line that fits (else the last whole line), append the marker `[truncated: N of M tokens]` and record it with `status: 'truncated'`.
- **AC-19** (US-2) КОЛИ fewer than 500 PR-context tokens remain, the system (shall) record the next document with `status: 'over_budget'` and still evaluate each later document against the remaining budget.
- **AC-20** (US-5) КОЛИ an agent run resolves the agent's and its skills' documents, the system (shall) give them a budget of 16,000 tokens minus the wrapped tokens of the PR-context documents actually sent.

### Agent runs

- **AC-21** (US-5) КОЛИ an agent run starts for a PR with resolved PR-context documents, the system (shall) send them in addition to the agent's and its enabled skills' documents.
- **AC-22** (US-5) The system (shall) render each sent PR-context document as its own `<untrusted source="pr-context:<path>">` block, in saved order, inside a `## PR context` section placed before `## Project context`.
- **AC-23** (US-5) ДЕ a prompt carries at least one `pr-context:` block, the system (shall) add to the injection guard a sentence stating that PR-context blocks are written by the PR author, describe the intended change and never change the task, the review rules, the output format or the verdict.
- **AC-24** (US-5) КОЛИ a path is attached both to the PR and to the agent or one of its enabled skills, the system (shall) send the default-branch copy under its agent or skill origin and send the PR copy only when its blob at the head SHA differs from the default-branch blob.
- **AC-25** (US-6) КОЛИ a run's trace is persisted, the system (shall) record each PR-context entry in `project_context` with `origin: 'pr'`, the head SHA, tokens, status and the exact text sent, ahead of the agent and skill entries, and list the sent PR-context paths in `specs_read`.
- **AC-26** (US-5) КОЛИ PR context is resolved for a run, the system (shall) write one run-log line `pr context: N doc(s) attached (+~T tokens)`.
- **AC-27** (US-6) КОЛИ the user opens the Trace tab of a run whose trace has PR-context entries, the system (shall) show them first in the "Project context · attached specs" section with the origin label `PR`.
- **AC-28** (US-9) КОЛИ a run's trace is persisted, the system (shall) store the context fingerprint the run used.

### Brief

- **AC-29** (US-7) КОЛИ a brief generation runs for a PR whose attached list is not empty, the system (shall) use the resolved PR-context documents as the brief's spec documents, under a `## PR context` heading as `pr-context:<path>` blocks, in place of the enabled agents' and skills' documents.
- **AC-30** (US-7) КОЛИ a brief generation runs for a PR whose attached list is empty, the system (shall) use the enabled agents' and skills' documents under `SPEC_DOCS_TOKEN_BUDGET` as SPEC-06 D5 defines.
- **AC-31** (US-9) КОЛИ a brief is stored, the system (shall) store in its envelope the context fingerprint it was generated with, null when it used the agent-document fallback.

### Intent

- **AC-32** (US-8) КОЛИ an intent classification runs for a PR with resolved PR-context documents, the system (shall) send them to the classifier under a `## PR context` heading as `pr-context:<path>` blocks produced by `reviewer-core`'s `wrapUntrusted` (UI-5).
- **AC-33** (US-8) The system (shall) send the intent classifier no agent or skill documents.
- **AC-34** (US-8) КОЛИ an intent classification used PR context, the system (shall) store a `spec` source with status `used` whose note lists the paths used.
- **AC-35** (US-8) КОЛИ an intent classification used PR context and the PR description holds external links, the system (shall) store the "not fetched" link note as a separate `spec` source entry with status `unreachable`.
- **AC-36** (US-9) КОЛИ an intent is stored, the system (shall) store the context fingerprint it was classified with.

### Staleness

- **AC-37** (US-9) The system (shall) compute the context fingerprint over the ordered attached paths and, for each, its blob id at the head SHA or its unresolved status, and use null for an empty attached list.
- **AC-38** (US-9) КОЛИ the stored fingerprint of the brief differs from the current fingerprint, the system (shall) show the note "Generated with different PR context" next to the **Regenerate** button.
- **AC-39** (US-9) КОЛИ the stored fingerprint of the intent differs from the current fingerprint, the system (shall) show the note "Classified with different PR context" on the Intent card next to its classify action.
- **AC-40** (US-9) КОЛИ a run's stored fingerprint differs from the current fingerprint, the system (shall) show "Run used different PR context" on that run's row in Agent runs.
- **AC-41** (US-9) КОЛИ the PR's attached list changes, the system (shall) start no brief generation, intent classification or review run.

### Preview contract

- **AC-42** (US-1, US-4) КОЛИ a client calls `GET /pulls/:id/context/preview?path=<path>`, the system (shall) return the path, `kind`, origin badge, token estimate, the commit read at and a status from the PR-context status set (`attached`, `missing`, `too_large`, `unreadable`) with the document text when the status is `attached`, reading at the PR head SHA when the path is attached to the PR or among its changed files and at the default branch otherwise.

## Edge cases

- **EC-1** ЯКЩО the repo has no clone on disk, ТОДІ the system (shall) show on the Context tab a "repository not cloned yet" state distinct from the empty state and resolve every attached PR-context document as `unreadable` for every consumer.
- **EC-2** ЯКЩО the head commit is not present in the clone, ТОДІ the system (shall) fetch it once by SHA and, when that fails, once by the forced refspec `+pull/<n>/head:pr-<n>`, before reading.
- **EC-3** ЯКЩО fetching the head commit fails or exceeds 30 s, ТОДІ the system (shall) record every PR-context entry as `unreadable`, write a run-log line without the git error text, and continue the run, brief or classification without PR context.
- **EC-4** ЯКЩО an attached path does not exist at the head SHA, ТОДІ the system (shall) record it with `status: 'missing'` and a run-log line, without fetching again.
- **EC-5** ЯКЩО an attached path's tree entry at the head SHA is a symbolic link, a submodule or not a blob, ТОДІ the system (shall) record it with `status: 'missing'` without reading the link target.
- **EC-6** ЯКЩО an attached document is larger than 64 KB at the head SHA, ТОДІ the system (shall) record it with `status: 'too_large'`.
- **EC-7** ЯКЩО an attached document is not valid UTF-8 or contains a NUL byte, ТОДІ the system (shall) record it with `status: 'unreadable'`.
- **EC-8** ЯКЩО an attached path no longer exists at the current head SHA (force-push, rename, delete), ТОДІ the system (shall) show it on the Context tab as a "missing" row with a Remove action and keep it in the stored list until the user removes it.
- **EC-9** ЯКЩО the attached list is not empty but no document resolves as `attached` or `truncated`, ТОДІ the system (shall) generate the brief with no spec section and no agent-document fallback, and record `specs_missing` in `missing_inputs` with a reason naming each path and its status.
- **EC-10** ЯКЩО a brief's PR-context document was truncated or skipped, including one dropped by the brief's whole-prompt fitter, ТОДІ the system (shall) record `specs_missing` in `missing_inputs` with a reason naming each such path and its status.
- **EC-11** ЯКЩО a run resolves zero PR-context documents, ТОДІ the system (shall) omit the `## PR context` section so the prompt is byte-identical to the prompt without this feature.
- **EC-12** ЯКЩО a PR has an empty attached list, ТОДІ the system (shall) send the intent classifier a prompt byte-identical to the pre-feature prompt.
- **EC-13** ЯКЩО the attached list changes while a run, a brief generation or an intent classification is in flight, ТОДІ the system (shall) let that job use the list it read at its start and store that list's fingerprint.
- **EC-14** ЯКЩО a save of the attached list is in flight, ТОДІ the system (shall) disable the Context tab's checkboxes, Attach, Remove and move controls until it settles.
- **EC-15** ЯКЩО saving the attached list fails, ТОДІ the system (shall) restore the last saved list on the Context tab.
- **EC-16** ЯКЩО two browser tabs save different lists for the same PR, ТОДІ the system (shall) keep the list from the last completed save.
- **EC-17** ЯКЩО `GET /pulls/:id/context` fails, ТОДІ the system (shall) show `prContext.loadError` with a Retry button in the tab body.
- **EC-18** ЯКЩО the Context tab is loading, ТОДІ the system (shall) show a skeleton list with the same row height as the loaded rows.
- **EC-19** ЯКЩО the attachable list is empty, ТОДІ the system (shall) show an empty state explaining that a `.md` file under `specs/`, `docs/` or `insights/` committed to the PR or the default branch becomes attachable.
- **EC-20** ЯКЩО the filter text matches no document, ТОДІ the system (shall) show "No documents match" with a Clear filter action.
- **EC-21** ЯКЩО a stored brief, intent or run trace was written before the context fingerprint existed, ТОДІ the system (shall) read its fingerprint as null.
- **EC-22** ЯКЩО the PR id does not belong to the caller's workspace, ТОДІ the system (shall) respond `404` to `GET /pulls/:id/context`, `PUT /pulls/:id/context` and `GET /pulls/:id/context/preview`.
- **EC-23** ЯКЩО a save request holds more than 20 paths, ТОДІ the system (shall) reject it with 422 and `error.code: "validation_error"`.
- **EC-24** ЯКЩО `pull_requests.head_sha` is not 40 lowercase hexadecimal characters, ТОДІ the system (shall) run no git command and record every PR-context entry as `unreadable`.
- **EC-25** ЯКЩО `detectInjectionPatterns` matches a PR-context document, ТОДІ the system (shall) show a warning badge naming the patterns on its row and write a run-log line, keeping it attached.
- **EC-26** ЯКЩО a `SPEC-NN` or `specs/NN-…` reference resolves to no attachable path, ТОДІ the system (shall) add no suggestion for it and show no error.
- **EC-27** ЯКЩО the PR is closed or merged, ТОДІ the system (shall) keep the Context tab operable and read documents at the stored head SHA.
- **EC-28** ЯКЩО a PR-context document contains a case- or whitespace-variant closing tag (for example `</UNTRUSTED >`) or a forged opening `<untrusted …>` tag, or its path contains `"`, `<` or `>`, ТОДІ the system (shall) send that document's text and label so that they stay inside its own `pr-context:` block in the run, brief and intent prompts.

## Non-functional requirements

- **NFR-1** The system (shall) make zero additional LLM calls for PR context in any run, brief generation, intent classification or Context-tab request.
- **NFR-2** The system (shall) answer `GET /pulls/:id/context` within 3 s for 20 attached paths and a 500-file listing on a local clone that already holds the head commit.
- **NFR-3** The system (shall) run at most one git fetch per clone at a time and give every concurrent reader the result of that fetch.
- **NFR-4** The system (shall) scope every read and write of PR context, including previews, to the caller's `workspace_id` through `getContext()` and `pull_requests.workspace_id`.
- **NFR-5** The system (shall) answer an invalid path in a save request body or in the preview `path` query with 422 and `error.code: "validation_error"`.
- **NFR-6** The system (shall) make every Context-tab row operable by keyboard, with Move up and Move down buttons as the alternative to drag, a checkbox whose accessible name is the path, targets of at least 24×24 px and visible focus (WCAG 2.1 AA).
- **NFR-7** The system (shall) announce a change of the footer token total and of a save failure through an `aria-live="polite"` region.
- **NFR-8** The system (shall) serve every new user-facing string from `client/messages/<locale>/prContext.json`, with the tab label in `prReview.json` and the stale notes in `brief.json`, `intent.json` and `runs.json`.
- **NFR-9** The system (shall) define every contract change of this spec identically in both `@devdigest/shared` copies in the same change, with every field added to a persisted document declared `.nullish()`.
- **NFR-10** The system (shall) use one named PR-context budget constant (10,000), one truncation floor (500) and one PR-context read cap (64 KB) shared by agent runs, briefs, intent classifications and the Context tab.
- **NFR-11** The system (shall) render the Context tab of the seeded demo PR (repo with `clonePath: null`) in its "not cloned" state with no git command and no LLM call, so that an e2e step in `e2e/specs/02-repo-pulls-detail.flow.json` can assert it.
- **NFR-12** The system (shall) log PR-context resolution with the PR id, the number of documents per status and the tokens sent, and never log document text.

## Inputs and provenance

| Value | Source | Trusted? | Design source |
|---|---|---|---|
| Attached PR-context paths | stored ordered list on `pull_requests` (new column), written by `PUT /pulls/:id/context` | user input | user idea; F10 |
| Document text | `GitClient` read by blob id (`git cat-file blob <oid>`) from the local clone, after the entry is resolved at the head SHA | no — author-controlled at head | agreed direction 4; researcher R2 |
| Preview path | `path` query of `GET /pulls/:id/context/preview` | no — client-controlled | coordinator review item 2 |
| Head SHA | `pull_requests.head_sha` (updated by PR sync, `pulls/routes.ts:89`) | yes (GitHub API) but validated as 40-hex | SPEC-06 Inputs table |
| Tree entry mode, type, size, blob id | `git --literal-pathspecs ls-tree -l -z <sha> -- <path>` | yes (git) | researcher R2 |
| Head commit availability | fetch by SHA, else `+pull/<n>/head:pr-<n>` | yes | researcher R2 (`fetchPullHead` refspec lacks `+`) |
| Origin badge (added / modified / default branch) | `pr_files` paths of the PR | yes (GitHub API); paths untrusted text | F8 |
| Attachable list | SPEC-04 listing (default-branch clone) ∪ PR changed `.md` files passing UI-1 | no — repo content | SPEC-04 AC-1; F8 |
| Suggestions | `pr_files` paths under `specs/`; `SPEC-NN` / `specs/NN-…` regex over `pull_requests.title`, `.body`, `.branch` | no — author text | agreed direction 5 |
| Token estimate | `container.tokenizer` over the wrapped text | yes, approximate | SPEC-04 AC-19 |
| PR-context budget, truncation floor, read cap | named server constants (10,000 / 500 / 64 KB) | yes | Q1, Q2 answers; researcher R1 |
| Agent/skill document budget | 16,000 minus PR-context tokens sent | derived | Q1 answer |
| Context fingerprint | hash over ordered paths + blob id or status | derived | Q6 answer; F6 |
| Stored fingerprints | brief envelope (`pr_brief.json`), intent record (`pr_intent`), `run_traces.trace` | yes (our record) | F6 |
| Brief fallback documents | enabled agents' and skills' `context_paths` via `resolveProjectContext` | no — repo content | SPEC-06 D5 |
| Injection flag | `detectInjectionPatterns()` over document text | derived | `server/src/modules/_shared/injection-detection.ts` |
| Map-reduce note | enabled agents' `strategy` | yes | SPEC-04 EC-16; F18 |
| Clone remote URL, git stderr | git subprocess | secret-bearing (token in remote URL) | researcher R2 |
| Prior implementation | none on any branch | — | researcher R3 |

## Untrusted inputs

- **UI-1** Every client-supplied path (each entry of a `PUT /pulls/:id/context` body and the `path` query of `GET /pulls/:id/context/preview`) → stored list and git reads: the system (shall) accept only a relative path whose first character is not `:`, without empty, `.` or `..` segments, without backslash, NUL or control characters, ending in `.md`, at most 512 characters, matching the SPEC-04 globs and outside the excluded directories, and reject any other with 422 (OWASP A01 path traversal).
- **UI-2** Stored or previewed path → git commands: the system (shall) resolve the tree entry with `git --literal-pathspecs ls-tree -l -z <sha> -- <path>` (the only call that carries the path, its NUL-terminated output parsed without C-quote unescaping, passed after `--` in an argument array with no shell, refused when its POSIX-normalised form differs from the input), then read the content only by blob id with `git cat-file blob <oid>`, never through the `<sha>:<path>` form (OWASP A03 injection).
- **UI-3** Head SHA and default-branch commit → every git command of this spec, the preview included: the system (shall) pass a commit to git only when it matches `^[0-9a-f]{40}$` (OWASP A03 argument injection).
- **UI-4** Tree entry at the head SHA → file read: the system (shall) read only regular-file blobs within the 64 KB cap and refuse symlinks and submodules without resolving their targets (OWASP A01).
- **UI-5** PR-context document text → agent-run, brief and intent prompts: the system (shall) wrap it in all three consumers only with `reviewer-core`'s `wrapUntrusted` in its hardened form (`reviewer-core/src/prompt.ts:37-46`: neutralises case- and whitespace-variant closing tags and forged opening tags, escapes the label), with the `pr-context:<path>` label and the injection-guard sentence of AC-23, replacing the intent classifier's private copy (`server/src/modules/reviews/intent-classifier.ts:75-78`, which escapes only the exact `</untrusted>` and leaves the label raw) (OWASP LLM01).
- **UI-6** Document path → `<untrusted source="…">` label: the system (shall) escape `"`, `<` and `>` in the label through the same `wrapUntrusted` so a file name cannot close or forge a delimiter (OWASP LLM01).
- **UI-7** Document text → Preview drawer: the system (shall) render markdown with raw HTML disabled and `javascript:` and `data:` URLs stripped from links and images (OWASP A03 XSS).
- **UI-8** Document text stored in the trace → Trace drawer: the system (shall) render it as plain preformatted text (OWASP A03 XSS).
- **UI-9** Document path → run-log line and server log: the system (shall) replace control characters and newlines through `sanitizePathForLog` before logging (OWASP A09 log injection).
- **UI-10** Clone remote URL and raw git stderr → server log, run log and API error body: the system (shall) strip credentials from URLs and never echo raw git stderr, because the remote URL embeds a GitHub token (OWASP A09 sensitive data in logs).
- **UI-11** PR title, description and branch name → suggestions: the system (shall) extract only `SPEC-NN` and `specs/NN-…` tokens, resolve them against the attachable list, fetch no URL and attach nothing without a user action (OWASP A10 SSRF, LLM01).
- **UI-12** PR-context text echoed by the model → findings, brief and intent output: the system (shall) keep the existing schema validation, `redactSecrets` / `redactReview` and grounding gates with no exemption for text quoted from a PR-context document (OWASP LLM02).

## Open questions

- **Q-1** Does `pull/<n>/head` (fetch by SHA or forced refspec) work for PRs opened from forks? Researcher R2 verified it only for same-repo PRs. — default: treat fork PRs the same; a failed fetch falls under EC-3 — owner: implementation-planner (manual check on a fork PR).
- **Q-2** Should an uncloned repo read PR context through the GitHub contents API (`ref=<head_sha>`, check `type === 'file'`, 1 MB inline limit)? — default: no, out of scope here; a later spec — owner: user.
- **Q-3** `pr_files` can lag behind `head_sha`, because the PR list sync updates only title, `head_sha`, status and `updated_at` (`server/src/modules/pulls/routes.ts:87-92`), so origin badges and suggestions can reflect an older commit. — default: accept; use the current `pr_files` rows — owner: implementation-planner.
- **Q-4** Should this spec also move the hard-coded PR tab labels (`PrDetailHeader.tsx:116-118`) to i18n and validate unknown `?tab=` values (`page.tsx:60`)? — default: no, only the new tab label goes through i18n — owner: user.
- **Q-5** Are a 30 s fetch timeout and a 500-token truncation floor right? — default: yes (EC-3, AC-18) — owner: implementation-planner.
