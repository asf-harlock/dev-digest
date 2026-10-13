## Hand-back 1

## Spec intake: Project Context (Project Context Folder)

### Framing
A reviewer-agent author wants a repo's own markdown rules (specs, architecture docs, insights) to drive what the reviewer checks. Today they cannot put that text into an agent's prompt. When this is done, the author opens a repo's **Project Context** page and sees every `.md` under the configured roots. They tick documents on an agent's **Context** tab, or on a skill's **Project context to use** tab, and see the token cost. Every run then carries those files as an untrusted `## Project context` block with no extra LLM call. The run trace lists each attached document and its tokens, and opens the exact text that was sent.

Part of this already exists and only the wiring is missing:
- `reviewer-core` already has a `specs` slot that renders `## Project context` (`reviewer-core/src/prompt.ts:59,116-118,144`).
- `ReviewInput.specs` is already passed through (`reviewer-core/src/review/run.ts:61,142`).
- The trace already has `specs_read` (`server/src/vendor/shared/contracts/trace.ts:91`) and a "Specs read" row in the UI (`TraceBody.tsx:39-50`).
- The client already has `useContextFiles` / `useReindexContext` for `GET /repos/:id/context` (`client/src/lib/hooks/core.ts:122-137`).
- What is missing is the whole server side (`server/INSIGHTS.md` 2026-09-23 "What Doesn't Work"), the attachment storage, and the UI tabs. `run-executor.ts:344` hard-codes `specs_read: []` and never passes `specs`.

### Placement
Module(s): `server/`, `client/`, `reviewer-core/` (guard/label), both `@devdigest/shared` copies. File: `specs/04-project-context.md`, SPEC-04. Supersedes: —

(`specs/01`–`03` are the highest existing numbers, and no `server|client|reviewer-core|mcp/specs/NN-*.md` exists. There is no lesson file: `specs/lessons/` holds only `.gitkeep`.)

The feature carries 10 `high` findings, which is the cap. It still holds together as one spec. If you prefer two, split it into (a) reader + attachments + run injection and (b) trace transparency UI.

### Insights read
- Read `server/INSIGHTS.md` (relevant): the missing `/repos/:id/context` route, the agent-version bump on link changes, `token_estimate` and injection detection computed live, 422 on validation, the `enabledSkillsForPrompt` order.
- Read `client/INSIGHTS.md` (relevant): the catalog-merge trap on per-entity tabs, the global error toast, and `nav.ts` being extendable with a dead `activeKeyFor` case.
- Read `reviewer-core/INSIGHTS.md` (relevant): skills are deliberately not wrapped, and docs are.
- Read root `INSIGHTS.md` because the feature spans modules and changes shared contracts. Relevant entries: `.nullish()` for persisted trace fields, and "look for a prior implementation in git".
- Skipped `e2e/` and `mcp/`: not touched in intake. `e2e/specs/03-agents.flow.json` will need a step later.

