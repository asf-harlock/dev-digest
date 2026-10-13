## Hand-back 1

## Repository Research: does any upstream or other ref implement per-case "Run case", "Run on save", "Actual output", an Expected-output JSON editor (`[]` = negative case) or "Finding skeleton" in the eval case modal?

### Conclusion
Partly. `upstream/full-functionality` has none of it. Its case editor has no Run case, no Run on save, no Actual output, no Expected-output JSON editor and no Finding skeleton, and no endpoint runs a single case. The only ref with a per-case "Run case" button, an Expected-output JSON textarea, a `POST /eval-cases/:id/run` endpoint and `[]` handling is the older reference build `upstream/reference/full-build` (it also contains root commit `2ba3303`). Even there, the strings "Run on save", "Actual output" (as a UI label), "Finding skeleton" and "Never run yet" do not exist. The "Run on save" behaviour is partly present as save-then-run inside the Run case click handler.

### Findings

**1. Refs searched** (`git branch -a` and `git remote -v`; remotes are `origin` = asf-harlock/dev-digest and `upstream` = ai-agentic-engineering-neo/dev-digest):
- `git log --all -i -S 'Run on save'` returned one commit only: `c7ff3d0` "docs(specs): add SPEC-08 eval pipeline" (2026-10-11), local-only. It sits on `L06-homework`, `L06-homework-stretch` and their `origin/` copies.
- `git log --all -i -S 'Finding skeleton'` returned one commit only: `ab47b7e` "spec(eval-pipeline): add SPEC-12 for L06 eval pipeline feature". It is on `upstream/full-functionality` and `upstream/fix/numbered-diff-line-citations` only.
- `git log --all -i -S 'Never run yet'` returned nothing. `-S 'Actual output'` hits only unrelated agent/skill docs (`d76362f`, `a6526f6`, `2ba3303`).
- `git grep -n -i -E 'Actual output|Run on save|Finding skeleton|Never run yet'` was run on `upstream/full-functionality`, `upstream/reference/full-build`, `upstream/integration/all-features`, `upstream/l06-evals`, `upstream/evals-example`, `upstream/main`, `upstream/Lesson-06-lab-finish`, `origin/main`, `origin/L06-homework`, `HEAD` and `HEAD~3`.
  - Only prose hits. None are UI strings: the spec line quoted below, `reference/full-build:.claude/skills/excalidraw-diagram/SKILL.md:81`, and `reference/full-build:server/src/modules/eval/service.ts:27`.
