## Hand-back 1

## Plan verification: SPEC-09 Eval Case Editor, skill eval runs and metric trends (Pass 1 of 2)

Plan: `.claude/sdd/SPEC-09/plan.md`. Spec: `specs/09-skill-evals.md` (Status: draft, confirmed). Diff: `eefc3a4..working tree`, plus untracked files.

**Evidence legend** (paths relative to the repo root):
- Server code, under `server/src/modules/eval/`: `svc`=service.ts, `repo`=repository.ts, `hlp`=helpers.ts, `pd`=pasted-diff.ts, `arms`=arms.ts, `rt`=routes.ts.
- Server hermetic tests, same folder: `UT-pd`=pasted-diff.test.ts, `UT-arms`=arms.test.ts, `UT-par`=arms-prompt-parity.test.ts, `UT-svc`=service.test.ts, `UT-run`=service-skill-run.test.ts, `UT-hlp`=helpers.test.ts.
- Server Docker tests, under `server/test/`: `ITC`=eval-cases.it.test.ts, `ITS`=skill-eval.it.test.ts, `ITR`=skill-eval-runs.it.test.ts, `ITT`=eval-trend.it.test.ts, `ITE`=eval.it.test.ts. A number after the abbreviation is the `it()` line.
- Client, under `client/src/`:
  - `CE`=components/eval-case-editor/. `CET`=CE/CaseEditor/CaseEditor.test.tsx. `CEH`=CE/helpers.test.ts.
  - `ATab`=app/agents/[id]/_components/AgentEditor/_components/EvalsTab/ (`ATab.test`=EvalsTab.test.tsx there).
  - `STab`=app/skills/_components/SkillEditor/_components/EvalsTab/. `STT`=STab/EvalsTab.test.tsx.
  - `MT`=components/metric-trend/. `SEM`=app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/SkillEvalMenu/.
  - `HK`=lib/hooks/.

### Requirements traceability matrix