### Sources read
| Source | What I took from it |
|---|---|
| User text, msg 1 + framing | Manual attach to agents/skills; token count per doc; docs read from the project at run start and added as text; Prompt Assembly must show "project context attached specs", each openable to the full text sent |
| User text, msg 2 (lesson reqs) | No auto-selection (Non-goal); reader globs `**/{specs,docs,insights}/**/*.md` with configurable roots; Context tab with checkbox, path, type, search, preview; the same section on skills; metadata stores paths, not text; `## Project context` as untrusted with delimiters and guard; trace `specs_read` + tokens; no extra LLM call; the verification scenario |
| Screenshot G (extra story) | "prompt.smb" read as the Prompt Assembly / trace view. Open question Q10 |
| Design A, empty state | Sidebar entry, repo breadcrumb, "No spec files yet", "Add a spec file" CTA |
| Design B, populated page | Root `.devdigest/specs/`; toolbar +/folder/upload/refresh; Preview/Edit; "Used by 3 agents"; "78 COVERAGE"; "Indexed: 12 files · 1,240 chunks" |
| Design C, agent Context tab | "2 of 7 attached", filter, drag order, type chips, Preview, "≈ 317 tokens", "Injected as an untrusted block (## Project context) into every run." |
| Design D/F, preview drawers | Chip, "Used by 2 agents", per-doc tokens, Attached / + Attach toggle |
| Design E, skill Context tab | "Any agent using this skill inherits these documents"; SERIALIZES AS `## Project specifications` (conflicts with agent `## Project context`); skill is versioned (v5) |
| `reviewer-core/src/prompt.ts` | `INJECTION_GUARD` does not name project docs (:16-28); wrap label is `spec-${i}`, not the path (:118); `assembly.specs` stores the full wrapped block (:163) |
| `reviewer-core/src/review/run.ts` | The same `promptParts` (incl. specs) go to every map-reduce chunk (:138-156) |
| `server/src/modules/reviews/run-executor.ts` | Skill resolution and token log pattern (:206-211); `specs_read: []` (:344, :494); `prompt_assembly` is persisted (:335) |
| `server/src/adapters/git/simple-git.ts` | Clone path is `<cloneDir>/<owner>/<repo>`; `sync` does `reset --hard origin/<default>` (:77-88); PR head exists only as ref `pr-N` (:72-75); `readFile` = `join(clone, path)` with no containment check (:129-131) |
| `server/src/modules/repo-intel/pipeline/walk.ts` | Precedent: never follows symlinks (:89), `MAX_FILE_SIZE` 400 KB (:8,112) |
| `server/src/db/schema/{agents,skills,runs,context,eval}.ts` | Agents and skills carry no `repo_id` (workspace-global); `agent_skills` has order + enabled; `skill_versions` stores only `body` + `message`; `agent_versions.config_json`; `code_chunks.source` has `'docs'`/`'spec'` (embedding index, unused here); `conformance_checks.spec_id`. **No table stores context-doc attachments.** |
| `server/src/vendor/shared/contracts/{trace,platform}.ts` | `RunTrace.specs_read: string[]`; `PromptAssembly.specs` nullish; `SpecFile {path, content?, size?, updated_at?}`; `IndexStatus` |
| `server/src/adapters/tokenizer/index.ts` | `cl100k_base` via js-tiktoken, with a `ceil(chars/4)` fallback. Server-side only |
| `server/src/modules/_shared/injection-detection.ts` | `detectInjectionPatterns()` can be reused for docs |
| `server/src/modules/reviews/intent-classifier.ts:64-78,164` | `resolveProjectContextSpecs()` is a seam that returns `[]`, waiting for this feature |
| `client/src/vendor/ui/nav.ts:21-36`, `components/app-shell/helpers.ts:30` | No Project Context nav item, but `activeKeyFor` already maps `/context` |
| `client/src/app/agents/[id]/_components/AgentEditor/constants.ts:11-14`, `skills/_components/SkillEditor/constants.ts:10-15` | The agent editor has only Config and Skills; the skill editor has no Context tab |
| `client/messages/en/context.json`, `runs.json:35,50` | Namespace `context` exists with editor/mode keys; trace label "Project context (dynamic)" |
| `server/test/contracts.test.ts:177` | Pins `specs_read: ['specs/security-baseline.md']` (string array) |

### Constraints
- `reviewer-core` is ZERO I/O. File reading lives in the server; the engine receives resolved strings. See `reviewer-core/CLAUDE.md`.
- Any external text in a prompt goes through `wrapUntrusted()`. An empty slot must leave the prompt byte-identical. See `reviewer-core/CLAUDE.md`.
- Both `@devdigest/shared` copies change together (root `CLAUDE.md`). Persisted trace fields use `.nullish()` (root `INSIGHTS.md` 2026-09-16).
- Every handler calls `getContext()`. The layers are routes → service → repository, with no cross-module imports (`server/CLAUDE.md`, `server/INSIGHTS.md` 2026-09-20).
- Validation errors are 422 (`server/INSIGHTS.md` 2026-09-25).
- Migrations are generated and never run on boot (root `CLAUDE.md`).
- UI text goes through `next-intl`, and the client has no bare `fetch` (`client/CLAUDE.md`).
- An agent-link change bumps the agent version; a skill `enabled` toggle bumps nothing (`server/INSIGHTS.md` 2026-09-19).
- The seeded demo repo has `clonePath: null` (`server/INSIGHTS.md` 2026-09-26 → `server/src/db/seed.ts:145`), so its reader returns nothing.

