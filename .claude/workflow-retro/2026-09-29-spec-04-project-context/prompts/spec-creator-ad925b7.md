Write a Spec-Driven-Development specification for a new DevDigest feature called **Project Context** (also called "Project Context Folder"). Use the `spec-authoring` skill. This is PHASE ONE: return the intake report only (design gaps, corner cases, cross-module interactions, UX improvements, approach options, numbered questions, research requests) and write nothing yet. The user explicitly said: "if anything is unclear, ask questions". They write in Ukrainian, so write the questions in Ukrainian. Keep code identifiers in English.

## User's requirements (verbatim, Ukrainian)

Message 1:
> Напиши нам специфікацію, виходячи з наступних реквайрментів. Фіча, яку ми будемо робити, називається Project Context. […] Значить, користувач у нас може знайти всі специфікації або інші MD документи в проекті. На сторінці Project Context користувач може додавати ці документи до скілів або агентів через відповідні вкладки, які ти бачиш на дизайні. Там же на місці мають рахуватися токени відповідно до розмірів цих MD документів, щоб ми розуміли, скільки токенів буде додано до кожного промту. Коли стартується агент, він має підключені ці документи (специфікація чи щось подібне) — вони мають братися з проекту і додаватися текстом у промт. Коли ми відкриваємо сторінку, щоб подивитися, що додано в Prompt Assembly, обов'язково має бути зазначено "project context attached specs", щоб їх можна було відкрити і прочитати повний текст, доданий до запиту.

Framing:
> Project Context Folder дає змогу прикріпляти markdown-документи з репозиторію до агентів і скілів. Починаємо з цієї фічі, бо вона невелика й одразу показує, чи впливає спека на поведінку рев'юера.

Message 2 (the lesson requirements):
> Спочатку без автоматичного добору. Релевантні документи користувач вибирає вручну. Автоматичний селектор за змістом PR винесіть в окрему фічу.
> Reader. Сервер рекурсивно знаходить .md у specs/, docs/ та insights/. Корені пошуку задаються в конфігурації; типовий glob — **/{specs,docs,insights}/**/*.md.
> Ручне прикріплення. У редакторі агента додайте вкладку Context: список із чекбоксом, шляхом, типом документа, пошуком і preview. Для скіла потрібна така сама секція Project context to use.
> У метаданих зберігаємо шляхи, не текст. Перед прогоном run-executor читає вибрані файли й додає їх у ## Project context як недовірені дані, з delimiters та injection guard.
> Прозорість прогону. Trace показує specs_read, перелік документів і їхній обсяг у токенах. Додавання контексту не потребує окремого LLM-виклику.
> Перевірка. Прикріпіть документ з інваріантом «модуль api/ не імпортує db/ напряму», створіть PR-порушник і перевірте, що рев'юер посилається на конкретний документ.

A screenshot of an extra user story restates message 1 and adds: "В prompt.smb обов'язково має бути зазначено ProjectContextAttachedSpecs, щоб їх можна було відкрити і прочитати повний текст, який був доданий до того запиту." ("prompt.smb" is probably a speech-to-text error for the prompt-assembly view or a prompt snapshot. Treat it as open question: the Prompt Assembly / run trace view must have a "Project context · attached specs" section where each attached doc opens to the exact full text sent in that run.)

## Design screenshots

You can Read these image files. The paths are listed in the order the user pasted them. My descriptions follow, in case the order differs.
1. /var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/E5B4C92D-F5E6-4086-8BBF-AD81E3CDFB61-63833-000001CBB3FA3869/pasted-image-20260929-190321.png
2. /var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/E71ADEE9-BAE6-4EFF-90E9-10238FE742B3-63833-000001CBDF0C9F94/pasted-image-20260929-190351.png
3. /var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/3F66D74F-974A-42D6-ADD2-66206BD24832-63833-000001CCB8946969/pasted-image-20260929-190623.png
4. /var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/44EA376E-BE98-436D-934A-61123ECACECC-63833-000001CCD0B93918/pasted-image-20260929-190640.png
5. /var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/B5CDD96C-929E-4B65-B4F7-CE1C5FEA6689-63833-000001CCF14433F0/pasted-image-20260929-190703.png
6. /var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/EB8FF314-86F4-44BB-B5D5-E7D82BA78D9E-63833-000001CCFD8964EB/pasted-image-20260929-190711.png
7. /var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/A85800FE-0320-45F5-A022-AF2D7063DAA7-63833-000001CD2162809B/pasted-image-20260929-190736.png
8. /var/folders/p4/07lpxbxx2_gg4y1std876nkc0000gn/T/6DA228C3-4EA4-446E-9A02-E7D8090388B5-63833-000001CE0424D71A/pasted-image-20260929-191015.png