**Plan steps (Phase A)**
| # | Plan item | Status | Evidence |
|---|---|---|---|
| A1 | Contracts in both vendor copies, inside the eval regions | Pass | `knowledge.ts` L193/203 (nullish), L220 `replaced_from_id`, L259-344 (`EvalCaseInput`/`Update`/`Effect`/`SkillCaseListItem`/`FindingSkills`/`SkillEvalCaseRequest`). `diff server↔client` shows no difference inside the Eval regions (only pre-existing tour/AgentManifest drift). `eval-contract-parity.test.ts` passes. |
| A2 | Widen `eval_cases_source_finding_uq`, generated migration | Pass | `schema/eval.ts` L53-57. `migrations/0022_slimy_strong_guy.sql` is drop+create index only. `drizzle-kit check` returned "Everything's fine". |
| A3 | `constants.ts` codes, limits, `LOG`, `NOT_FOUND.skill` | Pass | `con` L12-17, L24 (`skill_not_in_run`, `case_input_locked`, `frozen_diff_too_large`, `no_agent_linked`), limits, `LOG.skillRun*`. |
| A4 | Pure `pasted-diff.ts` | Pass | `pd` L28 (cap), L33 (CRLF), L109 (canonicalize/wrap), L154 (freeze reuses `freezeFileDiff`). `extractFileDiff` untouched. `UT-pd` (all cases). |
| A5 | Owner-generalised repository | Pass | `repo` L312 (`insertCase` with `ownerKind`, nullable finding, notes, `createdAt`), L353-361, L405 (`updateCaseInPlace`), L427 (`replaceCase` transaction), L492 (`skillForEval`), L506 (`findingSkills`), L681 (`deleteBySkill`). |
| A6 | `classifyEdit` and DTO additions | Pass | `hlp` L543-578, `UT-hlp` "classifyEdit (AC-14, AC-15, EC-6, EC-41)". |
| A7 | Service methods and check order | Pass | `svc` L201 (`createManualCase`: 404, cap, parse, insert), L338 (`updateCase`), L232, L251, L123, L316 (`getCase`). `UT-svc` L138-231. |
| A8 | Routes | Pass | `rt` L57-243 (all 6 Phase-A routes present). `ITC`/`ITS`. |
| A9 | 413 handling in `app.ts` | Pass | `app.ts` L170-176 gives a stable `payload_too_large` code. `ITC:277`. |
| A10 | Skill delete cascade, cases | Pass | `skills/repository.ts` `deleteById(…, beforeDelete)`, `skills/service.ts` L165. `ITC:536`. |
| A11 | Case Editor, relocations, `highlightRange` | Pass (deviation) | `CE/**` (create / manual / finding modes). `CaseModal`, `DeleteCaseDialog`, `CaseStateLabel` moved to `components/`. `highlightRange` is on `DiffViewer` and `FileCard`. `CodeLine` has no `highlightRange` prop: `FileCard` computes membership and passes `highlighted` plus the new `scrollToHighlight`. Behaviour matches AC-8. |
| A12 | Hooks | Pass | `HK/eval.ts` (`useCreateAgentEvalCase`, `useUpdateEvalCase`, `caseSaveRejection` mapping 413 and the five 422s). `HK/skill-eval.ts` (new). `HK/eval.test.tsx` and `HK/skill-eval.test.tsx`. |
| A13 | Agent Evals tab | Pass | `ATab/EvalsTab.tsx`, `EvalCaseList.tsx` using shared `components/eval-case-row/EvalCaseRow.tsx`. `ATab.test` "SPEC-09 AC-43/AC-44/AC-13", "EC-45". |
| A14 | Skill Evals tab | Pass | `STab/EvalsTab.tsx`, `SkillCaseList`. `STT:203, 259, 270, 297`. |
| A15 | `SkillEvalMenu` | Pass | `SEM/SkillEvalMenu.tsx`, `FindingCard.tsx` (after `EvalCaseButton`), `SEM test` L71-145. |
| A16 | i18n | Pass | `eval.json`, `skills.json`, `prReview.json` diffs. My static scan of all `t("…")` keys in changed/new TSX found 0 missing keys. No hard-coded copy in new TSX. |

**Plan steps (Phase B)**
| # | Plan item | Status | Evidence |
|---|---|---|---|
| B1 | Skill-run contracts | Pass | `eval-ci.ts` L82 (`EvalAgentRunDetail`), L93 (`EvalLift`), L110, L159, L167 (union), L174, L183, L211. `server/test/contracts.test.ts` adds "skill eval runs (SPEC-09)". |
| B2 | `eval_runs` reshape, two generated passes | Pass | `0023_mighty_veda.sql` adds columns only. `0024_bouncy_sleepwalker.sql` has the constraints, partial uniques and `eval_runs_skill_ran_idx`. The pre-pass dev-DB row count is a process step with no evidence in the diff. |
| B3 | `buildArms`, `pairArms`, `computeLift`, `classifyEffects`, cost | Pass | `arms.ts` L33/68/99/111/128/144. These live in `arms.ts`, not `scoring.ts`, which is equivalent. `UT-arms` includes the tie rule at L87/96. |
| B4 | Repository: `owner_kind='agent'` predicates plus skill-run methods | Pass | `repo` L662-770 (agent predicates), L789-1000 (skill-run methods). `ITR:812`. |
| B5 | Service and routes for skill runs | Pass | `svc` L554 (`startSkillRun`), L634 (`executeSkillRun`, `isRunning` before each review), L699, L732, L806 (compare 404 for skill run). `rt` L137-160, L225-234. `UT-run`, `ITR`. |
| B6 | Client hooks, run dialog, run flow | Pass | `HK/skill-eval.ts` L100-190, `HK/eval-run-polling.ts`, `RunDialog.tsx`, `use-skill-eval-flow.ts`, `SkillEditor.tsx`, `RunStatus.tsx`. `STT:331-541`. |