### Findings
| ID | Pri | Lens | Finding | Evidence | Proposal |
|---|---|---|---|---|---|
| F1 | high | Cross-module | Agents and skills are workspace-global; docs are per repo. An attached `specs/x.md` is ambiguous across repos, and the agent Context tab has no repo in its breadcrumb. | `schema/agents.ts:8-38`, `schema/skills.ts:5-33` (no `repo_id`); design C breadcrumb "Skills Lab › Agents" vs design B "acme/payments-api › Project Context" | Store repo-relative paths. Resolve them against the **PR's repo** at run time. The Context tab lists the active repo's docs, and saved paths that repo lacks show as "not in this repo" |
| F2 | high | Untrusted / Corner | Which ref gets read. The clone's working tree is the default branch; the PR head is only ref `pr-N`. Reading at PR head lets the PR author rewrite the rules that judge his own PR, e.g. weaken `security-baseline.md`. | `simple-git.ts:72-88,129-131` | Read from the synced clone at the **default branch**. Record the head sha the doc was read at in the trace. Never read the PR head |
| F3 | high | Untrusted | Path traversal and symlinks: `readFile` joins a stored path with no containment check, and the path comes from client input. | `simple-git.ts:129-131`; precedent `walk.ts:89` | On save **and** on read: relative path, no `..` or absolute, `.md` only, matched by the configured globs, realpath inside the clone, no symlinks. Otherwise reject with 422 (save) or skip and log (run) |
| F4 | high | Corner | The default glob `**/{specs,docs,insights}/**/*.md` would also sweep `node_modules/**/docs`, `.git`, vendored dirs and course material. The design root `.devdigest/specs/` and `context.json` `empty.body` disagree with the requirement. | Req msg 2; design B root; `client/messages/en/context.json:13` | Default glob + a fixed exclude list (`node_modules`, `.git`, `dist`, `build`, `vendor`) + a cap on files listed. `.devdigest/specs/**` is matched by the same glob. Roots configured server-side (Q3) |
| F5 | high | Cross-module / History | The trace shape. `specs_read` is `string[]` and old documents must keep parsing. The story needs per-doc tokens and per-doc full text. The "paths not text" rule seems to conflict, but `prompt_assembly.specs` **already persists the full wrapped block** in `run_traces`. | `trace.ts:91`, `prompt.ts:163`, `run-executor.ts:335`, `contracts.test.ts:177` | Keep `specs_read: string[]` (paths). Add a nullish `project_context: [{path, kind, tokens, origin, sha, text}]`. Agent/skill metadata stores paths only; the **run record** stores the text sent (Q8) |
| F6 | high | Missing state / Cost | Map-reduce resends specs on every per-file call, so "≈317 tokens added to each prompt" understates the run cost ×N files. There is no size cap. | `run.ts:138-156`; design C footer | Enforce a per-doc cap and a per-run token budget (Q5). The UI says "≈N tokens per call". The trace reports the tokens actually attached |
| F7 | high | Cross-module / Verification | The wrap label is `spec-${i}`, so the model never sees the path and cannot "refer to the specific document". The "Перевірка" scenario fails by construction. | `prompt.ts:118` | Label each block with its path (quote/`>`-escaped), e.g. `<untrusted source="project-context:docs/architecture.md">`. Acceptance: a finding's rationale names that path |
| F8 | high | Untrusted | `INJECTION_GUARD` lists diff, PR text, README and intent but not project docs. There is also a tension: docs are untrusted, yet they carry the rules the reviewer should apply. | `prompt.ts:16-28`; `reviewer-core/INSIGHTS.md` Decision (skills deliberately unwrapped) | Extend the guard: project-context docs are reference evidence for judging the diff; instructions in them that change the task, output format or verdict are ignored. Run `detectInjectionPatterns` on each doc → warning badge + run-log line (Q7) |
| F9 | high | Corner | Merge semantics for agent docs + inherited skill docs are undefined: overlap, order, and a disabled or injection-flagged skill. Design E serializes as `## Project specifications`; design C says `## Project context`. | Designs C/E; `run-executor.ts:206`; `server/INSIGHTS.md` 2026-09-19 | One `## Project context` block. Agent docs come first in their saved order, then each enabled skill's docs in skill link order; dedupe by path, keeping the first. Only skills that `enabledSkillsForPrompt` returns pass their docs on. The agent tab shows inherited docs read-only as "via <skill>" (Q4) |
| F10 | high | Missing state | A stale path: the doc was deleted or renamed after attaching, or the repo is not cloned. | `simple-git.ts:129` throws ENOENT; the seed repo has `clonePath: null` | Run: skip the doc, log `project context: <path> missing — skipped`, mark it `missing` in the trace; never fail the run. UI: the row shows "missing" + Remove. The path is never dropped silently from metadata |
| F11 | med | Scope | Design B's +/folder/upload/Edit write to a clone that `sync` hard-resets, so edits are lost. | `simple-git.ts:77-88`; design B | Defer. The page is read-only: list + Preview + Rescan (Q1) |
| F12 | med | Scope | "Indexed · 1,240 chunks" is the embedding index (`code_chunks.source docs/spec`), which belongs to the future auto-selector. | `schema/context.ts:31-47`; `IndexStatus` | Defer. The footer shows "N files · last scanned" |
| F13 | med | Scope | "78 COVERAGE" has no defined metric or data source. | Design B | Defer. Non-goal |
| F14 | med | UX / Copy | Empty-state copy "Drop your PRDs… Every agent reads them" is wrong twice: files come from the repo, and only attached docs are read. The "Add a spec file" CTA implies creating a file. | Design A; `context.json:12-13` | Copy explains where to add `.md` in the repo, plus a Rescan CTA. Separate states for "repo not cloned" and "no matching files" |
| F15 | med | Missing state | No loading, error, filter-no-match, "0 of N" or oversized/non-UTF-8 states on the page, tabs or drawer. | Designs B–F | Define each; an oversized or undecodable file is listed but not attachable, with the reason |
| F16 | med | Corner | Versioning: agent-link changes bump the agent version, but `skill_versions` stores only `body`. | `server/INSIGHTS.md` 2026-09-19; `schema/skills.ts:35-49`; design E "v5" | Attachment change → agent version bump + snapshot in `config_json`; skill → no bump; the trace records what was sent (Q6) |
| F17 | med | Cross-module | `GET /repos/:id/context` is called by the client but not implemented. `SpecFile` lacks `kind` and `tokens`. | `core.ts:123-137`; `platform.ts:281-287`; `server/INSIGHTS.md` 2026-09-23 | Implement it by extending `SpecFile` with nullish `kind`, `tokens`, `injection_flagged` in both copies; content via a per-path read |
| F18 | med | Token count | Where tokens are counted is unspecified. The server has only `cl100k_base`, which is approximate for Claude/Gemini. | `tokenizer/index.ts:7-39`; skills `token_estimate` precedent | Count on the server, live from the file (never stored). Count the **wrapped** text (with delimiters). Always show "≈". Agent total includes inherited docs |
| F19 | med | UX / a11y | Drag reordering has no keyboard path; checkboxes need labels. | Design C drag handles | Add Move up/down buttons, `aria-label` = path, focus visible, and an `aria-live` total when a toggle changes it |
| F20 | med | Cross-module | Nav has no Project Context item; the agent and skill editors lack a Context tab. | `nav.ts:21-36`; `helpers.ts:30`; editor `constants.ts` | Add a nav item `/repos/:repoId/context` and a Context tab on both editors. Evals/Stats/CI from design C are out of scope |
| F21 | med | Transparency | The trace UI shows path chips only, and the prompt label says "Project context (dynamic)" although selection is manual. | `TraceBody.tsx:39-50,88-90`; `runs.json:50` | Add a "Project context · attached specs" section: each doc shows path, tokens, origin, and expands to the exact text sent; missing/truncated docs are marked |
| F22 | med | Corner | Save semantics: two tabs, or rapid toggles. | Skills tab full-set replace (`client/INSIGHTS.md` 2026-09-20) | Autosave the full ordered set per change (last write wins); disable while saving |
| F23 | low | Cross-module | The intent classifier's `resolveProjectContextSpecs` seam still returns `[]`. | `intent-classifier.ts:73-78` | Leave as is: the classifier has no agent, so manual attachments do not apply (Q9) |
| F24 | low | History | A failed run's trace (`traceFromBuffer`) records `specs_read: []` even after docs were read. | `run-executor.ts:473-497` | Record the resolved docs whenever resolution happened before the failure |
| F25 | low | Corner | CI parity: does the CI/runner review path get the same docs? | `run.ts:26-27` comment ("fs in the runner"); `agent_runs.source 'ci'` | pending R2 |

