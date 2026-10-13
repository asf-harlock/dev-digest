## Hand-back 1

## W3 report: SPEC-09 B6 (client, skill eval run flow)

No further contract change needed. Typecheck, lint and arch pass, and the related tests pass. I ran the inner loop only.

### Gates
- `./scripts/check.sh client typecheck`: PASS. The 14 B1 errors are fixed.
- `./scripts/check.sh client lint` (whole package): PASS
- `./scripts/check.sh client arch`: PASS
- `./scripts/check.sh client related`, three batches, all PASS:
  - EvalsTab.tsx and SkillEditor.tsx: 17 and 7 tests
  - skill-eval.ts, eval.ts and eval-run-polling.ts: 162 tests
  - RunAllEvals, DetailHeader, RunDetailModal, EvalCaseRow and eval-fixtures: 79 tests
- i18n check: a Python script resolved all 40 keys I added or used in `client/messages/en/skills.json` and `eval.json`, including the dynamic `evals.effect.*`, `runStatus.live.*` and `evalsTab.case.state.*`. All exist. A grep confirms the old `runOnEvalsTooltip` and `runAllTooltip` keys are gone.

### 1. B1 typecheck fixes (agent behaviour unchanged, NFR-16)
- `client/src/lib/hooks/eval.ts`: `useEvalRunDetail`, `useEvalRun` and `onFinished` now use `EvalAgentRunDetail`.
- `RunAllEvals.tsx` and its test, `RunDetailModal.test.tsx`: type rename to `EvalAgentRunDetail` only.
- `client/src/test/eval-fixtures.ts`: `runDetail()` now returns `EvalAgentRunDetail` with `owner_kind: "agent"`.
- `DetailHeader.tsx` and `RunDetailModal.tsx` needed no edit; they were fixed by the hook types.

### 2. B6 files
**Hooks and keys, in `client/src/lib/hooks/`:**
- `eval-run-polling.ts` (new): a generic `useRunPolling`. It holds the loop that used to live in `useEvalRun`: 2 s polling, timeout, failed-poll halt, `retry`, and a once-per-run finish.
- `eval.ts`: `useEvalRun` is now a thin wrapper over `useRunPolling`. Its 10-minute timeout, `EVAL_RUN_*` exports and invalidations are unchanged.
- `eval.ts`: added the `skillOverview` and `skillRun` keys, and exported `detailsId`.
- `skill-eval.ts`: added `useSkillEvalOverview`, `useStartSkillEvalRun`, `useSkillEvalRun`, plus the `SKILL_EVAL_RUN_POLL_MS` and `SKILL_EVAL_RUN_TIMEOUT_MS` (20 minutes) constants.
- `useStartSkillEvalRun` resolves a 409 `eval_run_in_progress` with `details.run_id`. Anything else throws and the global handler toasts it once. It invalidates the overview on settle.
- `useSkillEvalRun` fetches `/eval-runs/:id` and throws if `owner_kind` isn't `skill`. On finish it invalidates only the skill's overview and cases, not the dashboard or agent keys (EC-40).

**Components, under `client/src/app/skills/_components/SkillEditor/`:**
- `use-skill-eval-flow.ts` (new): one shared state for the header button and the Evals tab. It holds the overview, dialog open state, the followed run and the finished run. It also derives the disabled reason (`loading`, `running`, `no_agent`, `no_cases`) and exports `runHintKey`.
- `SkillEditor.tsx`: header **Run on evals** is wired to the flow and the dialog, with the hint as the span title.
- `_components/RunDialog/` (new):
  - Carrier picker via the kit `SelectInput`, sorted by name. Preselect order: user choice, then the latest run's carrier, then the first agent by name.
  - "{n} cases · {2n} reviews" (AC-21), injection warning (EC-31), disabled skill/link warning that follows the chosen carrier (EC-46). Both warnings still allow the run.
  - Confirm posts `{carrier_agent_id}`, then follows the run and closes the dialog.