**Plan steps (Phase C)**
| # | Plan item | Status | Evidence |
|---|---|---|---|
| C1 | `EvalTrendPoint.cost_usd` | Pass | `eval-ci.ts` L242, identical in both copies. |
| C2 | `TREND_LIMIT` 100, `cost_usd`, scalar reads, 500 ms | Pass | `con` L63, `hlp` L252-262. `ITT:205, 256, 292`. |
| C3 | Shared `MetricTrend`, tooltip, three consumers, a11y behaviours | **Fail (partial)** | Move, generalisation, gaps, 24 px targets, Tab focus, `AgentMetricTrend` and `SkillMetricTrend` are all done (see AC-36/38/55-57). But "Escape/blur/pointer-leave close tooltip" is incomplete. See **F1**. |

**AC rows**
| # | Status | Evidence |
|---|---|---|
| AC-1 | Pass | STab/EvalsTab.tsx, `STT:203` |
| AC-2 | Pass | STab/helpers.ts `passingCounts`, `STab/helpers.test.ts:47`, `STT:331` |
| AC-3 | Pass | `STT:203`, EvalCaseRow.tsx |
| AC-4 | Pass | `STT:331, 347` |
| AC-5 | Pass | `CET:112`, `CEH` `emptyDraft` |
| AC-6 | Pass | `CET:112`, `CEH:74, 85` |
| AC-7 | Pass | `CET:163`, `CEH:80` |
| AC-8 | Pass | `CET:112`, `CEH:92`, `FileCard.test` "SPEC-09 AC-8" |
| AC-9 | Pass | `ITC:199`, `CET:163` |
| AC-10 | Pass | `ITC:165`, `UT-pd:110`, `pd` L154 |
| AC-11 | Pass | `ITC:139`, `UT-hlp` `buildManualMeta` |
| AC-12 | Pass | `STT:270`, `CET:112` |
| AC-13 | Pass | `CET:262`, `STT:297`, `ATab.test` AC-43/44/13 |
| AC-14 | Pass | `ITC:353, 374, 383`, `UT-svc:198`, `UT-hlp` `classifyEdit` |
| AC-15 | Pass | `ITC:401, 427`, `UT-svc:198` |
| AC-16 | Pass | `ITC:401` (same `created_at`), `HK/eval.test.tsx` "AC-47/AC-16" |
| AC-17 | Pass | `STT:297` |
| AC-18 | Pass | `STT:297`, `HK/eval.test.tsx` "AC-18" |
| AC-19 | Pass | `CET:262`, `ATab.test` AC-43/44/13 |
| AC-20 | Pass | `STT:383, 410`, RunDialog/helpers.ts |
| AC-21 | Pass | `STT:383` |
| AC-22 | Pass | `ITR:352`, `HK/skill-eval.test.tsx:187` |
| AC-23 | Pass | `ITR:352`, `UT-run:229` |
| AC-24 | Pass | `UT-arms:41-114` (tie rule at 87/96), `ITR:412` |
| AC-25 | Pass | `UT-arms:42, 77`, `ITR:412` |
| AC-26 | Pass | `UT-run:229`, `ITR:352` |
| AC-27 | Pass | `UT-par:104-147`, `UT-run:260` |
| AC-28 | Pass | `UT-run:271`, `ITR:352` |
| AC-29 | Pass | `UT-run:271`, `UT-arms:222` |
| AC-30 | Pass | `UT-arms:254`, `ITR:352` |
| AC-31 | Pass | `UT-arms:312`, `ITR:352` |
| AC-32 | Pass | `UT-run:271, 294`, `ITR:441` |
| AC-33 | Pass | `STT:462`, `RunStatus.test.tsx:42` |
| AC-34 | Pass | `STT:473`, `RunStatus.test.tsx:49`, `HK/skill-eval.test.tsx:219` |
| AC-35 | Pass | `STT:331`, `STab/helpers.test.ts:17` |
| AC-36 | Pass | `STT:485`, `SkillMetricTrend.test.tsx:32` |
| AC-37 | Pass | `STT:485`, `SkillMetricTrend.test.tsx:32` |
| AC-38 | Pass | `MT/MetricTrend/MetricTrend.test.tsx:53` |
| AC-39 | **Fail (partial)** | See **F1**. `MT/MetricTrend/MetricTrend.test.tsx:73` covers only the focus and Escape path. |
| AC-40 | Pass | `ITR:742` |
| AC-41 | Pass | `ITR:614, 677` |
| AC-42 | Pass | `ITR:700`, `contracts.test.ts` |
| AC-43 | Pass | `ATab.test` "AC-43/AC-44/AC-13" |
| AC-44 | Pass | `ATab.test` "AC-43/AC-44/AC-13" |
| AC-45 | Pass | `ITC:139` |
| AC-46 | Pass | `ITC:165`, `UT-pd:55-60`, `UT-svc:166` |
| AC-47 | Pass | `ITC:401` (id), `ITC:353` (null) |
| AC-48 | Pass | FindingCard.tsx (`skillEval && <SkillEvalMenu>` after `EvalCaseButton`), `SEM test:88` |
| AC-49 | Pass | `ITS:249`, `SEM test:88` |
| AC-50 | Pass | `ITS:249, 282`, `SEM test:88` |
| AC-51 | Pass | `ITS:249` |
| AC-52 | Pass | `SEM test:88`, `HK/skill-eval.test.tsx:117` |
| AC-53 | Pass | `ITS:188, 218` |
| AC-54 | Pass | `ITC:199, 219` |
| AC-55 | Pass | `ATab.test` "AC-55/AC-56/EC-27", `AgentMetricTrend.test.tsx:27` |
| AC-56 | Pass | `ATab.test`, `EvalAgentDetailView.test.tsx` |
| AC-57 | Pass | `EvalAgentDetailView.test.tsx` (AC-56/AC-57), `ITT:256` |
| AC-58 | Pass | `ITT:205, 292`, `ITE:1046` |
| AC-59 | Pass | `ITR:777, 794` |

