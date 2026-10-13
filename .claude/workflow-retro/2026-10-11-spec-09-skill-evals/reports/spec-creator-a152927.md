## Hand-back 1

## Spec intake: L06 stretch tasks (manual eval cases, metric trend charts, skill eval, commit hook, mutation testing)

Phase 1 only. I created and edited no files.

### Framing
The person tuning a reviewer agent can only build its regression set from findings the agent already produced, and sees metric history only on the Eval Dashboard detail page. So a bug the agent has never seen cannot become a case, and a slow precision decline goes unnoticed on the screen where the cases live. Done, from that person's side: on the agent's Evals tab they can (a) create a case from a pasted diff, a file and a line range, then edit it later, and that case runs with the existing **Run all evals**; and (b) see a recall / precision / citation trend where each point is one run and the tooltip shows the version and the cost.

Much of this already exists and only needs an entry point or an extension:
- **Running cases:** `POST /agents/:id/eval-runs`, the executor and the scorer already run any `eval_cases` row. The table already allows rows with no source finding (`server/src/db/schema/eval.ts:42-50`, "NULLs (cases not made from a finding) stay allowed").
- **Diff check:** `freezeFileDiff` already checks that a range intersects a hunk (`server/src/modules/eval/frozen-input.ts:84-106`).
- **Diff preview:** the case modal already shows a diff through `DiffViewer` (`CaseBody.tsx`).
- **Trend chart:** a gap-aware chart already exists (`client/src/app/eval/agents/[agentId]/_components/MetricTrend/MetricTrend.tsx`), but it has no tooltip and is not on the Evals tab.

Items 1, 4 and 5 are not product behaviour. Recommendation on those is below.

### Placement
- Items 2 and 3 → server, client and both `@devdigest/shared` copies → `specs/09-<name>.md`, SPEC-09. The highest existing prefix is 08 (`specs/08-eval-pipeline.md`); `server/`, `client/`, `reviewer-core/` and `mcp/specs/` hold no numbered specs.
- Supersedes: — (proposed). It does amend some SPEC-08 items; see Q5.
- Items 1, 4, 5: I recommend no SPEC-NN. My reasons:
  - **Item 1** (an eval file in `evals/skills/<skill>/`) is test code for a harness artifact. Its "requirements" are the eval cases themselves.
  - **Item 4** (a hook in `.claude/settings.json`) is harness config. Its acceptance is "a real blocked commit, documented".
  - **Item 5** (a mutation run on one module) is a one-off experiment plus one new test.
  - None of these three has a user-facing behaviour to trace with AC/EC IDs. The spec placement table (`spec-authoring/SKILL.md`) has no `evals/` or `.claude/` slot. `plan-verifier` would have nothing but "file exists" to check.
  - Better route: three short plan/doc tasks, each handed straight to `implementation-planner` (or done by hand), with the outcome recorded in the PR description or `INSIGHTS.md`.

### Insights read
- `client/INSIGHTS.md`: relevant. Kit `LineChart` turns null into 0 and fixes the y-range at 0.6–1.0, so the eval charts must stay custom SVG (lines 24-33). Also the fire-and-forget polling notes.
- `server/INSIGHTS.md`: relevant. drizzle-kit prompts on add+drop in one pass; split migrations (316-325).
- Root `INSIGHTS.md`: read because the work spans modules and the shared contracts. Relevant:
  - persisted jsonb fields take `.nullish()` (148-156);
  - the eval harness loads only `references/` (plural) (178-184);
  - the prior eval implementation lives only on `upstream/full-functionality` (105-114).
- Skipped: `reviewer-core/`, `mcp/`, `e2e/` INSIGHTS (not touched). `evals/` has no CLAUDE.md, so I read `evals/README.md` instead.

