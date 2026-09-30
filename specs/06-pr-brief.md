# Spec: PR Why + Risk Brief
Spec ID: SPEC-06
Status: approved
Supersedes: —

## Проблема й користувач

A reviewer often opens someone else's pull request "cold". They do not know why
the change exists, what in it is risky, or which file to start from. DevDigest
already answers parts of this in separate places. Intent (L03, `pr_intent`,
`IntentCard`) explains the purpose. Smart Diff (L03, `GET /pulls/:id/smart-diff`)
orders files by role. Blast Radius (L04, `GET /pulls/:id/blast`, `BlastRadiusCard`)
shows what else the change can reach. Nothing puts them together, and nothing
names concrete risks or tells the reviewer which lines to read first.

The scaffolding is staged but has no caller (researcher R1: no prior
implementation on any branch; it has been present since the initial snapshot
`587c46a`):
- the `Intent`/`BlastRadius`/`Risk`/`Risks`/`PrBrief` contracts in both
  `contracts/brief.ts` copies (`server/src/vendor/shared/contracts/brief.ts:77-148`);
- the `pr_brief` table (`pr_id`, `json` only; `server/src/db/schema/reviews.ts:79-84`);
- the `risk_brief` feature model (`contracts/platform.ts:61-67`, resolved by
  `resolveFeatureModel` in `server/src/modules/settings/feature-models.ts:51-57`);
- the `brief.json` i18n namespace;
- an optional Risk areas row in `IntentCard` (`IntentCard.tsx:31-32,106-119`).

Missing: the `brief/` module, its routes, the Generate button, Review focus, and
any way to jump from Overview to a file in Files changed. `DiffTab` has no
file/line targeting. `SmartDiffGroups` unmounts collapsed groups
(`SmartDiffGroups.tsx:55,98`), and `FileCard` starts large files collapsed
(`FileCard.tsx:60-62`).

The brief is built without the model reading diff code. So every file it names
has to be checked against facts the server already holds, or the reviewer is
sent to paths that do not exist.

## Goals / Non-goals

**Goals**
- A **PR Brief** section on the Overview tab of `/repos/:repoId/pulls/:number`:
  - a Generate brief button while no brief exists;
  - a summary of what the PR does and why;
  - the existing Intent and Blast radius cards side by side;
  - **Risk areas** inside the Intent card;
  - a full-width **Review focus — read these first** list.
- A new server module `brief/`:
  - `GET /pulls/:id/brief` serves the cached brief and its meta, and never calls
    the model;
  - `POST /pulls/:id/brief` starts one generation.
- The server gathers the model input from facts it already has: PR title and
  description, linked issue, intent, blast-radius summary and caller files,
  per-file diff stats with Smart Diff role, hunk headers, and attached spec
  documents. The model receives no hunk body lines.
- One `completeStructured` call returns `{ summary, risks[], review_focus[] }`,
  using the `risk_brief` model. Every risk file reference and every focus item
  whose file is in neither the PR's files nor the blast-radius map is dropped.
- The result is cached in `pr_brief.json` together with the head SHA it was
  generated for. Reopening the same PR state reads the cache. A moved head shows
  the cached brief with a stale note and a Regenerate button.