**EC rows**
| # | Status | Evidence |
|---|---|---|
| EC-1 | Pass | `UT-svc:138, 148, 159`, `ITC:250, 264, 451`, `CET:181` |
| EC-2 | Pass | `ITC:291`, `UT-pd:147`, `CET:201` |
| EC-3 | Pass | `ITC:308`, `UT-pd:168`, `CET:201` |
| EC-4 | Pass | `ITC:322`, `CET:181`, `CEH:115` |
| EC-5 | Pass | Zod `knowledge.ts` L259-290. `ITC:322` exercises only name and line cases. `CEH:158` covers all client limits. Server title/description/notes/path caps rest on the schema alone. |
| EC-6 | Pass | `ITC:464`, `UT-hlp` `classifyEdit`, `CET:311` |
| EC-7 | Pass | `CET:311` |
| EC-8 | Pass | `CET:237` |
| EC-9 | Pass | `HK/eval.test.tsx` "EC-1..EC-6/EC-42" (5xx still throws). EditorModal.tsx closes only on `kind: 'saved'`. No editor-level network-error test. |
| EC-10 | Pass | `ITR:1007`, `svc` L554-632 (cases read once) |
| EC-11 | Pass | `ITR:471`, `SkillEditor.test.tsx` "keeps Run on evals disabled…" |
| EC-12 | Pass | `ITR:471`, `UT-run:215` |
| EC-13 | Pass | `ITR:471`, `STT:374` |
| EC-14 | Pass | `ITR:502`, `HK/skill-eval.test.tsx:200` |
| EC-15 | Pass | `ITR:502, 554` |
| EC-16 | Pass | `UT-run:294`, `ITR:441`, `UT-arms:176` |
| EC-17 | Pass | `UT-run:310`, `ITR:459`, `RunStatus.test.tsx:57` |
| EC-18 | Pass | `ITR:1052` |
| EC-19 | Pass | `HK/skill-eval.test.tsx:247`, `RunStatus.test.tsx:63` |
| EC-20 | Pass | `HK/skill-eval.test.tsx:267`, `RunStatus.test.tsx:68` |
| EC-21 | Pass | `ITR:575` |
| EC-22 | Pass | `ITR:575` |
| EC-23 | Pass | `ITR:963`, `ITC:536`, `ITS:427` |
| EC-24 | Pass | `ITR:982`, `UT-run:355-385` |
| EC-25 | Pass | `UT-arms:303`, `ITR:651` |
| EC-26 | Pass | `UT-arms:283, 295`, `STab/helpers.test.ts:31` |
| EC-27 | Pass | `UT-arms:341-362`, `ITR:777`, `ITT:205` |
| EC-28 | Pass | `ITR:651`, `MetricTrend.test.tsx:112`, `SkillMetricTrend.test.tsx:32`, `AgentMetricTrend.test.tsx:27` |
| EC-29 | Pass | `STT:259` |
| EC-30 | Pass | `STT:367, 541`, `ATab.test` "EC-30" |
| EC-31 | Pass | `STT:419` |
| EC-32 | Pass | `ITC:186, 233, 506`, `ITS:233, 324`, `ITR:900` |
| EC-33 | Pass | `title` attrs in EvalCaseRow.tsx and SkillEvalMenu.tsx, `STT:203`, `SEM test:88` |
| EC-34 | **Unverified** | No test renames to a duplicate name. Static read: no name-uniqueness check in `svc.updateCase` and no unique index on `eval_cases.name`, so it likely holds. |
| EC-35 | Pass | `ITS:292`, `SEM test:71` |
| EC-36 | Pass | `ITS:206`, `SEM test:80` |
| EC-37 | Pass | `ITS:303, 315`, `SEM test:120` |
| EC-38 | Pass | `ITR:812` |
| EC-39 | Pass | `ITS:372`, `UT-svc:223` |
| EC-40 | Pass | `ITR:812` |
| EC-41 | Pass | `UT-hlp` `effectiveExpectation`, `UT-svc:166`, `CEH:192` |
| EC-42 | Pass | `ITC:277`, `CET:201` |
| EC-43 | Pass | `ITS:386, 415` |
| EC-44 | Pass | `ITS:355`, `SEM test:120` |
| EC-45 | Pass | `ATab.test` "EC-22/EC-45", "SPEC-09 EC-45" |
| EC-46 | Pass | `STT:419, 449`, `ITR:614` (`link_enabled`) |