- `_components/EvalsTab/EvalsTab.tsx`, `helpers.ts`, `styles.ts`: **Run all evals** opens the dialog and shows the EC-11/EC-13 hint as visible text and a title. Also added the passing count, the lift line and the error-with-retry for the overview.
- `_components/EvalsTab/_components/RunStatus/` (new): one `aria-live="polite"` `role="status"` region with "Running case {k} of {n}" (k = `cases_done` + 1), then the final status. It also shows the timeout message (EC-19) and a failed-poll message with Retry (EC-20), and the `error_reason` on an errored run.
- `_components/EvalsTab/_components/SkillCaseList/_components/EffectLabel/` (new): icon, colour and text effect label (`helped`, `hurt`, `no effect · pass`, `no effect · fail`, `errored`) plus "with skill: X · without: Y".
- `client/src/components/eval-case-row/EvalCaseRow.tsx`: one new optional `trailing` slot. The agent tab doesn't pass it, so it is unchanged.
- `client/messages/en/skills.json`: new keys under `evals`. The Run all and Run on evals tooltip keys are removed.

### 3. Existing test assertions changed
- `EvalsTab.test.tsx` (skill, my Phase A file): the assertion that Run all evals is disabled with the "isn't available yet" tooltip now expects the EC-11 hint "Link this skill to an agent first" (amended behaviour). The tab now takes a `flow` prop, so the file renders through a small `Harness` that uses the real `useSkillEvalFlow`, plus `RunDialog`. `stubApi` also stubs the overview, run GET and run POST. I added a "run flow" describe with 9 new tests covering AC-2/4/20–22/33/34/35 and EC-13/30/31/46.
- `SkillEditor.test.tsx`: no assertion changed. `SkillEditor` now owns the overview query, so `renderWithIntl` wraps a `QueryClientProvider` and stubs a never-resolving fetch. I added one test that Run on evals starts disabled.
- `skill-eval.test.tsx`: new tests for the run hooks (409 resolves with `run_id`, 2 s polling, finish invalidations, 20-minute cap, poll failure and Retry).
- `eval.test.tsx`: no changes, and it still passes against the refactored `useEvalRun`.
- `RunAllEvals.test.tsx` and `RunDetailModal.test.tsx`: type rename only.

### 4. Decisions where the plan was silent
- **Poller refactor:** I extracted the polling loop into `eval-run-polling.ts` instead of copying about 80 lines of tricky effect code. The existing `useEvalRun` tests pass unchanged. If you'd rather leave `useEvalRun` untouched, the skill hook can be a copy instead.
- **Cache key:** skill runs use their own `evalKeys.skillRun`, not `evalKeys.run`, so the two detail shapes never share a cache entry.
- **Where run state lives:** it sits at `SkillEditor` level, not in the tab, so the header button's disabled state and the finish-refresh work from any tab.
- **Passing count (AC-2):** `latest.with.traces_passed` / `traces_total`, which I read as the cases scored in both arms by SPEC-08/09 AC-29. The server must keep that meaning for skill runs.
- **Lift (NFR-9):** each Δ comes from `formatDeltaPoints(with.x.value, without.x.value)`, i.e. `round(with·100) − round(without·100)`, not from the raw `lift` field. A null arm gives "—".
- **No finished run (EC-30):** the passing count shows "—" and the lift line reads "Lift vs. without skill: —".
- **Block precedence:** running, then no agent, then no cases, mirroring the server's 422 order. The visible hint in the tab only shows for no agent and no cases; the running state is shown by the status line.
- **Review count:** "{n} cases · {2n} reviews" uses ICU plural, so n=1 reads "1 case · 2 reviews", not the literal "1 cases".
- **Timeout:** it shows the message only, with no Retry (EC-19 doesn't ask for one). Retry appears only after a failed poll (EC-20).
- **Final announcement:** it is only set when the run finishes while the tab is open. A run already finished at page load is not announced.
- **Wording:** the status and progress strings reuse the existing `eval.runStatus.*` copy.

### 5. Server and contract needs
None beyond what the contracts and your endpoint list already provide. Relying on the server for:
- `latest_result` filled on `GET /skills/:id/eval-cases`
- `overview.latest` being the latest finished run (`with` / `without` / `lift` null when everything errored)
- `GET /eval-runs/:id` returning `owner_kind: "skill"` for skill runs
- 409 `details.run_id`

### 6. Handoff
- No trend chart (Phase C).
- The Run dialog has no focus trap or initial focus. The kit `Modal` has none either, and I matched `DeleteCaseDialog`'s Escape handling. Flag for the a11y review (NFR-8).
- Run dialog and `RunStatus` strings render as escaped React text, and no component fetches directly.
- I did not touch `server/**` or the vendor contracts.