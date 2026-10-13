## Hand-back 1

## Test-writing report: SPEC-10 B17-B18 (W4-B) plus skipped A19-A20

All new server and client tests pass. I found no implementation bugs that fail a test, and I changed no source files. One minor observation is under Findings.

### Tests added
All paths are absolute under `/Users/harlock/Downloads/Sites/devdigest`. Skills applied: `backend` bucket (onion-architecture, fastify-best-practices, zod, security, typescript-expert) for server files; `frontend` bucket plus `react-testing-library` for `*.test.tsx`.

**Server (new files)**
- `server/src/modules/eval/case-run.test.ts` (hermetic, 29 tests)
  - `pickLatestSource`: later case run wins, older loses to the set run, either side alone, tie goes to the set run.
  - `sourceOutcomes`: passthrough, errored placeholder with `runErrorReason`, `runDurationMs` and `CASE_ERROR_FALLBACK`, paired and unpaired.
  - `toRunningCaseRun`, `toFrozenCase`, `scope` in `toRunRecord`, `summaryFromRow`, `toSkillRunRecord` and `skillSummaryFromRow`.
  - `toLatestResult` with a `findings`-less outcome gives `null`.
  - `startCaseRun` with a fake repo and a mock LLM: 404 case, 422 skill case without carrier, 404 carrier, `no_agent_linked`, insert gets `scope:'case'` plus a one-case `caseSet`, `casesForRun` is never read, disabled agent still runs, LLM called 1x (agent) and 2x (skill).
  - A skill deleted mid-run: no second-arm call and no error log. Log lines contain no diff, prompt, PR title, skill body or finding text.
- `server/src/modules/eval/draft.test.ts` (hermetic, 21 tests)
  - `buildDraftName` cut to 80 characters total including prefix.
  - `toDraftOwners` order, `toEvalCaseDraft`, and `draftFromFinding` through the service for EC-1 to EC-4, EC-29 and NFR-1.
  - AC-25 title rules through `resolveExpectationTitle`, `classifyEdit` and `updateCase`.
- `server/test/eval-draft.it.test.ts` (21 tests)
  - Draft route: 200, `finding_undecided`, `no_patch`, `range_outside_diff`, `agent_missing`, agent deleted with skills present (EC-4), cross-workspace 404, bad UUID gives 422.
  - Both finding routes with and without input (AC-6 to AC-8): 201 then agent 409 vs skill 200 (EC-5), EC-9, malformed body gives 422.
  - No provider call (NFR-1).
  - Finding-kind grounding: `secret_leak` and `phantom` unedited save as 201, an edited location gets the strict 422, a plain `finding` kind with out-of-hunk lines stays 422.
  - PATCH title persistence for a manual case through the real route; a changed title on a finding-made case is `case_input_locked`.
- `server/test/eval-case-run.it.test.ts` (21 tests, Testcontainers)
  - NFR-18 snapshot test for agent and skill. It runs two set runs and snapshots the overview, dashboard (`recent_runs`, `sparkline`) and the repository readers: `latestFinishedRunRow`, `listRunSummaries`, `countFinishedRuns`, `recentRunSummaries`, `runningRunId`, `listSkillRunSummaries`, `listSkillTrendRows`, `latestFinishedSkillResults`, `runningSkillRunId`. It then finishes a case run, asserts every set-only snapshot is identical, and asserts only that case's `latest_result` changed.
  - AC-46 later-started wins in both directions. EC-14.
  - 409 guard both ways (case vs set, case vs case, any scope) for agent and skill, with `details.run_id`. `running_case_run` set and `running_run_id` null while a case run runs.
  - Errored case run is the case's latest result after reload on a fresh app (agent and skill), with siblings keeping the set-run result. Reaped case run becomes errored/`interrupted` and stays the latest result (agent and skill).
  - `compare` gives 404 for a case run in either position. `GET /eval-runs/:id` returns `scope:'case'` for agent and skill (AC-50). Workspace 404 (EC-29).
  - Validation and rejections: `{}`, bad UUID and malformed carrier give 422, skill case without carrier gives 422, unknown case or carrier gives 404, unlinked carrier gives `no_agent_linked`.
  - EC-30 and EC-20: disabled agent, skill and link still run. NFR-2 call counts (1 and 2) and NFR-3 (no rows in `reviews`, `findings`, `agent_runs`, `agent_run_skills`, `run_traces`; `last_reviewed_sha` untouched).
  - EC-25 unpriced model gives `cost_usd` null. EC-26 replace mid-run. EC-27 owner delete cascade, plus mid-run delete for agent and skill.
- `server/package.json:17`: only the `verify:l06` script text edited. The four new files are appended and there is no dependency or lockfile change.