What they show:
- **A. Project Context page, empty state.** The sidebar has a "Project Context" entry under WORKSPACE. The breadcrumb reads "acme/payments-api › Project Context". It shows a folder icon, "No spec files yet", "Drop your PRDs, tech specs, and acceptance criteria here. Every agent reads them as grounding context.", and a "+ Add a spec file" button.
- **B. Project Context page, populated.** There are two copies of this screen. The left pane reads "PROJECT CONTEXT" with root `.devdigest/specs/` and has toolbar icons +, folder, upload and refresh. It lists files: public-api.md, security-baseline.md, onboarding-flow.md, rate-limiting.prd.md, webhooks.md, data-retention.md. The footer reads "● Indexed: 12 files · 1,240 chunks · last 5m ago". The right pane shows the file name with a Preview/Edit toggle, rendered markdown ("Public API — PRD" with Goals, Requirements, Non-goals), "Used by 3 agents", and a "78 COVERAGE" ring. Note that the design shows add, upload, edit, chunks/indexing and coverage. The requirements only say read .md from the repo, attach manually, count tokens, and add no extra LLM call. Flag the conflicting parts (edit/upload/create writes, the "chunks" embedding index, the coverage score) as scope questions. Recommend what to defer.
- **C. Agent editor → Context tab** (Skills Lab › Agents › Security Reviewer). Tabs: Config, Skills, Context, Evals, Stats, CI. It shows "Project context" with a badge "2 of 7 attached", a "Filter documents…" search, and the hint "Order matters — earlier docs appear earlier in the assembled ## Project context block. Toggle to attach." Each row has a drag handle, a checkbox, a file name, a directory (specs/, docs/, insights/), a colored type chip (specs blue, docs green, insights orange) and a Preview button. The footer reads "≈ 317 tokens" and "Injected as an untrusted block (## Project context) into every run."
- **D. Agent preview drawer.** A right-side drawer for `specs/security-baseline.md` shows the chip "specs", "Used by 2 agents" and "139 tokens". An "✓ Attached" toggle button sits above the rendered markdown.
- **E. Skill editor → Context tab** (pr-quality-rubric, v5). Tabs: Config, Context, Preview, Evals, Stats, Versions. It shows "Project context to use" with a badge "1 attached", a filter, and "Any agent using this skill inherits these documents." The rows match the agent tab, with an eye icon. A "SERIALIZES AS" box contains `## Project specifications\n- specs/public-api.md`. That heading does not match the agent's "## Project context". Flag the inconsistency. Note also that skills are versioned (v5): does changing attachments bump the skill version?
- **F. Skill preview drawer** for `docs/architecture.md` shows chip docs, "Used by 2 agents", "103 tokens", and a blue "+ Attach" button (the not-yet-attached state).
- **G.** A text screenshot of the extra user story quoted above.

## Things to cover in the intake (beyond your standard lenses)
- Token estimation: which tokenizer or heuristic, where it runs (server vs client), per-doc and total counts, and how the count reflects the delimiters/guard overhead.
- Merge semantics when agent-level and inherited skill-level docs overlap: dedupe, ordering, and whether per-agent order is persisted.
- Stale paths: a file is deleted or renamed after being attached. What do the run, the UI and the trace do?
- Size limits and caps, path traversal and symlinks outside the configured roots, and non-UTF-8 or huge files.
- Prompt-injection guard design, since the docs are untrusted.
- The trace/`specs_read` shape. Whether the full text is snapshotted per run so it can be reopened (the user story requires the reader to see the exact text sent). This conflicts with "metadata stores paths, not text", so say whether the run record stores the text.
- Which repo is read: the local checkout, and at which ref (the PR head or the default branch)?
- The existing DB schema already has tables for every lesson. Check whether a spec/context table already exists before proposing one.
- Where the run-executor, prompt assembly and trace live today across server/, reviewer-core/ and client/. Note that reviewer-core has ZERO I/O, so file reading must be in server.
- The acceptance scenario in "Перевірка", written as an AC/eval.
- The auto-selector by PR content is explicitly a separate future feature and a Non-goal.