**NFR rows**
| # | Status | Evidence |
|---|---|---|
| NFR-1 | Pass | `UT-svc:231`, `ITC:566`, `ITS:445`, `ITR:1035` |
| NFR-2 | Pass | `UT-run:260`, `UT-par:139` |
| NFR-3 | Pass | Every query in the new `repo` methods carries `workspaceId`. `ITR:900`, `ITC:186/233/506`. |
| NFR-4 | Pass | `ITR:352` (no writes to review tables) |
| NFR-5 | Pass | `ITR:812, 883`, `ITT:205, 256`, partial uniques in `0024` |
| NFR-6 | Pass | `ITR:1007` |
| NFR-7 | Pass | My static key scan found 0 missing keys. Hard-coded strings only in pre-existing `CodeLine.tsx`. No dedicated key-coverage test (see T3). |
| NFR-8 | **Unverified** | Only the 24 px target is tested (`MetricTrend.test.tsx:103`). Contrast, visible focus, and targets on the other controls have no check. |
| NFR-9 | Pass | `eval-format.test.ts` (formatLiftPoints), `STab/helpers.test.ts:18, 26` |
| NFR-10 | Pass | Parity test passes. Both copies are identical in the Eval regions. `.nullish()` at `knowledge.ts` L193/203. |
| NFR-11 | Pass | `0022` (index), `0023` (add columns), `0024` (constraints); drizzle-kit check OK |
| NFR-12 | Pass | `UT-run:333` |
| NFR-13 | Pass | `ITR:1073`, `ITT:292` |
| NFR-14 | Pass | My grep of all changed/new files for real-looking `sk_live_`/`sk-`/`ghp_`/`AKIA` found none. |
| NFR-15 | Pass | Hermetic: `UT-pd`, `UT-arms`, `UT-hlp`. Docker: `ITC`, `ITS`, `ITR`, `ITT`, all with `dockerAvailable` + `describe.skip`. |
| NFR-16 | Pass | See T4. |