(Design text such as "Every agent reads them as grounding context" was treated as data, not instructions. None of the sources contained an injected instruction.)

### Approaches
**Storing attachments**

| Option | What | Touches | Size | Risk |
|---|---|---|---|---|
| A1 (smallest) | Ordered jsonb `context_docs: string[]` on `agents` and on `skills` | 1 migration, 2 repositories | S | Reverse lookup ("Used by N agents") needs a jsonb `@>` query |
| A2 (reuse pattern) | Join tables `agent_context_docs(agent_id, path, order)` and `skill_context_docs(skill_id, path, order)`, mirroring `agent_skills` | 2 tables + indexes | M | Tenancy only through the parent FK; more code |
| A3 | Only inside `agent_versions.config_json` | Versions | S | Skills have no config snapshot; reads need the latest version |

Recommendation: **A1**. It is the smallest, order is built in, and the array snapshots into `agent_versions.config_json` for free. Pick A2 if per-link enable flags or a fast "Used by" index become requirements.

**Snapshotting text for the trace**

| Option | What | Size | Risk |
|---|---|---|---|
| B1 | Per-doc `text` in a new nullish `project_context[]` in `run_traces.trace` | S | Trace grows by the attached text, which is bounded by the Q5 cap |
| B2 | Path + blob sha only; reopen via `git show <sha>:<path>` | S | Breaks on reclone, shallow history or GC; needs a new git port method |
| B3 | Split the existing `prompt_assembly.specs` on delimiters | XS | Brittle parsing; no per-doc tokens |