### Sources read
| Source | What I took from it |
|---|---|
| User text (stretch brief, items 1–5) | Scope: Case Editor with DiffView preview, expectation type, file and line range; manual cases run by the same route; trend of recall/precision/citation_accuracy over all agent runs on the Evals tab, tooltip = prompt version + cost |
| Screenshot `pasted-image-20261011-140002.png` | It is **Skills Lab → Skill `pr-quality-rubric` → Evals**, i.e. the skill editor, not the agent editor. It shows "Eval cases · 17 / 20 passing", **Run all evals**, **+ New eval case**, per-row ▷ / ✎ / 🗑, an `empty []` row ("expected 0 findings"), a `never run` row, and header **Run on evals** |
| `client/src/app/skills/_components/SkillEditor/SkillEditor.tsx:57` | **Run on evals** is a disabled button |
| `client/src/app/skills/_components/SkillEditor/_components/EvalsTab/EvalsTab.tsx:10-16` | The skill Evals tab is a placeholder EmptyState. **Every control in the screenshot is mock-only** |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx` | The shipped agent Evals tab has KPI cards, the case list, **Run all evals**, the case modal and delete. No New-case button, no edit, no per-row run, no trend |
| `.../EvalsTab/_components/EvalCaseList/EvalCaseList.tsx:70-77` | Each row has only the delete IconBtn. Rename is in the modal |
| `specs/08-eval-pipeline.md` (approved) | Non-goals cover skill-owned cases/runs, per-case run, and **+ New eval case** from scratch. AC-14 makes the modal read-only. EC-22 empty-state copy points only to PR findings. AC-42 puts the trend on the detail page, capped at 30. NFR-5 makes runs immutable. EC-21: null cost shows "—" |
| `server/src/vendor/shared/contracts/knowledge.ts:174-245` | Expectation types are only `must_find` and `must_not_flag`. `EvalCaseMeta` **requires** `pr_number` (int) and `repo_full_name`. `source_finding_id` is nullable |
| `server/src/vendor/shared/contracts/eval-ci.ts:96-121` | `EvalTrendPoint` has `run_id`, `ran_at`, `agent_version` and three metrics. **No `cost_usd`.** Trend ≤ 30 |
| `server/src/modules/eval/frozen-input.ts:17-106` | `extractFileDiff` (one file section), `rawDiffFromPrFiles` (wraps bare hunks in headers), and `freezeFileDiff` (`no_patch` / `range_outside_diff` through `groundFindings`) |
| `server/src/modules/eval/executor.ts:47-64` | A frozen diff that parses to zero files errors. The task line comes from `inputMeta.title`; the body becomes `prDescription` |
| `server/src/modules/eval/service.ts:140-168` | `latest_result` is looked up by case id in the latest finished run. `source` is built from `sourceFindingId` |
| `client/src/lib/hooks/eval.ts` | Existing hooks and query keys. No create or update case hook beyond rename |
| `client/src/app/eval/agents/[agentId]/_components/MetricTrend/MetricTrend.tsx:72-81` | Points are bare `<circle>`s: not focusable, no tooltip |
| `.claude/settings.json:2-14`; `.claude/skills/pr-self-review/scripts/gate.sh:3-4` | A PreToolUse `Bash` hook already exists. It denies push and PR create/merge without a fresh passing report. It does not gate `git commit` |
| `evals/README.md`; `evals/skills/dependency-checker/dependency-checker.cases.ts` | `skillTask` and `patternMatch`/`llmJudge` mechanics. `dependency-checker` already has 3 quality cases; it may be the lab sample (pending R3) |
| Grep `stryker|mutation` (repo, excluding node_modules) | No mutation tool in any package |
| Grep `e2e/specs` for eval | No browser flow covers any eval screen |

### Constraints
- Contracts change in both vendor copies in one commit; the client uses `.optional()` where the server uses `.default()`. Sources: root `CLAUDE.md` Gotchas; SPEC-08 NFR-9.
- New fields in persisted jsonb (`eval_cases.input_meta`) must be `.nullish()`, not `.nullable()` — root `INSIGHTS.md:148-156`.
- The kit charts must not draw eval metrics — `client/INSIGHTS.md:24-33`.
- No route may import another route's `_components/`, so reusing `MetricTrend` on `/agents/[id]` means moving it to `src/components/` — `client/CLAUDE.md` Rules (`pnpm arch`).
- Every handler scopes through `getContext()`. Layers: routes → service → repository; no raw SQL in a service — `server/CLAUDE.md`.
- Migrations come from `pnpm db:generate`; split add and drop passes — `server/INSIGHTS.md:316-325`.
- SPEC-08 is `approved` and is never edited. Any change to its ACs (AC-14 read-only modal, EC-22 copy) is stated in the new spec — `spec-authoring/SKILL.md` non-negotiable 7.
- The eval harness loads `SKILL.md` + `references/*.md` only; this repo's skills use `reference/` — root `INSIGHTS.md:178-184` (item 1).

### Findings
| ID | Pri | Lens | Finding | Evidence | Proposal |
|---|---|---|---|---|---|
| F1 | high | Cross-module | The design anchor is the **skill** editor's Evals tab (cases owned by a skill, `owner_kind: 'skill'`). That tab is a placeholder, **Run on evals** is disabled, and SPEC-08 explicitly excluded skill-owned cases and runs. The shipped case list lives in the **agent** Evals tab. Building the screenshot literally means building skill evals, which is a separate, larger feature. | screenshot; `SkillEditor.tsx:57`; `SkillEditor/_components/EvalsTab/EvalsTab.tsx:10-16`; SPEC-08 Non-goals | Put **+ New eval case**, per-row edit and the trend chart on the agent Evals tab. Take only the layout from the screenshot. Skill evals become a Non-goal (Q1) |
| F2 | high | Cross-module | A manual case has no PR, but `EvalCaseMeta` requires `pr_number` (int) and `repo_full_name`. Existing rows are jsonb, so a changed field must be `.nullish()` in both copies | `knowledge.ts:190-195`; root `INSIGHTS.md:148-156` | Make `pr_number` and `repo_full_name` `.nullish()` in both copies. Add a derived `origin: "finding" \| "manual"` (manual = no `source_finding_id`). Case modal shows "Created manually" instead of "Source no longer available" |
| F3 | high | Corner case | Pasted diff text is free-form. It can have several files, bare hunks without headers (copied from GitHub), or no hunk at all. The executor errors on a diff with zero files, and a range outside the hunks can never match | `frozen-input.ts:17-24,45-64,84-106`; `executor.ts:47-49` | Validate on the server with the existing `freezeFileDiff`. Bare hunks are wrapped with the entered file path. More than one file section → keep only the section of the chosen file. Zero hunks → `422 no_patch`. Range outside the hunks' new-side lines → `422 range_outside_diff`. The same check runs on edit |
| F4 | high | Corner case | Editing a case's diff, file, range or type silently changes what past runs measured. `latest_result` is looked up by case id, so it would show a pass for a question nobody re-asked. Compare treats cases by id as "common" and would diff two different questions. SPEC-08 NFR-5 makes runs immutable | `service.ts:140-149`; SPEC-08 AC-46, AC-47, NFR-5 | Approach B below: an edit of diff, file, range or type saves a **new** case and deletes the old one (old results stay, per SPEC-08 AC-18). Name and notes edit in place and keep results (Q3) |
| F5 | high | Missing state | Should cases created from findings be editable too? Their diff and expectation are evidence of a real decision; SPEC-08 EC-7 deliberately keeps their type fixed | SPEC-08 EC-7, AC-4; `eval.ts:42-43` | Finding-derived cases: name and notes editable; diff and expectation read-only, with copy that says why. Manual cases: every field editable (Q3) |
| F6 | high | Untrusted inputs | Pasted diff text (often third-party incident code) reaches the LLM prompt on every run and is shown in DiffViewer. There is no size cap: a huge paste costs tokens on every run and slows the form | SPEC-08 UI-1, UI-3; `executor.ts:53-65` | Same prompt assembly as frozen diffs (wrapped, `INJECTION_GUARD`); escaped render in DiffViewer; diff capped at 100 KB → `422 diff_too_large` (Q7) |
| F7 | high | Cross-module | New create/update routes must reject an agent or case from another workspace. `eval_cases.owner_id` has no FK, so nothing in the DB stops a case pointing at a foreign agent | `eval.ts:35-36` (no FK); SPEC-08 EC-31, NFR-3 | `POST /agents/:id/eval-cases` checks the agent exists in the caller's workspace, else `404`. `PUT /eval-cases/:id` is scoped the same way; a foreign id → `404` |
| F8 | high | Missing state | The trend tooltip needs cost, but `EvalTrendPoint` has no `cost_usd`. A null cost (model missing from the price table) must not read as $0.00 | `eval-ci.ts:96-103`; SPEC-08 EC-21 | Add `cost_usd: number \| null` to `EvalTrendPoint` in both copies (the repository already selects `costUsd`, `repository.ts:41`). Null shows "—" |
| F9 | high | Missing state | The brief says "all runs of the agent", but the trend is capped at 30 finished runs. Errored runs (all metrics null) and running runs are not on it | `eval-ci.ts:106`; SPEC-08 AC-42, AC-57 | Points = finished runs only, last 100, chronological, with gaps for null metrics (Q6). Errored runs are excluded and shown nowhere on the chart |
| F10 | med | UX | The tooltip's "prompt version" `v{n}` can lie: skill edits change the prompt without bumping `agents.version`, so two points labelled v5 can differ | SPEC-08 Problem (`agents/repository.ts:193-210`) | Tooltip: `v{n}`, date, three metrics, cost, model. Mark "skills changed" when the run's snapshot skills differ from the previous point's |
| F11 | med | UX | Chart points are bare `<circle>`s: not focusable, no accessible name. A hover-only tooltip fails keyboard use (WCAG 2.1.1) and content-on-hover (1.4.13) | `MetricTrend.tsx:79-81` | One focusable target per run with an `aria-label` carrying the tooltip text. Tooltip opens on hover and on focus and closes on Esc. Target ≥ 24×24 px |
| F12 | med | Cross-module | `MetricTrend` lives under `app/eval/agents/[agentId]/_components`; importing it from `/agents/[id]` violates `pnpm arch` | `client/CLAUDE.md` Rules | Move it to `src/components/` and use it on both pages; the tooltip appears on both |
| F13 | med | Missing state | A manual case needs a title for the review's task line (`executor.ts:64`); with none, the model gets an empty task | `executor.ts:62-64` | Form fields: name (1–80, required), title (required, prefilled from name), description (optional → `prDescription`), notes (optional, existing `notes` column) |
| F14 | med | Corner case | Line range input: start > end, 0, negative, non-integer | `knowledge.ts:181-182` (plain `int`) | `start_line ≥ 1`, `end_line ≥ start_line`, integers. Client validates inline; server `422 validation_error` |
| F15 | med | UX | Pasting a diff and then closing the modal or pressing Esc loses the work | screenshot (modal implied by ✎) | Ask to confirm discarding a dirty form; a failed save keeps every input |
| F16 | med | UX | The preview should show what will match. Without seeing the range on the diff, users pick old-side line numbers | brief "DiffView-прев'ю"; `client/INSIGHTS.md` (new-side anchoring) | Live DiffViewer preview of the chosen file, with the expectation range highlighted on new-side line numbers and a note that ranges are new-side |
| F17 | med | Missing state | The mockup's `clean-refactor-no-flags` row ("expected 0 findings", `empty []`) needs an expectation type that does not exist | screenshot; `knowledge.ts:174` | Out of scope: no new type, because it would change recall/precision. A `must_not_flag` case over the whole hunk covers it (Q8) |
| F18 | med | Missing state | EC-22 empty-state copy points only to PR findings | SPEC-08 EC-22 | Empty state adds **+ New eval case** as a second action. The new spec states that it replaces EC-22's copy |
| F19 | low | UX | The mockup's per-row ▷ (run one case) is a SPEC-08 Non-goal | screenshot; SPEC-08 Non-goals | Keep it as a Non-goal |
| F20 | low | Missing state | Manual `must_find` has no severity or category, so the row tag is blank | `EvalCaseList.tsx:32-35` | Optional severity and category selects (display-only, as SPEC-08 AC-5) |
| F21 | low | Corner case | A case created while a run executes is not in that run (case set frozen at start, AC-21) | SPEC-08 AC-21 | Shows `never run` until the next run; no new behaviour |
| F22 | low | Cross-module | No e2e flow covers any eval screen | Grep `e2e/specs` → 0 matches | Optional: one flow — create a manual case, see it listed |
| F23 | med | Cross-module | Item 4: a PreToolUse `Bash` hook (`gate.sh`) already exists. A commit gate must coexist with it. A full multi-package `pnpm test` plus Docker-backed `*.it.test.ts` is slow and non-hermetic as a per-commit hook | `.claude/settings.json:3-13`; root `CLAUDE.md` (it tests need Docker); pending R2 | Plan task: match `git commit` only; run hermetic tests of the modules that own staged files; deny with the failing command; override marker logged like `# psr-skip` |
| F24 | med | Corner case | Item 1: `dependency-checker` already has 3 eval cases. If it was the lab sample, the stretch needs another of your own skills. Any target whose content sits in `reference/` (singular) loses that content in a content eval | `evals/skills/dependency-checker/*.cases.ts:40-82`; root `INSIGHTS.md:178-184`; pending R3 | Plan task: choose a self-authored skill whose output rules live in `SKILL.md`; 3–4 cases; break and restore once |
| F25 | low | Cross-module | Item 5: no mutation tool is installed anywhere. Adding one changes `server/pnpm-lock.yaml`. `server/src/modules/eval/scoring.ts` is pure and already has `scoring.test.ts`, which makes it a good target | Grep `stryker` → none; `server/src/modules/eval/scoring.test.ts`; pending R4 | Plan task: StrykerJS on `scoring.ts` only, then one test that kills one surviving mutant; record the survivor count |

### Approaches

**Grouping of the five items**
| Option | What | Touches | Size | Risk |
|---|---|---|---|---|
| G1 | One SPEC-09 for items 2+3 (both on the agent Evals tab); items 1, 4, 5 as three plan/doc tasks with no spec | spec: server, client, shared | M | low |
| G2 | Two specs: SPEC-09 Case Editor, SPEC-10 trend tooltip and Evals-tab chart; 1, 4, 5 as plan tasks | same, split | M (two review loops) | low |
| G3 | One spec for all five | spec + `evals/` + `.claude/` + a mutation tool | L | high: harness work cannot be traced by `plan-verifier` |

Recommendation: G1, since together they come to 9 `high` findings, under the cap of 10. Pick G2 if you want the trend chart shipped first (it is a contract field plus a moved component).

**Edit semantics for items 2/F4**
| Option | What | Touches | Size | Risk |
|---|---|---|---|---|
| A (smallest) | Edit in place; show "edited since last run" when `updated_at > latest run ran_at` | service, list | S | Compare still treats the edited case as "common" with its old self, so the deltas are wrong |
| B (reuse) | Changing diff, file, range or type saves a new case (new id, same name) and deletes the old one, reusing SPEC-08 delete semantics (AC-17, AC-18). Name and notes edit in place | service, repository | S–M | the case id changes; the case modal must follow the new id |
| C | `revision` column; the case set records `{id, revision}`; Compare matches on both | migration, contracts ×2, compare | M–L | migration on a populated table |

Recommendation: B. Pick C if you want one stable case id across edits, for example for case-level history later.

**Trend chart placement (item 3)**: move `MetricTrend` to `src/components/`, add the tooltip and focus targets, and render it on both the Evals tab and the detail page. No chart library: the kit `LineChart` is disqualified (`client/INSIGHTS.md:24-33`).

### Research requests (run one `researcher` per row, in parallel)
| ID | Question | Scope | Where to look | Unblocks |
|---|---|---|---|---|
| R1 | Does `upstream/full-functionality` contain a manual eval-case create/edit route or UI, or a skill-owned eval spec? If so, what are the request shape, the validation rules, and how does it treat edits to cases already scored in past runs? | repo | `git ls-tree -r --name-only upstream/full-functionality \| grep -i eval`; `git show upstream/full-functionality:specs/12-eval-pipeline.md` and any `specs/1[3-9]-*eval*`; its `server/src/modules/eval*/routes.ts` | F1, F3, F4, Q1, Q3 |
| R2 | Where are the "two ready PreToolUse hook examples" from the course template, and what do they do? Also, per the Claude Code hooks docs: when two PreToolUse hooks match the same Bash call, how are their decisions combined (does one deny win?), and what is the default command timeout? | both | `git branch -a`, `git ls-tree -r --name-only upstream/<l06*> -- .claude`; `git log --all -S PreToolUse --oneline`; https://code.claude.com/docs/en/hooks | F23 |
| R3 | Which `.claude/skills/*` skill did this fork author in L02, and was `evals/skills/dependency-checker/` added by the L06 lab merge or by this fork's own homework? | repo | `git log --diff-filter=A --format='%h %ad %s' -- .claude/skills/*/SKILL.md`; `git log --follow -- evals/skills/dependency-checker/dependency-checker.cases.ts`; `git log upstream/l06-evals -- evals/skills` | F24 |
| R4 | Does the current StrykerJS release with `@stryker-mutator/vitest-runner` support Vitest 2.x, ESM and tsconfig path aliases (`@devdigest/shared` → `../server/src/vendor/shared`)? Can it run via `pnpm dlx` without adding a dependency to `server/package.json`? | both | stryker-mutator.io docs (vitest-runner, TypeScript); `server/vitest.config.*`, `server/tsconfig.json` | F25 |

None of the blocking questions depends on these reports. R1 may refine F3/F4 but does not change their defaults.

### Questions for the user
Blocking:
- **Q1** Where do the Case Editor and the trend chart go: the **agent** Evals tab (shipped, where cases and runs exist), or the **skill** Evals tab from the screenshot (needs skill-owned cases and a way to run a skill, which SPEC-08 excluded)? My default: agent Evals tab; skill evals are a Non-goal.
- **Q2** Grouping: G1 (one SPEC-09 for 2+3; items 1, 4, 5 as plan/doc tasks with no spec), G2, or G3? My default: G1.
- **Q3** Edit semantics: approach A, B or C for changing a case's diff or expectation? And may cases created from findings have their diff and expectation edited? My default: B; finding-derived cases edit name and notes only.

Non-blocking (they go to `Open questions` unless answered):
- **Q4** Tooltip contents: version, date, recall/precision/citation, cost, model, "skills changed" marker? My default: all of these.
- **Q5** `Supersedes:` for SPEC-09? It changes SPEC-08 AC-14 (read-only modal) and EC-22 (empty-state copy), and reverses one SPEC-08 Non-goal. My default: `—`, listing the amended SPEC-08 IDs in Goals.
- **Q6** Trend window: keep 30 runs or raise it? My default: last 100 finished runs; errored runs are not plotted.
- **Q7** Pasted-diff size cap. My default: 100 KB → `422 diff_too_large`.
- **Q8** Add an "expect no findings at all" type (`empty []` in the mockup)? My default: no.
- **Q9** Per-row ▷ run of a single case? My default: no; it stays a Non-goal.

Reply with answers, or "accept defaults", or per-finding keep/drop (e.g. "F1 keep, F22 drop").

Self-check (Phase 1): all 9 items pass.
1. No file created or edited.
2. Insights line present: client and server for the touched modules, root because the work is cross-module.
3. Findings are one table and every row has evidence.
4. 9 `high` findings, sorted first within the product findings (F23–F25 are the harness-item rows, appended); 25 rows total, so no collapse needed.
5. F23–F25 say `pending R2`/`R3`/`R4`.
6. Four independent research requests.
7. `Supersedes: —`.
8. 3 blocking questions, all with defaults.
9. Repo claims carry paths. The running app was not inspected (no localhost given): "mock-only" for the screenshot controls is established from the code, not the live UI.

Key files:
- /Users/harlock/Downloads/Sites/devdigest/specs/08-eval-pipeline.md
- /Users/harlock/Downloads/Sites/devdigest/client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx
- /Users/harlock/Downloads/Sites/devdigest/client/src/app/skills/_components/SkillEditor/_components/EvalsTab/EvalsTab.tsx
- /Users/harlock/Downloads/Sites/devdigest/client/src/app/eval/agents/[agentId]/_components/MetricTrend/MetricTrend.tsx
- /Users/harlock/Downloads/Sites/devdigest/server/src/vendor/shared/contracts/knowledge.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/vendor/shared/contracts/eval-ci.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/frozen-input.ts
- /Users/harlock/Downloads/Sites/devdigest/.claude/settings.json

---

## Hand-back 2

I wrote the SPEC-09 draft: `/Users/harlock/Downloads/Sites/devdigest/specs/09-skill-evals.md` (Spec ID SPEC-09, Status: draft, Supersedes: —). The lint has not run: I have no shell, so you need to run `node .claude/skills/spec-authoring/scripts/lint-spec.mjs specs/09-skill-evals.md` and send me any errors. I also could not run `git show`, so the upstream design facts (carrier agent + two arms, routes, the 200 KB cap, error codes) come only from researcher R1. The spec's problem section says so.

**Counts:** 4 user stories, 42 AC, 34 EC, 15 NFR, 11 untrusted-input items, 16 open questions.

**Size:** this is past what one spec comfortably holds, because the user's Q1 answer (skill tab) adds a whole skill-run pipeline. I kept it as one spec and put the split question first (Q-1); the default there is a three-phase plan rather than two specs. Within the spec:
- **Primary surface** is the skill Evals tab (`/skills/:id?tab=evals`).
- **Case Editor:** paste a full diff or bare hunks, pick the file, live diff preview with the line range highlighted.
- **Edit rule (your answer B):**
  - Changing the diff, file, lines, type, PR title or description of a manual case saves a new case and deletes the old one.
  - Name, notes, severity and category edit in place.
  - Cases created from a finding can only change name and notes; anything else gets `422 case_input_locked`.
  - Finished runs never change (NFR-6).
- **Skill runs:**
  - The user picks a carrier: an agent linked to the skill.
  - Each case is reviewed twice, with and without the skill.
  - Each arm gets recall, precision and citation accuracy using SPEC-08's definitions, plus lift (with minus without) and a per-case effect: helped, hurt, no effect, errored.
  - Skill runs are kept out of every agent eval read and out of the agent "one running run" check (NFR-5).
- **Trend chart:**
  - One point per finished skill run, last 100, showing the with-skill arm's three metrics.
  - Tooltip: run date, skill version, carrier name and version, model, the three metrics, their lifts and the total cost of both arms.
  - Points are keyboard-focusable and Escape closes the tooltip.
- **SPEC-08 amendments**, listed in Goals (SPEC-08 itself is untouched):
  - the Non-goal on skill-owned cases and runs is reversed;
  - the Non-goal on "+ New eval case" from scratch is reversed for skills;
  - AC-14 (read-only case modal) is amended for manual cases;
  - EC-22 (empty-state copy) is amended for the skill tab only;
  - `EvalCaseMeta.pr_number` and `repo_full_name` become `.nullish()` in both vendor copies (NFR-10).
- **Unique index on the source finding:** left as it is. "Turn into eval case" for skills is a Non-goal, so skill cases are always manual and cannot collide (NFR-11, Q-11).
- **Non-goals** also name stretch items 1, 4 and 5 (the `evals/` skill eval, the commit hook, mutation testing) as out of scope, along with "expect no findings at all", per-row run, skill Compare and run history, the cost estimate, and cherry-picking upstream migrations.

**How the earlier findings landed:**
- F1, F4 and F5 are settled by your answers.
- F12 (moving the trend chart component to `src/components/`) now sits inside Q-3, since the agent-side chart is a follow-up.
- F17 and F19 are Non-goals.
- F22 (an e2e flow) was dropped; nothing in the spec requires one.
- F23–F25 are out, covered by the Non-goal line above.

**Open questions, with defaults:**
- **Q-1** Split the spec? Default: keep one spec and deliver it in three phases: (A) cases + Case Editor, (B) skill runner + list results + lift, (C) trend chart.
- **Q-2** Case Editor on the agent Evals tab? Default: yes, as a follow-up spec.
- **Q-3** Trend chart and tooltip on the agent tab, with `cost_usd` added to `EvalTrendPoint` and the shared chart component? Default: yes, in the same follow-up.
- **Q-4** Tooltip contents. Default: as written in AC-37.
- **Q-5** `Supersedes: —`, with the amended SPEC-08 items listed in Goals. Default: yes.
- **Q-6** Trend window. Default: 100 finished runs.
- **Q-7** Pasted-diff size cap. Default: 200 KB (the upstream value).
- **Q-8** "Expect no findings at all" type. Default: no.
- **Q-9** Per-row run of one case. Default: no.
- **Q-10** Carrier + two arms, or run the skill alone with a neutral prompt? Default: carrier + two arms.
- **Q-11** "Turn into eval case" for skills, which would need the unique index widened. Default: no.
- **Q-12** Filter the trend by carrier? Default: no; the tooltip names the carrier.
- **Q-13** Cost estimate in the run dialog? Default: no; show "{n} cases · {2n} reviews".
- **Q-14** Skill run history, run-detail modal and Compare? Default: not in this spec.
- **Q-15** Polling timeout for a skill run. Default: 20 minutes (twice SPEC-08's 10, since every case runs twice).
- **Q-16** Error codes. Default: keep this branch's `no_patch` and `range_outside_diff`, and adopt upstream's `frozen_diff_too_large`.

**Self-check: all 12 Phase 2 items pass, with one note on item 5.**
- **Item 1:** the only file I wrote is the spec, and its name prefix matches SPEC-09.
- **Item 2:** I re-checked the numbering just before writing; 08 is the highest.
- **Item 4:** all nine headings are present, verbatim and in order.
- **Item 5:**
  - A search for the lint's vague words finds hits only in user stories and open questions, which the lint does not check.
  - Each AC, EC, NFR and UI item has exactly one "(shall)".
  - Some items still describe a single atomic action as more than one verb: AC-15 (replace a case), EC-4, EC-11, EC-13 and EC-22.
- **Item 12:** requirements that rest on upstream facts follow the user's answers or R1 and are also open as questions (Q-7, Q-10, Q-16). None depends on a pending research item.

Run: node .claude/skills/spec-authoring/scripts/lint-spec.mjs /Users/harlock/Downloads/Sites/devdigest/specs/09-skill-evals.md

---

## Hand-back 3

I revised SPEC-09 to cover both owners (agents and skills) across your three phases; the lint has not been run yet. I have no shell, so please run `node .claude/skills/spec-authoring/scripts/lint-spec.mjs specs/09-*.md` and send me any errors. By hand I checked that no AC/EC/NFR/UI item contains a vague word from the lint list and none has two "(shall)".

**Path:** `/Users/harlock/Downloads/Sites/devdigest/specs/09-skill-evals.md` (SPEC-09, Status: draft, Supersedes: —). I did not rename the file: I cannot delete the committed `abb2287` file, so a rename would leave two SPEC-09 files. Only the title changed, to "Spec: Eval Case Editor, skill eval runs and metric trends". If you want `specs/09-eval-case-editor.md`, `git mv` it and the lint will still match prefix and ID.

**Counts:**
- 5 user stories. US-5 is new: turn a finding into a skill eval case.
- 58 AC and 45 EC.
- 16 NFR, including NFR-16: the existing agent Evals tab behaviour from SPEC-08 must not change.
- 12 untrusted-input items.
- Q-1 to Q-17: 14 live and 3 struck out (Q-2, Q-3, Q-11 are now requirements).

**IDs:** IDs from the first draft kept their meaning wherever it still held. New items are numbered on (AC-43 to AC-58, EC-35 to EC-45) and placed under their topic headings, so numbers within a section are not in order. The open questions kept their earlier numbers.

**Your decisions as written in:**
- **Replacement keeps its place:** a replaced case gets the old case's `created_at` (AC-15, AC-16). `PATCH` returns `replaced_from_id` (AC-47).
- **Lift:** stored raw, as an unrounded fraction (AC-30). Integer points are display-only (NFR-9).
- **Field limits:** severity and category use the Finding enums and apply only to `must_find`; EC-41 stores them as null otherwise. Notes ≤ 2,000 characters, description ≤ 5,000 (EC-5, UI-9).
- **Effect:** five values including `errored`. A case that errors in either arm is errored in both and left out of the lifts (AC-31, EC-16). "Scored" means scored in both arms (AC-2).
- **Opening a case:** a row click or the edit action opens the Case Editor. Cases made from a finding open read-only, with name and notes editable. Severity and category are now locked too (EC-6, EC-7, AC-13). "Created manually" shows for manual cases (AC-19). The range highlight is AC-8.
- **Smaller points:**
  - 204,800 bytes is checked on the client, and the server's 413 shows the same message (EC-1, EC-42).
  - CRLF is converted to LF (AC-46).
  - Compare returns 404 for a skill run id (EC-38).
  - NFR-2 counts `reviewPullRequest` calls: exactly two per case.
  - The progress counter is k = `cases_done` + 1 (AC-33).
  - The 409 details key is `run_id` (EC-14).
- **Finding → skill case** (AC-48 to AC-53, EC-35 to EC-37, EC-39, EC-43, EC-44):
  - `GET /findings/:id/eval-skills` reads the skills recorded for the review's run (`reviews.run_id` → `agent_run_skills`).
  - `POST /findings/:id/skill-eval-case` returns 201 for a new case, or 200 if the case already exists.
  - It rejects with 422 `skill_not_in_run` when the skill did not shape that review.
  - The menu text goes in `prReview.json` (NFR-7).
- **Agent side:**
  - **+ New eval case**, per-row edit and the empty state (EC-45): AC-43 to AC-45.
  - The trend chart with tooltip and `cost_usd`, on both the Evals tab and the detail page, window 100: AC-55 to AC-58.
- **Consent and migrations:** your consent to edit both vendor copies and generate migrations is stated in Goals and in NFR-10 and NFR-11. The index widens to (`owner_kind`, `owner_id`, `source_finding_id`).
- **SPEC-08 items amended** (listed in Goals): both Non-goals, AC-14, EC-22, AC-42, AC-57, and the `EvalCaseMeta` nullish change.
- **Contracts:** the proposed shapes are in a "Contracts" block under Inputs and provenance:
  - `EvalCaseInput`, `EvalCaseUpdate`, `EvalCaseEffect`, `EvalSkillCaseListItem`, `EvalLift`;
  - `EvalSkillRunRecord`, `EvalSkillTrendPoint`, `EvalSkillOverview`;
  - `EvalTrendPoint.cost_usd`, `EvalRunDetail` split by `owner_kind`;
  - `EvalFindingSkills` and the request bodies.

**Phase → ID map** (also a table in Goals):

| Phase | AC | EC | NFR | UI |
|---|---|---|---|---|
| A: Case Editor for both owners, finding → skill case, index widening | AC-1, AC-3, AC-5 to AC-19, AC-43 to AC-54 | EC-1 to EC-10, EC-29, EC-32 to EC-37, EC-39, EC-41 to EC-45 | NFR-1, 3, 7, 8, 10, 11, 14, 15, 16 | UI-1 to UI-3, UI-5, UI-8 to UI-12 |
| B: skill runner, `eval_runs` reshape | AC-2, AC-4, AC-20 to AC-35, AC-40 to AC-42 | EC-11 to EC-28, EC-30, EC-31, EC-38, EC-40 | NFR-2, 4, 5, 6, 9, 12, 13 | UI-4, UI-6, UI-7 |
| C: metric trends | AC-36 to AC-39, AC-55 to AC-58 | EC-28 (gaps), EC-30 (chart part) | — | — |

**Open questions, with defaults:**
- **Q-1** The spec is past the size guidance (58 AC and 45 EC across three features). Split into SPEC-09 (A), SPEC-10 (B) and SPEC-11 (C)? Default: keep one spec in three phases, as you decided; split only if plan review finds a phase cannot be verified on its own.
- **Q-4** Tooltip contents (AC-37, AC-56). Default: yes.
- **Q-5** `Supersedes: —`, with the amended SPEC-08 items listed in Goals. Default: yes.
- **Q-6** Trend window of 100 runs for both owners. Default: 100.
- **Q-7** Diff cap of 200 KB (204,800 bytes). Default: 200 KB.
- **Q-8** "Expect no findings at all" type. Default: no.
- **Q-9** Per-row ▷ run of one case. Default: no.
- **Q-10** Carrier + two arms. Default: yes.
- **Q-12** Filter the skill trend by carrier. Default: no.
- **Q-13** Cost estimate in the run dialog. Default: no.
- **Q-14** Skill run history, run-detail modal and Compare. Default: not in this spec.
- **Q-15** Skill run polling timeout. Default: 20 minutes.
- **Q-16** Keep `no_patch` and `range_outside_diff` for manual input, and adopt `frozen_diff_too_large`. Default: yes.
- **Q-17** Warn in the run dialog when the skill or its link to the carrier is disabled (upstream `gates_bypassed`). Default: yes.

**Self-check:** 11 of the 12 Phase 2 items pass and one could not be checked.
- **Item 2 (number):** fine, since this is the same SPEC-09 draft.
- **Item 5 (one EARS sentence per item):** passes on the lint rules (single "(shall)", correct triggers, no vague words). Some items still list more than one action in one sentence: AC-15 (replace), EC-1, EC-4, EC-11, EC-13, EC-22.
- **Item 6 (traceability):** five user stories, each served by at least one AC.
- **Item 12 (unverified facts):** no requirement rests on one. The upstream facts are from researcher R1 and your planner's firsthand check.
- **Not checked:** the lint itself, which you need to run.

---

## Hand-back 4

I applied all five fixes to `/Users/harlock/Downloads/Sites/devdigest/specs/09-skill-evals.md`. I could not run the lint (no shell); please run `node .claude/skills/spec-authoring/scripts/lint-spec.mjs specs/09-*.md`.

No existing ID was renumbered. Two IDs were added (AC-59, EC-46) and one question was struck (Q-17).

1. **Disabled skill or link warning**
   - **Contracts:** each `EvalSkillOverview.carriers[]` item is now `{ agent_id, name, version, model, enabled, link_enabled: boolean }`.
   - **EC-46 (new, Phase B):** the warning is its own edge case, kept beside EC-31 rather than added to AC-20/AC-21. When the skill's `enabled` is false or the chosen carrier's `link_enabled` is false, the run dialog shows "This skill or its link to {carrier} is disabled — the with-skill arm includes it anyway". It updates when the carrier choice changes, and the run is still allowed.
   - **Q-17** is struck through as "Dropped 2026-10-11 — default accepted and fixed in EC-46". It still keeps its `default:` text for the lint.

2. **Diff size cap**
   - **EC-1** now says the 204,800-byte check runs in the service, after the owner's `404` check and before the pasted diff is parsed. It is not in the request schema, and it returns `422 frozen_diff_too_large`.
   - **Contracts:** the byte cap is removed from `EvalCaseInput.input_diff`, with a comment pointing to EC-1.

3. **Latest result of a skill case**
   - **AC-59 (new, US-2 and US-3, Phase B)**, under "Read API (skill runs)": `GET /eval-cases/:id` for a skill-owned case returns `latest_result` with the with-skill arm's state, expected and got counts and error reason. Duration and cost are summed over both arms.
   - **Contracts:** an `EvalCaseDetail` note says the same.

4. **`owner_kind` and NFR-16**
   - **Contracts:** agent run responses gain `owner_kind: 'agent'` through the `EvalRunDetail` union. The change is additive.
   - **NFR-16** now says that SPEC-08 test assertions on the amended behaviours are expected to change: the read-only modal on row click, rename in that modal, "Source no longer available" for manual cases, and the empty-state copy.

5. **Equal-order tie in the with-skill list**
   - The skill list is built in **AC-24**, not AC-25 (AC-25 is the without-skill list), so the rule went there. The skill under test is placed after every other linked skill with the same link `order`.

**Also updated:**
- The Goals phase table, Phase B row, now lists AC-59 and EC-46.
- The size line in Q-1 now reads 59 AC and 46 EC.

**New totals:**
- 5 user stories
- 59 AC
- 46 EC
- 16 NFR
- 12 untrusted-input items
- 17 question IDs, of which Q-2, Q-3, Q-11 and Q-17 are struck through

**Self-check:**
- A check for vague words on the touched items found none.
- Every `(shall)` sits on its own item.
- Every struck question keeps its `default:`.