**UI rows** (the security-reviewer report was not supplied, so no security verdict is rendered; mechanical checks only)
| # | Status | Evidence |
|---|---|---|
| UI-1 | Pass | `UT-par:104-147` (both arms through `reviewFrozenCase`, only the skill block differs) |
| UI-2 | Pass | `UT-par:147` |
| UI-3 | Pass | `CET:262` (escaped text). `DiffPreview` and `ReadOnlyCase` render through `DiffViewer` and React text. |
| UI-4 | Pass | `arms.ts`, `STT:419` (injection warning) |
| UI-5 | Pass | `pd` L28, `UT-svc:148`, `ITC:250` |
| UI-6 | Pass | Response Zod schemas in `rt.ts`. The engine already validates and redacts. |
| UI-7 | Pass | React text rendering (RunDialog, trend tooltip, case list) |
| UI-8 | Pass | Path stored via Drizzle bound params. Never used as a filesystem or shell argument. `ITC:139`. |
| UI-9 | Pass | Zod limits at `knowledge.ts` L259-290, `ITC:322` |
| UI-10 | Pass | `IdParams`, `SkillEvalRunRequest`/`SkillEvalCaseRequest` use `.uuid()`. `ITS:344`. |
| UI-11 | Pass | `svc` `insertFindingCase` reuses `freezeFileDiff`, `ITS:249` |
| UI-12 | **Unverified** | Placeholder-secret half passes (NFR-14 scan). "Copy no upstream code without review" is a process claim with no evidence in the diff. |

**Test plan and decision rows**
| # | Plan item | Status | Evidence |
|---|---|---|---|
| T1 | Hermetic server tests (pasted-diff, edit rules, arms/lift/effect/cost, D7 parity, NFR-1, contracts) | Pass | `UT-pd`, `UT-hlp`, `UT-arms`, `UT-par`, `UT-svc`, `UT-run`, `contracts.test.ts` |
| T2 | Docker integration tests | Pass | `ITC`, `ITS`, `ITR`, `ITT` (68 tests) |
| T3 | Client tests: CaseEditor, helpers, `highlightRange`, both tabs, menu, run flow, trend, 24 px, **next-intl key coverage** | **Fail (minor)** | Everything exists except a dedicated next-intl key-coverage test (none found in `client/src`). `highlightRange` is tested at `FileCard` level only, not `DiffViewer`. My own scan found no missing keys. |
| T4 | NFR-16: existing agent-tab, dashboard and finding-card tests pass without assertion edits | Pass | Client suite 663/663. Edits are limited to `ATab.test` (EC-22→EC-45 sentence plus added tests), type/fixture edits (`RunAllEvals`, `RunDetailModal`, `EvalAgentDetailView` `cost_usd`), a `FindingsPanel.test` mock, and a `SkillEditor.test` QueryClient wrapper. The plan's other expected edits (row-click read-only modal, "Source no longer available") needed none. |
| T5 | "Leave `eval.it.test.ts` unedited" | Pass (known, accounted) | `ITE` has 3 hunks, all trend ≤30→100 expectations (L1047, L1072, L1471). The caller listed this as intended. |
| T6 | Skills the implementer applies (routing.json table) | **Unverified** | No transcript evidence of skill application is available in the diff. |
| T7 | Consent: both vendor copies in one change; migrations generated, never edited | Pass | Parity test; `drizzle-kit check` clean; snapshots and journal present for 0022-0024. Not yet committed (working tree), so "same commit" is not yet checkable. |