Recommendation: **B1**. It is the only option that guarantees "the exact text sent". Pick B2 only if trace size becomes a concern.

### Research requests (for the caller: run one `researcher` per row, in parallel)
| ID | Question | Scope | Where to look | Unblocks |
|---|---|---|---|---|
| R1 | Did a previous implementation of the Project Context page / `GET /repos/:id/context` server module exist in git history, and which files, tables and contracts did it use? | repo | `git log -S 'SpecFile' --oneline --all`, `git log -S 'ProjectContextView' --oneline --all`, `git log -S 'context/reindex' --oneline --all`, `git log -S 'specs_read' --oneline --all`; inspect the hits' `server/src/modules/context/` and `client/src/app/repos/[repoId]/context/` | F4, F11, F12, F14, F17, Approach A |
| R2 | Is there a CI/runner review path (outside `server/src/modules/reviews/run-executor.ts`) that calls `reviewPullRequest` today or in git history, and how does it resolve skills/specs (fs from the repo checkout vs API)? | repo | `grep -rn "reviewPullRequest\|AgentManifest" --exclude-dir=node_modules`, `.github/`, `server/src/vendor/shared/contracts/eval-ci.ts`, `git log -S 'AgentManifest' --oneline --all` | F25, a CI Non-goal vs requirement |