**Client (new files, all colocated)**
- `client/src/components/eval-kpi-cards/EvalKpiCards.test.tsx` (3)
- `client/src/components/eval-case-row/EvalCaseRow.test.tsx` (11): result line with ICU plural, recall for `must_find` only, badge, icon accessible name, Edit icon plus text, Run slot order and states, EC-12 and UI-3.
- `client/src/lib/hooks/eval-case-run.test.tsx` (14): `useEvalCaseDraft`, `useStartEvalCaseRun` (202, 409, throws), the 3 and 6 minute windows, polling stop, timeout, and a failed poll with Retry and one toast.
- `client/src/components/eval-case-editor/ResultBanner/ResultBanner.test.tsx` (8)
- `client/src/components/eval-case-editor/RunOnSaveToggle/RunOnSaveToggle.test.tsx` (3)
- `client/src/components/eval-case-editor/CaseRunStatus/CaseRunStatus.test.tsx` (4)
- `client/src/components/eval-case-editor/TypeBanner/TypeBanner.test.tsx` (6)
- `client/src/components/eval-case-editor/OwnerPicker/OwnerPicker.test.tsx` (5)
- `client/src/components/eval-case-editor/CaseEditor/CaseEditor.run.test.tsx` (22)
  - Footer order and switch off on every open; Run case hints (draft, modified, running via set run or case run, noAgent plus the disabled switch).
  - Banner states, `role="status"` slot, effect label, reopening mid-run (EC-15).
  - Run case for agent (poll, completion, polling stops) and for skill (dialog, cancel, confirm posts `{carrier_agent_id}`). 409 start.
  - Run on save, agent: stays open, EC-17 runs on the NEW id, EC-16 422 and 5xx start nothing and keep the switch on, seeded draft.
  - Run on save, skill: dialog opens, cancel keeps the case (EC-31), confirm-disabled while busy (AC-49), Escape closes only the stacked dialog.
- `client/src/components/carrier-run-dialog/RunDialog.test.tsx` (9): set-mode regression plus case mode.
- `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.run.test.tsx` (6)
- `client/src/app/skills/_components/SkillEditor/_components/EvalsTab/EvalsTab.run.test.tsx` (6)
  - Both tab files cover row Run (the agent tab posts directly, the skill tab opens the carrier dialog), "Running…", disable-everything via `running_run_id` and `running_case_run`, a 409 start, the `aria-live` announcement, the 3 and 6 minute timeout sentence, Retry, and EC-19 on the skill tab.

### Run results
- `cd server && pnpm verify:l06`: pass, 10 files, 206 tests.
- `cd server && pnpm exec vitest run test/eval-case-run.it.test.ts test/eval-draft.it.test.ts`: 42 passed (Docker).
- `./scripts/check.sh all`: server typecheck, lint, arch PASS; server test 848 passed; client typecheck, lint, arch PASS; client test 787 passed; core typecheck and test PASS.
- The 12 new client files (97 tests) passed on two consecutive runs, including the timing-based ones. I did not run the full `.it.test` lane.

### Findings (not fixed)
- Minor, probably not worth a ticket. On the skill Evals tab, **Run all evals** is disabled by `flow.block`, which reads only the overview (`running_run_id` and `running_case_run`). The agent tab also passes the locally started case run to `RunAllEvals`. After a row **Run** starts a skill case run, **Run all evals** stays enabled until the overview refetch reports `running_case_run` (triggered by `onSettled` in `useStartEvalCaseRun`). Row Runs are disabled immediately. The server 409 guard covers the gap. My test models the server reporting the run, so it does not assert the gap.
- `client/package.json` has no `@testing-library/user-event`, so the new tests use `fireEvent`. Keyboard activation of the switch is covered only by asserting it is a native, focusable button.

### Out of scope / not covered
- `reviewer-core/` and `e2e/` were not touched, by design.
- Manual browser checks A22 and B20 (NFR-11 at 1280x720 and 768x600). The editor layout style assertions already exist in `CaseEditor.test.tsx`.
- Existing Phase A tests that I did not re-verify or duplicate:
  - Parser table, 6-key whitelist, 10 KB cap and dirty check: `eval-case-editor/helpers.test.ts`.
  - Skeleton, layout styles, owner and seed flows: `CaseEditor.test.tsx`.
  - AC-27 to AC-32 tab headers and KPI row: both existing `EvalsTab.test.tsx`.
  - Finding-card control (AC-9 to AC-11, EC-1, EC-3): `EvalCaseButton.test.tsx`, committed in Phase A.
- Spec IDs with no dedicated automated test:
  - NFR-13 (latency budgets).
  - NFR-17's "never scans every run's jsonb" property; only the behaviour is tested.
  - NFR-10 contrast and target size beyond the roles tested.
  - UI-5 and UI-9 (prompt assembly): reuse existing `arms-prompt-parity.test.ts` and `executor.test.ts`, with no SPEC-10-specific test.
  - NFR-8's client part (parser and row-text tests) runs under `client pnpm test`, not `verify:l06`; this is the literal gap the plan already flags.
  - EC-11's stacked-column layout under 768px, beyond the width fitting in `CaseEditor.test.tsx`.