Read the repo context first: root CLAUDE.md, docs/architecture.md, specs/lessons/ (look for a matching lesson spec, probably L05 or similar), existing specs/ numbering, and the server/client/reviewer-core CLAUDE.md and INSIGHTS.md. This is likely a cross-module spec under `specs/NN-project-context.md`.

---
## Resume 1

PHASE TWO: write the spec now as `specs/04-project-context.md` (SPEC-04, Status: draft). Keep all 25 findings (F1–F25).

The user's answers:
- **Q1: view-only.** The user first asked whether editing docs on the filesystem is feasible. I checked and they agreed to view-only.
  - Reason 1: the server's clone at `<cloneDir>/<owner>/<repo>` is a shallow (`CLONE_DEPTH=1`) read-only mirror. `sync()` does `reset --hard origin/<branch>` (`server/src/adapters/git/simple-git.ts:77-88`), so any local edit or new file is silently wiped on the next sync.
  - Reason 2: edits never reach git or the team, and they would make what the reviewer read non-reproducible.
  - The correct way to edit is to commit to a branch and open a PR via the GitHub API (write-scoped token, branching, conflict handling). That is larger than this spec. Put it in Non-goals as a separate future feature: "edit/create docs via commit/PR".
  - The page is: list + Preview + Rescan + "Used by N agents". There is no "+ / folder / upload / Edit".
  - The empty state explains how to add `.md` to the repo (commit, push, Rescan). It does not show an "Add a spec file" CTA.
  - Chunks indexing and COVERAGE are also deferred to Non-goals.
- **Q2–Q13: accept all of your defaults as stated.**

Research results:
- **R1: no prior implementation exists in any branch.** No commit ever touched `server/src/modules/context/` or `client/src/app/repos/[repoId]/context/`. The only remnants are in `587c46a`:
  - client hooks `useContextFiles`, which calls `GET /repos/:repoId/context` → `SpecFile[]`
  - `useReindexContext`, which calls `POST /repos/:repoId/context/reindex` → `IndexStatus` (a chunk-embedding status: idle/cloning/parsing/embedding/done/error, pct, chunks_indexed)
  - contracts `SpecFile {path, content?, size?, updated_at?}` and `IndexStatus`
  - `code_chunks.source` enum `code|docs|spec`
  - `client/messages/en/context.json` keys, including mode/editor/save, and the empty body mentioning `.devdigest/specs/`
  - a dangling comment `ProjectContextView` in `client/src/lib/hooks/repo-intel.ts:28`
  
  There is no discovery logic, no attachment table, no edit route and no coverage metric. So: build the server side from scratch, and keep the existing `GET /repos/:id/context` path, extending `SpecFile` with nullish fields. Decide whether "Rescan" reuses the `/context/reindex` path with a simpler response or uses a new endpoint. The `IndexStatus` embedding semantics do not fit a glob rescan, so state your choice explicitly.
- **R2: `run-executor.ts` is the only non-test caller of `reviewPullRequest`, now and in all history.** `agent-runner` (the CI GitHub Action) was never committed. It is referenced only in:
  - comments (`reviewer-core/src/review/run.ts:16-28`, `eval-ci.ts:145-150`)
  - `.gitignore:3-6`
  - `reviewer-core/package.json:6`
  
  `AgentManifest` has no specs field. `specs/03-intent-layer.md:101,372` likewise puts runner wiring out of scope. So Q12 stays: CI is a Non-goal. Note that docs passed through `ReviewInput.specs` would reach a future runner automatically, but the runner must resolve them itself (for example, a future repo-file convention).

Follow the spec-authoring skill, run its lint, and report the file path plus a short summary.