### Questions for the user
Blocking (the spec cannot be written without these):
- **Q1** Обсяг сторінки Project Context: робимо її лише для читання (список `.md`, Preview, кнопка Rescan, «Used by N agents»), а створення, завантаження й редагування файлів (+, folder, upload, Edit), індекс «chunks» і «78 COVERAGE» з дизайну відкладаємо в окремі фічі? — мій default: так, відкладаємо всі три. Редагування клону марне, бо `sync` робить `reset --hard`; chunks потрібні лише для майбутнього авто-селектора; coverage не має визначеної метрики.
- **Q2** Звідки читаємо документи: з клону репозиторію саме того PR, що рев'юїться, на **default branch** (а не на PR head, щоб автор PR не міг послабити правила, за якими судять його ж PR)? А в метаданих агента чи скіла зберігаємо шляхи відносно кореня репо, які резолвимо щоразу під репо PR? Вкладка Context агента показує документи активного репо з перемикача. — мій default: так, усе це.
- **Q3** Де налаштовуються корені пошуку? — мій default: серверний конфіг (`platform/config.ts`, одна змінна з glob-списком) з типовим `**/{specs,docs,insights}/**/*.md`, з фіксованими виключеннями `node_modules`, `.git`, `dist`, `build`, `vendor` і лімітом 500 файлів. `.devdigest/specs/` з дизайну покривається тим самим glob. UI налаштувань у Settings не робимо.

Non-blocking (these go to `Open questions` unless answered):
- **Q4** Злиття документів агента й успадкованих від скілів. — мій default: один блок `## Project context`. Спершу документи агента у збереженому порядку, далі документи кожного ввімкненого скіла в порядку прив'язки скілів; дублікати за шляхом прибираємо, лишаючи перше входження. У вкладці агента успадковані документи видно як «via <skill>», без чекбокса. Заголовок `## Project specifications` з дизайну скіла замінюємо на `## Project context`.
- **Q5** Ліміти розміру. — мій default: документ понад 32 KB або з не-UTF-8 вмістом показується в списку, але прикріпити його не можна (з причиною). Бюджет на прогін — 16 000 токенів: документи додаються по порядку, поки не вичерпається бюджет, решта пропускається з записом у лог і trace.
- **Q6** Версіонування. — мій default: зміна прикріплень агента збільшує версію агента (як зараз для скілів). Зміна прикріплень скіла версію скіла **не** збільшує, бо `skill_versions` зберігає лише body; що саме було надіслано, фіксує trace.
- **Q7** Документ, у якому `detectInjectionPatterns` знаходить injection-фрази. — мій default: прикріпити можна, але з попереджувальним бейджем, і в лозі прогону з'являється рядок. Документ і так обгорнутий як недовірений, тому не блокуємо (на відміну від скілів).
- **Q8** Повний текст у trace. — мій default: так, `run_traces` зберігає точний текст кожного надісланого документа (нове поле `project_context[]` поруч із `specs_read`). Правило «шляхи, не текст» стосується метаданих агента й скіла, а не запису прогону.
- **Q9** Intent-класифікатор (`resolveProjectContextSpecs`, зараз повертає `[]`). — мій default: не чіпаємо, бо в класифікатора немає агента, до якого прив'язані документи.
- **Q10** «prompt.smb» у сторі — це вкладка Trace у RunTraceDrawer? — мій default: так. Там з'являється секція «Project context · attached specs», де для кожного документа є шлях, токени і джерело (агент чи скіл), і кожен розгортається до повного надісланого тексту.
- **Q11** Як показувати токени при map-reduce. — мій default: «≈ N tokens per call» у вкладці; у trace — фактично додані токени.
- **Q12** Чи мають документи потрапляти в CI-прогони? — мій default: ні, це Non-goal цього спека (pending R2).
- **Q13** Коли зберігаються зміни. — мій default: автозбереження повного впорядкованого набору після кожного перемикання чи перестановки, без кнопки Save; на час збереження контроли вимкнені.