- Clicking a Review focus item (or a risk's file reference) switches the page to
  `?tab=diff` and opens that file, highlighting the line when it is in the diff.
- The brief names which inputs were missing, so the reviewer knows what it was
  built without.
- P3, deferred to a later plan (D10); kept here so the requirements are not lost:
  - the verdict and PR score of the latest review in the summary banner, via
    the existing `VerdictBanner`;
  - an expand toggle on each risk that shows its explanation.

**Decisions**
- **D1 — generation is asynchronous.** `POST /pulls/:id/brief` returns `202
  { status: "running" }` and continues in the background. A per-PR in-memory
  lock returns `409 conflict` while a generation is held. The client polls
  `GET` until `generated_at` changes. This is the shape of
  `onboarding-tour/routes.ts:9-15` and `service.ts:72-74,155`. A model call
  takes seconds, and the client already has the tracking pattern
  (`client/src/lib/hooks/intent.ts:70-133`). The lock is valid only for a
  single API instance, the same limitation as the reaper (`server/CLAUDE.md`).
- **D2 — stored envelope.** `pr_brief.json` holds:
  - the brief (`summary`, `risks`, `review_focus`, plus nullish snapshots of the
    `intent` and `blast` used);
  - `generated_for_sha`, `generated_at`, `provider`, `model`;
  - `missing_inputs`;
  - token usage and cost;
  - `last_error`, `last_error_at`.

  A failure writes only the error fields, so the last good brief survives.
- **D3 — the model writes only `summary`, `risks`, `review_focus`.** Intent,
  blast, the missing-inputs list, staleness and verdict are derived by the
  server, never taken from the model. This mirrors `RawIntent = Intent.omit(…)`
  in `intent-classifier.ts:50`.
- **D4 — file grounding, not line grounding.** Files are validated against the
  PR files plus the blast-radius map. A line outside every hunk keeps the item
  but links to the file only.
- **D5 — spec documents come from every enabled agent (resolves former Q-1).**
  The source is the union of the context documents of every enabled agent and of
  their enabled skills, in agent order, under the Project Context token budget.
  The user confirmed this and added: "як нема спек то нічого не передаємо зі
  спек" ("if there are no specs, nothing from specs is passed"). An empty set or
  an uncloned repo therefore adds nothing to the prompt (EC-26). The UI still
  lists it in `missing_inputs` (EC-13), which is shown to the user and is not
  model input.
- **D6 — the `risk_brief` default stays `openai`/`gpt-4.1` (resolves former
  Q-3).** Settings → Feature Models already has a picker for every
  `FEATURE_MODELS` entry, including Risk Brief:
  - the list: `client/src/lib/feature-models.ts:28-34`;
  - the picker: `SettingsModels.tsx:39-64`, in
    `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/`;
  - a choice is saved to `settings.feature_models` as provider `openrouter`
    (`SettingsModels.tsx:30-33`).

  The user answered: "якщо це в налаштуваннях то так, я потім переключу" ("if
  it's in Settings then yes, I'll switch it later"). The registry default is
  therefore unchanged; EC-1/EC-2 cover a workspace without an OpenAI key.
- **D7 — the brief is written in English (resolves former Q-6).** The user
  answered: "english". The model writes `summary`, risk `title` and
  `explanation`, and focus `reason` in English whatever the UI locale or the
  language of the PR text (NFR-12).
- **D8 — size caps (resolves former Q-4).** The user answered: "так, якщо що
  то потім підкорегуємо" ("yes, we'll adjust later if needed"). The caps are:
  - 8 risks and 6 review-focus items per brief (AC-19);
  - 200 files in the prompt (EC-19);
  - 16 000 prompt tokens (NFR-3).

  Each is a named constant that can be tuned without a spec change.
- **D9 — no review findings as model input (resolves former Q-7).** The user
  answered: "ні" ("no"). The latest review's findings are not sent to the
  model. Review focus lines are grounded only by the facts in AC-7.
- **D10 — P3 items deferred (resolves former Q-9).** The user answered:
  "потім" ("later"). AC-28 (verdict/score banner) and AC-29 (risk explanation
  expand) stay in this spec and are marked P3/deferred. The first
  implementation plan leaves them out; US-7 is served only by those two.
  EC-25 (summary banner without a review) stays in the first plan, because the
  summary banner is required.

  The user's "later" covers only AC-28 and AC-29. Four other items are lesson-P3
  but stay in the first plan, labelled P3, because they are cheap and already
  specified:
  - risk click → Files changed (AC-14);
  - the "File not in this PR's diff" notice (EC-16);
  - the loading skeleton (AC-3);
  - block labels from `brief.json` (NFR-5), which `client/CLAUDE.md` also makes
    mandatory.

**Non-goals**
- Not showing "Prior PRs touching these files" (`PrHistory`). It is P3 of L04
  and not needed for the brief.
- Not regenerating the brief automatically when the head SHA moves. It is a
  paid call, so the user clicks Regenerate.
- Not sending hunk bodies (added, removed or context lines) to the model.
- Not feeding the latest review's findings (file, line, severity, title) to the
  model. The lesson's input list does not include them, and the user declined
  them (D9).
- Not a synchronous `POST` that returns the brief. Considered and rejected
  because it holds a 10–90 s HTTP request open, departs from the repo's
  fire-and-forget convention, and still needs a duplicate guard.
- Not building the brief inside the `reviews` module. Considered and rejected
  because the lesson asks for a `brief/` module; pure helpers it needs move to
  `modules/_shared/` instead.
- Not rejecting an item whose line lies outside the diff. Considered and
  rejected because the file is still a valid pointer (D4).
- Not a brief MCP tool, a CI surface, or a brief on the PR list.
- Not changing Smart Diff role classification or the Blast radius and Intent
  cards' own data or actions.

### Priorities (lesson P1 / P2 / P3)

Every requirement carries the priority of the lesson criterion it serves.
- **P1** — blocks the submission:
  - AC-1, AC-2, AC-4, AC-5, AC-6, AC-7, AC-9, AC-10, AC-11, AC-12, AC-13,
    AC-15, AC-17, AC-18, AC-20, AC-21, AC-22, AC-23, AC-25, AC-26, AC-27, AC-31;
  - EC-1, EC-2, EC-4, EC-5, EC-6, EC-7, EC-8, EC-9, EC-10, EC-11, EC-13, EC-14,
    EC-15, EC-18, EC-21, EC-22, EC-23, EC-24, EC-25;
  - NFR-4, NFR-6, NFR-11;
  - UI-1 to UI-9.
- **P2** — the mentor comments in the PR:
  - AC-8, AC-16, AC-19, AC-24, AC-30;
  - EC-3, EC-12, EC-17, EC-19, EC-20, EC-26;
  - NFR-1, NFR-2, NFR-3, NFR-7, NFR-8, NFR-9, NFR-10, NFR-12, NFR-13, NFR-14.
- **P3** — wishes:
  - in the first plan: AC-3, AC-14, EC-16, NFR-5;
  - deferred (D10): AC-28, AC-29.

### Lesson traceability

| Lesson criterion | Priority | Spec IDs |
|---|---|---|
| Overview has a PR Brief block; Generate brief is visible while there is no brief | P1 | AC-1, NFR-11 |
| After generation: summary, Risk areas, Review focus | P1 | AC-4, AC-5, AC-10, AC-12, EC-14, EC-15 |
| Intent and Blast radius sit next to the brief; without them the brief is still generated and names the missing data | P1 | AC-6, EC-9, EC-11, AC-25, AC-26 |
| Each risk has a title and a file; each focus item has file:line and a reason | P1 | AC-10, AC-12, AC-18, EC-18 |
| Every file in Risk areas and Review focus is in the PR or in the blast-radius map; no invented paths | P1 | AC-17, AC-18, EC-10, UI-6 |
| Clicking a focus item opens Files changed at that file | P1 | AC-13, AC-15 |
| After reload the brief appears at once with no new generation; the refresh button regenerates | P1 | AC-20, AC-21, AC-22, AC-23, AC-2, AC-31 |
| Generation is exactly one model call, visible in trace or logs | P2 | AC-9, NFR-1, NFR-13, EC-3 |
| The input stays within the spec's budget; no hunk bodies reach the model | P2 | AC-8, NFR-3, NFR-14, EC-19, AC-19 |
| The model response is validated by the contract; summary and review_focus are in both brief.ts copies | P2 | NFR-7, UI-5, EC-4 |
| The model comes from the risk_brief setting, not hardcoded | P2 | AC-9, AC-30 |
| The cache is bound to the SHA: after a new commit the brief is marked stale | P2 | AC-20, AC-24, EC-20 |
| Clicking a focus item scrolls the diff to the exact line | P2 | AC-16, EC-17 |
| Top banner with verdict and PR score from the latest review | P3 (deferred) | AC-28, EC-25 |
| A risk expands to show its explanation | P3 (deferred) | AC-29 |
| Clicking a risk also opens the file in Files changed | P3 | AC-14 |
| A file not in the diff shows "File not in this PR's diff" | P3 | EC-16 |
| A skeleton shows while the brief is generating | P3 | AC-3 |
| Block labels come from `client/messages/en/brief.json` | P3 | NFR-5 |

### Delivery checklist (lesson process, not product requirements)

These are submission steps for the implementation plan's final tasks, not
behaviour of the system:
- P1: the PR contains `spec.md` (this file) and `plan.md`, produced by
  `spec-creator` and `implementation-planner`.
- P1: an open PR with a description of the implementation and a demo video.
- P2: `spec.md` and `plan.md` are committed before the feature code.
- P2: the PR description has a short cross-model review note (which model
  reviewed the plan and what it found).
- P2: the final `plan-verifier` report is attached to the PR, with no open
  requirement.
- P3: the `workflow-retro` result and the run's cost report are attached to the
  PR.

## User stories

- **US-1** As a reviewer opening an unfamiliar PR, I want to generate a brief on the Overview tab that shows a summary of what the PR does and why next to its Intent and Blast radius, so that I understand the change before reading code.
- **US-2** As a reviewer, I want to see each risk of the PR with a title, a severity and the file it concerns, so that I know what can break and where.
- **US-3** As a reviewer, I want an ordered list of `file:line — reason` items and to open any of them in Files changed with one click, so that I start reading where it matters.
- **US-4** As a reviewer, I want to reload the page and see the same brief immediately without a new generation, so that I do not wait or pay twice for the same PR state.
- **US-5** As a reviewer, I want to regenerate the brief, so that it reflects new commits or a better model choice.
- **US-6** As a reviewer, I want to see which inputs the brief was built without and whether it describes an older commit, so that I know how far to trust it.
- **US-7** As a reviewer, I want the latest review's verdict and PR score in the brief banner and to expand a risk into its explanation (P3), so that the brief and the review read as one summary.

## Acceptance criteria (EARS)

- **AC-1** (US-1) КОЛИ the user opens the Overview tab of a PR that has no stored brief, the system (shall) show a PR Brief section with the text that no brief exists yet and a **Generate brief** button.
- **AC-2** (US-1, US-5) КОЛИ the user clicks **Generate brief** or **Regenerate**, the system (shall) accept `POST /pulls/:id/brief` with `202` and `{ status: "running" }` before the model call finishes.
- **AC-3** (US-1, US-5) ПОКИ a generation for the PR is running, the system (shall) show a loading skeleton in place of the summary, Risk areas and Review focus blocks, with no text-only "Generating…" placeholder.
- **AC-4** (US-1, US-5) КОЛИ a generation finishes, the system (shall) replace the displayed brief with the new one without a page reload.
- **AC-5** (US-1) КОЛИ a stored brief renders, the system (shall) show its `summary` text at the top of the PR Brief section.
- **AC-6** (US-1) КОЛИ a stored brief renders, the system (shall) show the Intent card and the Blast radius card side by side in two columns between the summary and Review focus.
- **AC-7** (US-1) КОЛИ a generation runs, the system (shall) send the model the PR title, the PR description, the linked issue's title and body, the intent (`intent`, `in_scope`, `out_of_scope`), the blast-radius `summary` with the list of caller files, each changed file's path, additions, deletions and Smart Diff role, the hunk headers, and the attached spec documents, omitting each one that is unavailable.
- **AC-8** (US-1) The system (shall) exclude every hunk body line (added, removed and context lines) from the model prompt.
- **AC-9** (US-1) КОЛИ a generation runs, the system (shall) make exactly one `completeStructured` call with the output schema `{ summary, risks[], review_focus[] }` using the provider and model resolved for `risk_brief`.
- **AC-10** (US-2) КОЛИ a stored brief has risks, the system (shall) show them in a **Risk areas** row inside the Intent card, one chip per risk with its severity icon, its title and its file reference as `path` or `path:start[-end]`.
- **AC-11** (US-2) The system (shall) convey each risk's severity (`high`, `medium`, `low`) by an accessible text label in addition to the icon colour.
- **AC-12** (US-3) КОЛИ a stored brief has review-focus items, the system (shall) show a full-width **Review focus — read these first** list with an item-count badge and one row per item as `file:line — reason`, in the order the brief stores them.
- **AC-13** (US-3) КОЛИ the user activates a Review focus item, the system (shall) switch the page to `?tab=diff&file=<path>&line=<n>` without a full page reload.
- **AC-14** (US-2) КОЛИ the user activates a risk's file reference, the system (shall) switch the page to `?tab=diff&file=<path>` with `&line=<start>` when the reference has a line.
- **AC-15** (US-3) КОЛИ Files changed opens with a `file` parameter equal to a file of the PR, the system (shall) expand that file's Smart Diff group and the file itself and scroll the file into view, in both Smart order and Original order.
- **AC-16** (US-3) КОЛИ Files changed opens with a `line` parameter equal to a new-side line number rendered in the target file's hunks, the system (shall) scroll the diff so that exact line is inside the viewport and visibly highlight it.
- **AC-17** (US-2, US-3) КОЛИ the model output arrives, the system (shall) drop every review-focus item and every risk file reference whose path is neither a file of the PR nor a file of the blast-radius map (a changed-symbol file or a caller file).
- **AC-18** (US-2) КОЛИ a risk has no file reference left after grounding, the system (shall) drop that risk.
- **AC-19** (US-2, US-3) The system (shall) store at most 8 risks and at most 6 review-focus items per brief, keeping the first ones in model order.
- **AC-20** (US-4) КОЛИ a generation succeeds, the system (shall) store in `pr_brief.json` the brief together with the head SHA it was generated for, `generated_at`, provider, model, `missing_inputs`, tokens in and out and cost.
- **AC-21** (US-4) КОЛИ a client calls `GET /pulls/:id/brief`, the system (shall) return the stored brief with its meta, a `generating` flag and a `stale` flag without calling the model.
- **AC-22** (US-4) КОЛИ the user reloads the Overview tab of a PR whose stored brief matches the current head SHA, the system (shall) render the stored brief without sending `POST /pulls/:id/brief`.
- **AC-23** (US-5) ПОКИ a stored brief is shown and no generation runs, the system (shall) show a **Regenerate** icon button with the accessible name "Regenerate brief".
- **AC-24** (US-6) КОЛИ the stored `generated_for_sha` differs from the PR's `pull_requests.head_sha`, the system (shall) show the note "Generated for an older commit" with the stored short SHA next to the **Regenerate** button.
- **AC-25** (US-6) КОЛИ a generation runs, the system (shall) compute `missing_inputs` from the server's own facts with one entry per unavailable input: intent not classified, intent classified for another SHA, blast radius degraded with its `reason`, no attached spec documents, empty PR description, linked issue not referenced, linked issue unreachable.
- **AC-26** (US-6) КОЛИ a stored brief has a non-empty `missing_inputs`, the system (shall) list each missing input by name under the summary.
- **AC-27** (US-1) The system (shall) keep the PR Description block below the PR Brief section on the Overview tab.
- **AC-28** (US-7) ДЕ the PR has at least one review, the system (shall) show the newest review's verdict, finding and blocker counts and PR score in the summary banner through `VerdictBanner`, with the brief's `summary` as its text.
  P3 — deferred (D10); not part of the first implementation plan.
- **AC-29** (US-7) КОЛИ the user activates a risk chip's expand toggle, the system (shall) show that risk's `explanation` below the chip and set the toggle's `aria-expanded` to `true`.
  P3 — deferred (D10); not part of the first implementation plan.
- **AC-30** (US-5) КОЛИ a generation runs, the system (shall) call the model with the provider and model resolved for `risk_brief` at that moment (the Settings → Feature Models choice, else the registry default), so that a model changed in Settings is used by the next generation with no code change.
- **AC-31** (US-1, US-5) ПОКИ a generation for the PR is running, the system (shall) keep **Generate brief** and **Regenerate** disabled until the stored `generated_at` or `last_error_at` changes.

## Edge cases

- **EC-1** ЯКЩО no API key is configured for the provider resolved for `risk_brief`, ТОДІ the system (shall) reject `POST /pulls/:id/brief` with the `config_error` code before taking the lock or calling the model.
- **EC-2** ЯКЩО generation is rejected with `config_error`, ТОДІ the system (shall) show in the PR Brief section the message that the Risk Brief model has no API key, with a link to the Settings page.
- **EC-3** ЯКЩО a `POST /pulls/:id/brief` arrives while a generation for the same PR holds the lock, ТОДІ the system (shall) respond `409` with the `conflict` code and start no second model call.
- **EC-4** ЯКЩО the model call fails, times out or returns output that still fails the schema after its retries, ТОДІ the system (shall) keep the previously stored brief unchanged and store `last_error` and `last_error_at`.
- **EC-5** ЯКЩО the stored `last_error_at` is newer than the stored `generated_at`, ТОДІ the system (shall) show the last error message with a **Retry** button in the PR Brief section.
- **EC-6** ЯКЩО the client sees no change of `generated_at` or `last_error_at` within 120 s of an accepted generation, ТОДІ the system (shall) stop waiting, re-enable the button and show that the generation did not finish in time.
- **EC-7** ЯКЩО re-reading `GET /pulls/:id/brief` fails while a generation is being tracked, ТОДІ the system (shall) stop polling after the first failure and re-enable the button, relying on the global error toast.
- **EC-8** ЯКЩО the API restarts while a generation is running, ТОДІ the system (shall) report `generating: false` on the next `GET /pulls/:id/brief`.
- **EC-9** ЯКЩО any of intent, blast radius, linked issue, spec documents or PR description is unavailable, ТОДІ the system (shall) generate the brief without that input instead of refusing the generation.
- **EC-10** ЯКЩО the blast radius is degraded and its map lists no files, ТОДІ the system (shall) ground risk and focus file references against the PR's files alone.
- **EC-11** ЯКЩО the Intent card or the Blast radius card has no data for the PR, ТОДІ the system (shall) show that card's existing empty or degraded state in its column.
- **EC-12** ЯКЩО the PR description references an issue (`#N`, `closes #N`, `fixes #N`, `resolves #N`) that cannot be fetched, ТОДІ the system (shall) record the linked issue as unreachable in `missing_inputs` and continue the generation.
- **EC-13** ЯКЩО the repository is not cloned or no enabled agent has attached documents, ТОДІ the system (shall) record the spec documents as missing in `missing_inputs`.
- **EC-14** ЯКЩО a stored brief has zero risks after grounding, ТОДІ the system (shall) show the `noRisks` text in place of the Risk areas chips.
- **EC-15** ЯКЩО a stored brief has zero review-focus items after grounding, ТОДІ the system (shall) show the text that no focus items were identified in place of the list.
- **EC-16** ЯКЩО Files changed opens with a `file` parameter that is not a file of the PR, ТОДІ the system (shall) show the notice "File not in this PR's diff" above the diff and scroll nowhere.
- **EC-17** ЯКЩО the `line` parameter is not an integer or is not a rendered new-side line of the target file, ТОДІ the system (shall) open and scroll to the file without highlighting any line.
- **EC-18** ЯКЩО the model returns two review-focus items with the same file and line, ТОДІ the system (shall) keep only the first.
- **EC-19** ЯКЩО the PR has more than 200 changed files, ТОДІ the system (shall) send the diff stats and hunk headers of the first 200 files in Smart Diff role order and record the truncation in `missing_inputs`.
- **EC-20** ЯКЩО the PR's head SHA changes after a brief was stored, ТОДІ the system (shall) keep serving the stored brief unchanged until the user regenerates it.
- **EC-21** ЯКЩО the stored `pr_brief.json` document fails validation, ТОДІ the system (shall) treat the PR as having no stored brief and show the **Generate brief** button.
- **EC-22** ЯКЩО a stored document lacks a field added by this spec, ТОДІ the system (shall) read it with that field empty instead of failing.
- **EC-23** ЯКЩО the PR id does not belong to the caller's workspace, ТОДІ the system (shall) respond `404` to both `GET` and `POST /pulls/:id/brief`.
- **EC-24** ЯКЩО model output text contains HTML or Markdown markup, ТОДІ the system (shall) render it as literal text.
- **EC-25** ЯКЩО the PR has no review, ТОДІ the system (shall) show the summary banner with the brief's `summary` alone, without verdict or score.
- **EC-26** ЯКЩО no enabled agent or enabled skill has an attached spec document, or the repository is not cloned, or no document resolves as attached, ТОДІ the system (shall) send the model no spec section at all: no heading, no placeholder, no empty `wrapUntrusted()` block and no "no specs" text.

## Non-functional requirements

- **NFR-1** The system (shall) make exactly one `completeStructured` invocation per accepted `POST /pulls/:id/brief`, with at most 2 schema retries inside it, and zero model calls on `GET /pulls/:id/brief` or on loading the Overview tab.
- **NFR-2** The system (shall) abort the model call after 90 s.
- **NFR-3** The system (shall) limit the model prompt to 16 000 tokens, with spec documents held to the existing Project Context token budget.
- **NFR-4** The system (shall) scope every `pr_brief` read and write to the caller's workspace through `getContext()` and a join on `pull_requests.workspace_id`.
- **NFR-5** The system (shall) serve every PR Brief block label and message from `client/messages/<locale>/brief.json`, none hardcoded in a component, keeping the existing keys of that namespace intact. This covers "PR Brief", "Generate brief", "Regenerate brief", "Risk areas", "Review focus — read these first", the no-risks and no-focus texts, the missing-inputs and stale notes, the error and timeout messages, and "File not in this PR's diff".
- **NFR-6** The system (shall) meet WCAG 2.1 AA in the PR Brief section: every control and link keyboard-operable with visible focus, targets at least 24×24 px, severity conveyed by text, and generating, done and error states announced through an `aria-live` region.
- **NFR-7** The system (shall) define `summary`, `review_focus[{ file, line, reason }]`, the model output schema `{ summary, risks, review_focus }` used to validate the model response, and the stored envelope in both `@devdigest/shared` copies of `contracts/brief.ts` in the same change, with every persisted field nullish in the stored document.
- **NFR-8** The system (shall) log for each generation the PR id, provider, model, duration, tokens in and out, cost, the number of dropped risks, file references and focus items, and the outcome, and never the prompt text, the PR description, the issue body or spec contents.
- **NFR-9** The system (shall) limit `POST /pulls/:id/brief` to 10 requests per minute.
- **NFR-10** The system (shall) validate the `GET /pulls/:id/brief` reply against its contract through the route's response schema.
- **NFR-11** The system (shall) render the no-brief state with the **Generate brief** button with no model call, so that an e2e flow over the seeded PR can assert it.
- **NFR-12** The system (shall) instruct the model in the system prompt to write `summary`, every risk `title` and `explanation`, and every focus `reason` in English.
- **NFR-13** The system (shall) emit exactly one structured log line per accepted generation, with the PR id, provider, model, tokens in, tokens out, cost, duration, schema attempts and outcome, so that a test with a mock provider counts exactly one model invocation per `POST /pulls/:id/brief`.
- **NFR-14** The system (shall) assemble the prompt so that, for a PR fixture whose patches contain added, removed and context lines, a test finds none of those body lines in the prompt and counts at most 16 000 tokens in it.

## Inputs and provenance

| Value | Source | Trusted? | Design source |
|---|---|---|---|
| PR title | `pull_requests.title` | no (author text) | task text |
| PR description | `pull_requests.body` | no (author text) | task text; `pulls/routes.ts:339-349` |
| Linked issue title and body | `#N`, `closes #N`, `fixes #N` or `resolves #N` parsed from the body, fetched through `container.github().getIssue` (already done in `intent-classifier.ts:62,171-183`) | no (issue author text) | lesson requirements |
| Intent (`intent`, `in_scope`, `out_of_scope`, `classified_for_sha`) | `pr_intent` via `container.reviewRepo.getIntent` | no (model-derived from author text) | task text; `pull.repo.ts:116-131` |
| Blast summary, changed-symbol files, caller files, `degraded`, `reason` | `container.repoIntel.getBlastRadius` (same data as `GET /pulls/:id/blast`) | derived from repo content; paths untrusted text | task text; `blast/service.ts:23-30` |
| Per-file path, additions, deletions | `pr_files` | yes (GitHub API), paths untrusted text | task text; `GET /pulls/:id` |
| Smart Diff role per file | Smart Diff classifier (`reviews/smart-diff/classify-file.ts`) | yes (deterministic) | task text |
| Hunk headers (`@@ -a,b +c,d @@`) | `pr_files.patch`, headers only | derived; header text untrusted | lesson requirements ("no hunk bodies") |
| Spec documents | enabled agents' and their enabled skills' `context_paths`, read with `resolveProjectContext` from the clone | no (repo content) | task text; `_shared/project-context.ts:160-314`; user answer (D5) |
| Provider and model | `feature_models['risk_brief']` override, else `FEATURE_MODELS` default `openai`/`gpt-4.1` | yes | `feature-models.ts:51-57`; `platform.ts:61-67` |
| Provider API key | `LocalSecretsProvider` via `container.llm` | yes (secret, never shown) | `server/CLAUDE.md` |
| `summary`, risk `kind`/`title`/`explanation`/`severity`/`file_refs`, focus `file`/`line`/`reason` | model output via `completeStructured` | no, until schema-validated, grounded and redacted | mockup 1 |
| `missing_inputs`, `stale`, `generating` | computed by the server | yes | task text; F12 |
| Head SHA for staleness | `pull_requests.head_sha` (the row value, as intent uses; the GitHub detail path does not update it) | yes | `reviews/service.ts:180`; `pulls/routes.ts:339-349` |
| Tokens in and out, cost | `StructuredResult.tokensIn/tokensOut/costUsd` | yes | `adapters.ts:72-78`; mockup 1 ("$0.014 8.2K→1.3K") |
| Verdict, finding and blocker counts, score (P3) | newest `reviews` row and its non-dismissed findings | verdict/score model-produced, displayed as the review stored them | mockup 1; `VerdictBanner.tsx` |
| `file`, `line` URL parameters | page URL (`?tab=diff&file=&line=`) | no (user-editable) | mockup 2; `page.tsx:60-68` |
| Block labels | `client/messages/en/brief.json` (existing `block.*`, `noRisks`) + new keys | yes | task text |

## Untrusted inputs

- **UI-1** PR title and description → model prompt: the system (shall) wrap each in `wrapUntrusted()` and state in the system message that wrapped content is data, never instructions.
- **UI-2** Linked issue title and body → model prompt: the system (shall) wrap them in `wrapUntrusted()` as one labelled block.
- **UI-3** Spec document text → model prompt: the system (shall) read documents only through `resolveProjectContext` (clone containment, no symlinks, token budget) and wrap each in `wrapUntrusted()` with its path label.
- **UI-4** Intent text, blast summary, symbol names and file paths → model prompt: the system (shall) wrap them in `wrapUntrusted()`, because they are model-derived or repo-derived text.
- **UI-5** Model output → `pr_brief.json`: the system (shall) validate it against the output schema, take `severity` only from the `high|medium|low` enum, and apply `redactSecrets` to `summary`, every risk `title` and `explanation`, and every focus `reason` before storing.
- **UI-6** Model-named file paths → stored brief and deep links: the system (shall) keep only paths that equal a PR file or a blast-radius file (AC-17) and put them in the URL only as an encoded query parameter.
- **UI-7** Model text → Overview UI: the system (shall) render it as plain React text with no Markdown, HTML or link parsing.
- **UI-8** `file` and `line` URL parameters → Files changed: the system (shall) match `file` only by exact equality against the PR's file list and accept `line` only as a positive integer, ignoring any other value.
- **UI-9** Instructions embedded in the PR description, issue, specs or model output → brief content: the system (shall) not follow them and treat any such text only as quoted data.

## Open questions

- ~~**Q-1**~~ Resolved 2026-09-30 by the user — spec documents come from every enabled agent and its enabled skills; with none, nothing from specs is passed (D5, EC-26).
- **Q-2** The linked-issue lookup already exists inside `reviews/intent-classifier.ts` (regex + `container.github().getIssue`). Should the brief reuse it through `modules/_shared/` or keep its own copy? — default: move the regex and the lookup into `modules/_shared/` and use it from both — owner: implementation-planner.
- ~~**Q-3**~~ Resolved 2026-09-30 by the user — the `risk_brief` default stays `openai`/`gpt-4.1`; the user switches it in Settings → Feature Models (D6).
- ~~**Q-4**~~ Resolved 2026-09-30 by the user — the caps stay as tunable constants (D8).
- **Q-5** Are a 90 s model timeout and a 120 s client give-up right? — default: yes (NFR-2, EC-6) — owner: implementation-planner.
- ~~**Q-6**~~ Resolved 2026-09-30 by the user — the model writes the brief in English (D7, NFR-12).
- ~~**Q-7**~~ Resolved 2026-09-30 by the user — review findings are not a model input (D9).
- **Q-8** `ConfigError` maps to HTTP 500 `config_error` (`platform/errors.ts:43-45`), which the client also toasts globally. Keep that status for EC-1 or use a 4xx? — default: keep `config_error`; the client branches on the code — owner: implementation-planner.
- ~~**Q-9**~~ Resolved 2026-09-30 by the user — the P3 items are deferred (D10; AC-28, AC-29).