### Failures to fix (Pass 1)
- **F1 — AC-39 and C3** (`client/src/components/metric-trend/MetricTrend/MetricTrend.tsx`, `onKeyDown` L134, `onPointerLeave` on `.plot` L68, `onPointerEnter` L131).
  - The Escape handler sits only on the focused target button. A tooltip opened by hover alone (no focus) is not closed by Escape.
  - The pointer-away handler is on the whole plot container. Moving the pointer off a point into the empty part of the plot leaves the tooltip open until the pointer exits the chart.
  - AC-39 reads "presses Escape or moves focus or the pointer away → close". `MetricTrend.test.tsx:73` covers only the focus and Escape path.
- **F2 — T3** (minor): the next-intl key-coverage test the plan lists was not written.

### Gates re-run (my own runs)
- `./scripts/check.sh server typecheck|lint|arch|test` — pass; hermetic 798 passed. Re-ran `pnpm typecheck` directly in `server/` — exit 0.
- `./scripts/check.sh client typecheck|lint|arch|test` — pass; 663 passed. Re-ran `pnpm typecheck` directly in `client/` — exit 0.
- `./scripts/check.sh core typecheck|test` — pass; 69 passed.
- `cd server && pnpm exec vitest run test/eval-cases.it.test.ts test/skill-eval.it.test.ts test/skill-eval-runs.it.test.ts test/eval-trend.it.test.ts test/eval.it.test.ts` — 5 files, 107 tests, all passed (Docker up).
- `cd server && pnpm exec vitest run .it.test` (full Docker suite) — 255 passed, 5 failed. All 5 match the `state.json` baseline: `skills-stats.it.test.ts` ×4 and `skills.it.test.ts` "404s for an unknown skill and an unknown version". The flaky `context-run` and `onboarding-tour` tests passed this time. Nothing outside the baseline failed.
- `cd server && pnpm exec drizzle-kit check` — "Everything's fine". It wrote nothing.

### Not covered by the plan (unverified, out of scope for this check)
- `lone CR → LF` in `pd.normalizeNewlines` is broader than the spec's "CRLF → LF". Harmless.
- `useRenameEvalCase` was removed from `HK/eval.ts`, replaced by `useUpdateEvalCase`. Typecheck shows no remaining consumers.
- `EvalSkillRunRequest` is an alias of `SkillEvalRunRequest` in the contracts (spec and plan use different names).
- An empty untracked directory `client/src/app/eval/agents/[agentId]/_components/MetricTrend/` remains after the move.
- The Pass 1 "skill under test vs `severity` casing" check found no issue: `Severity` is uppercase, so `CRITICAL · security` renders as the spec says.

### Verdict
- Plan steps: 24/25 Pass (A11 with a noted deviation). 1 Fail (C3, partial, F1). B2's dev-DB row-count pre-check is a process step with no evidence.
- Spec IDs (133): 129 Pass, 1 Fail (AC-39), 3 Unverified (EC-34, NFR-8, UI-12).
- Test-plan and decision rows (7): 5 Pass, 1 Fail (T3, minor), 1 Unverified (T6).
- All gates are green. The only red tests are the 5 known baseline failures.

### Spec status
Not ready for `implemented`: AC-39 Fail, EC-34, NFR-8 and UI-12 Unverified. The status stays `draft`, as you noted. I did not edit the spec.