Acceptance scenario proposed from "Перевірка":
1. Attach `docs/architecture-invariants.md` ("module `api/` does not import `db/` directly") to an agent.
2. Run it on a PR where `api/*.ts` imports from `db/`.
3. The run produces at least one grounded finding on that import line, and its rationale names `docs/architecture-invariants.md`.

The deterministic part (the prompt contains a block labelled with that path) becomes a unit-testable AC. The LLM behaviour becomes an `eval_cases` row (`owner_kind='agent'`) rather than a hard AC.

Reply with answers, or "accept defaults", or per-finding keep/drop (e.g. F1 keep, F13 drop).

Self-check: all 9 Phase 1 items pass. I created or edited no files. The Insights line names server/client/reviewer-core plus root (cross-module). Findings are one table with evidence for every row. The 10 highs come first. F25 is marked pending R2. There are 2 research requests, 3 blocking questions, and every question has a default.


---

## Hand-back 2

I wrote the draft spec at `/Users/harlock/Downloads/Sites/devdigest/specs/04-project-context.md` (SPEC-04, `Status: draft`, `Supersedes: —`). I have not linted it, because I have no shell here. Please run:

`node .claude/skills/spec-authoring/scripts/lint-spec.mjs specs/04-project-context.md`

**What it contains:** 6 user stories, 34 acceptance criteria, 26 edge cases, 9 non-functional requirements and 8 untrusted-input items. SPEC-04 is still the next free number; I re-checked just before writing, and `specs/01`–`03` are the highest.

**Your answers, as applied:**
- **Q1 (view-only):** the Project Context page has only the list, Preview, Rescan and "Used by N agents" (AC-4…AC-10). It has no create, upload, folder or Edit control.
- **Empty state:** EC-2 explains commit → push → Rescan and shows no "Add a spec file" button.
- **Non-goals:** "edit/create docs via commit/PR" is a separate future feature, with your two reasons. The chunk index, COVERAGE, the auto-selector, the intent classifier and CI runs (citing R2) are also Non-goals.
- **Q2–Q13:** every default is written in. That covers reading from the PR repo's default branch, repo-relative paths, server-config globs with excludes, the merge order and dedupe, the 32 KB per-document and 16,000-token per-run caps, versioning, flagged documents still attachable, and full text kept in the trace. It also covers the trace-drawer section, "≈ N tokens per call", and autosave.

**Rescan decision:** Rescan is a new `POST /repos/:id/context/rescan`. It brings the clone to the latest default-branch commit and returns a fresh `SpecFile[]`. I did not reuse `POST /repos/:id/context/reindex`, because its `IndexStatus` response describes an embedding job. That route and contract are left untouched for the auto-selector; this is recorded as a Non-goal.

**Verification scenario:** it is split in two.
- AC-33 is deterministic: the prompt contains a block labelled `project-context:docs/architecture-invariants.md`.
- AC-34 checks the model: in at least 2 of 3 runs there is a grounded finding whose rationale names that path.

All 25 findings (F1–F25) map to at least one item or Non-goal line.

**Open questions left, each with a default and an owner:**
- **Q-1:** where the verification fixture lives. The seeded demo repo has no clone. Default: a manual scenario on a real cloned repo. Owner: user.
- **Q-2:** whether "Used by N agents" counts the same path across repos. Default: yes, it counts by path within the workspace. Owner: user.
- **Q-3:** whether Rescan also triggers the repo-intel refresh. Default: no. Owner: implementation-planner.
- **Q-4:** a possible race between Rescan's hard reset and a run reading files at the same moment. It is unverified. Default: accept it, and the run treats the file as missing. Owner: implementation-planner.

**Self-check:** all 12 Phase 2 items pass. The only file written is the spec, and its filename prefix matches SPEC-04. The nine headings are verbatim and in order. Every acceptance, edge-case, non-functional and untrusted-input item has exactly one `(shall)` and the right trigger. Every user story has at least one acceptance criterion. No requirement rests on an unverified fact; the one unverified point is Q-4. The lint itself is still to run; if it reports errors, send them back and I will fix the draft.