- I did not individually grep every other branch (demo/*, lesson-N-lab/*, emdash/*, feat/*). The `--all` `log -S` runs cover all refs for these strings.

**2. `upstream/full-functionality`: spec exists, no such UI**
- `specs/12-eval-pipeline.md` exists on upstream (895 lines, added by `ab47b7e`). The only hit for the strings is a design sentence at line 318 ("output as a free JSON array of finding skeletons. Free JSON plus a code scorer…"), which is a rejected design alternative, not a feature. Line 318 is only a grep hit; I did not read the surrounding context.
- Single-case run: there is no route for it. `server/src/modules/eval/routes.ts` has `POST /agents/:id/eval/runs` (set-level) and `POST /eval/runs/all`, and no `/eval-cases/:id/run` or `/eval/cases/:id/run`. The client hooks (`client/src/lib/hooks/eval.ts:232,247`) match.
- A case carries exactly one expectation object (`type` is `must_find` or `must_not_flag`, plus `file` / `start_line` / `end_line`, per `server/src/modules/eval/scoring.ts:42-66`), not a JSON array. The panel `client/src/components/eval-case-editor/CaseEditorPanel.tsx` uses structured fields (the keys `expectationType`, `expectationFile`, `expectationStartLine` and `caseEditorPanel.outcomeTitle` in `client/messages/en/eval.json`). Nothing in it triggers a run.
- Leftover i18n keys: `client/messages/en/eval.json:44` defines `caseEditor.runCase: "Run case"`, with `expectedOutput`, `validJson`, `lastRunPassed` and `resultSummary` next to it. My grep for `caseEditor.runCase` in `client/src` on this ref found no use, so they are dead strings inherited from the old build.
- "got M" equivalent: only `evalsTab.matchedCount` = "{matched} of {total} findings matched" (`eval.json:86`), used at `CaseEditorPanel.tsx:283` and `CaseRow.tsx:66`. It is `findings_matched` / `findings_total` per case, where `findings_matched = actual.filter(f => f.matched).length` (`scoring.ts:65`). The text "got M" does not occur anywhere.
- Scoring (`scoring.ts:66`): `must_find` passes if `matchedCount > 0`; `must_not_flag` passes if `matchedCount === 0`. There is no `[]` convention here. A negative case is `type: 'must_not_flag'` with a file/line range.

**3. `upstream/reference/full-build` (tip `df74ee7`; the feature is also in root `2ba3303`): per-case run exists**
- Endpoint: `POST /eval-cases/:id/run`, no request body. It is defined at `server/src/modules/eval/routes.ts:79` and called by the `useRunEvalCase` hook at `client/src/lib/hooks/eval.ts:90` (`api.post<EvalRunResult>(`/eval-cases/${id}/run`)`).
- Response is `EvalRunResult` (`server/src/vendor/shared/contracts/eval-ci.ts:49-54`): `{ run_id, case_id, result: EvalRun }`. `result` carries `recall`, `precision`, `citation_accuracy`, `traces_passed` (0 or 1), `traces_total: 1`, `duration_ms`, `cost_usd`, and `per_trace: [{ name, pass, expected, actual }]` (`service.ts:103-146`).
- Other routes in the same file (`routes.ts:11-18, 43-89`): `GET/POST /eval-cases`, `GET/PUT/DELETE /eval-cases/:id`, `POST /agents/:id/eval/run-all` and `GET /eval/dashboard`. Create/update body is `EvalCaseInput` (`eval-ci.ts:19-28`): `owner_kind`, `owner_id`, `name`, `input_diff`, `input_files?`, `input_meta?` (`{title, body}`), `expected_output` (unknown), `notes?`.
- Persistence: `EvalService.runCase` (`service.ts:103`) runs the owning agent on `input_diff`, grounds the findings, scores them, then calls `repo.insertRun` (`service.ts:116`) to insert one `eval_runs` row per click. The row holds `actualOutput: { verdict, score, findings: actual }` (grounded findings only, `service.ts:118`), `pass`, `recall`, `precision`, `citationAccuracy`, `durationMs` and `costUsd`. The table is `server/src/db/schema/eval.ts:22-28` (`actual_output` jsonb). The "last run" on the case list comes from the newest `eval_runs` row (`listCases`, via `runToRecord` in `dashboard.ts`).
- Editor UI is `client/src/app/agents/[id]/evals/[caseId]/_components/EvalCaseEditor/EvalCaseEditor.tsx`:
  - The "Run case" button is at line 102-103 (`caseEditor.runCase`, switching to `running` while pending).
  - The left pane has Diff and PR-meta tabs. The right pane has the "Expected output" label (line 160), a valid/invalid JSON badge (162-166) and a textarea (170-173).
  - Run result is a banner "Last run passed/failed · recall% precision% citation% duration $cost" (about line 175 on). This is the only "result" display. There is no "Actual output" panel.
- Save-then-run ("Run on save"-like): `doRun` (lines 79-90) creates the case if it is new, otherwise PUTs the current form values, then calls `run.mutateAsync(id)`. So every Run click saves first. No separate "Run on save" toggle or label exists.
- What `[]` means for scoring (`server/src/modules/eval/scoring.ts` at the ref tip):
  - The editor defaults the textarea to `"[]"` (line 41), and invalid JSON silently falls back to `[]` on save (line 66).
  - `expectedFindings()` (`helpers.ts`) turns `[]`, or any non-array or non-`{findings:[]}` value, into an empty list.
  - `score()`: if expected and actual are both empty, recall, precision and citation are all 1. If expected is empty and the agent returned findings, recall = 1 (because `actual.length === 0` is false, `expected.length ? ... : actual.length === 0 ? 1 : 0` gives 0). Correction: recall = 0 and precision = 0 in that case, since `matched = 0` and `actual.length > 0`. Pass is `recall === 1 && precision === 1` (`service.ts:114`), so `[]` passes only when the agent produces zero grounded findings. This is the practical "must not flag anything" behaviour. There is no explicit must_not_flag type in this build.
  - Citation is `actual.length / rawCount`, where `actual` is the grounded findings and `rawCount` is the raw model finding count.
- "got M" counting: there is no such label. The nearest equivalent is the number of grounded findings in `actualOutput.findings` (`actual.length`). It is used as the precision denominator and in `citation_accuracy`. `matched` is counted greedily, one actual finding per expected finding (`usedActual` set). A match requires the same normalised file AND (overlapping line range OR a case-insensitive title substring match), with a weak severity/category fallback when the expected finding has neither line nor title.

**4. Local state**
- Local `HEAD` (`L06-homework-stretch`, which includes SPEC-09 `43d8e2c`) has no such UI. `specs/08-eval-pipeline.md:83` and `specs/eval-pipeline.md:83` list "a per-case run, **Run case**, **Run on save**, or **+ New eval…**" under "Not doing", and the surrounding spec text is why those strings appear in `c7ff3d0`. They are explicit non-goals locally, not features.

### Evidence
- `upstream/reference/full-build:server/src/modules/eval/routes.ts:79` — `POST /eval-cases/:id/run`
- `upstream/reference/full-build:server/src/modules/eval/service.ts:103-146` — `runCase` scoring, `insertRun` at line 116, and `pass` at line 114
- `upstream/reference/full-build:server/src/modules/eval/scoring.ts` — `score()` and `findingMatches()`
- `upstream/reference/full-build:server/src/modules/eval/helpers.ts` — `expectedFindings()`
- `upstream/reference/full-build:server/src/vendor/shared/contracts/eval-ci.ts:19-54` — `EvalCaseInput`, `EvalRunRecord` and `EvalRunResult` contracts
- `upstream/reference/full-build:client/src/lib/hooks/eval.ts:90` — client call to the run endpoint
- `upstream/reference/full-build:client/src/app/agents/[id]/evals/[caseId]/_components/EvalCaseEditor/EvalCaseEditor.tsx:41,66,79-90,102-103,160-173` — editor behaviour
- `upstream/reference/full-build:server/src/db/schema/eval.ts:22-28` — `eval_runs` table
- `upstream/full-functionality:server/src/modules/eval/routes.ts` — no single-case run route
- `upstream/full-functionality:server/src/modules/eval/scoring.ts:53-66` — pass/fail logic and `matchedCount`
- `upstream/full-functionality:client/messages/en/eval.json:44,86` — `runCase` key and `matchedCount` key
- `upstream/full-functionality:specs/12-eval-pipeline.md:318` — the only "finding skeletons" hit
- git `ab47b7e` "spec(eval-pipeline): add SPEC-12…" (2026-08-19) — only commit containing "Finding skeleton"
- git `c7ff3d0` "docs(specs): add SPEC-08 eval pipeline" (2026-10-11) — only commit containing "Run on save", as an explicit non-goal
- git `2ba3303` "initial commit: client, server, mcp as standalone projects" (2026-06-03) — origin of the `caseEditor.runCase` string and the `EvalCaseEditor`. Branches containing it include `upstream/reference/full-build`, `upstream/demo/security-review-fixture` and `upstream/fix/review-inline-line-422`.

### Could not determine
- The surrounding context of `specs/12-eval-pipeline.md:318` (I only saw the grep line), so I can't say exactly what design alternative it rejects.
- I did not trace git history to see precisely when and why the per-case run was dropped between `reference/full-build` and `full-functionality`/local (the local snapshot `587c46a` is a squash). Likely the set-level redesign in SPEC-12 D2 ("a run is set-level") replaced it. Spec D2 is at lines 159-170 of `specs/12-eval-pipeline.md`.
- "Run on save", "Actual output" (as a panel), "Finding skeleton" and "Never run yet" appear in no UI code on any ref. If those labels come from a design mockup (Figma/JSX) rather than this repo, they would need to be checked there.