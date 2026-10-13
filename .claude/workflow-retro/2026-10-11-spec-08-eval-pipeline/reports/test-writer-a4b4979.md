## Hand-back 1

## Test-writing report: SPEC-08 client tests (plan step 22, W6)

The full `cd client && pnpm test` passes: 99 files, 556 tests. `./scripts/check.sh client typecheck`, `client lint` and `pnpm arch` all pass. I added or extended 76 tests across 17 files. Skills applied: react-testing-library, plus bucket `frontend` for the test files.

### Regression fixed
`FindingsPanel.test.tsx` no longer fails with `No QueryClient set`. It now mocks `lib/hooks/eval` and `lib/hooks/agents` with `vi.hoisted` state, the same way it already mocked `reviews`. I added 4 tests there: AC-1 create call, EC-1 undecided disabled, EC-2 agent-missing tooltip, AC-9 "In eval set" link. The file has 11 tests, all passing.

### Files created (all under `/Users/harlock/Downloads/Sites/devdigest/client/src/`)
Test names carry the spec ID, e.g. `AC-12: …`.
- `lib/eval-format.test.ts` (5 tests): NFR-8 rounding rule, EC-19/20/21 em dashes, cost and duration formats.
- `lib/hooks/eval.test.tsx` (7 tests), real hooks with `fetch` stubbed and fake timers:
  - `useEvalRun`: 2 s polling stops on finish, one invalidation per run, `onFinished` once (AC-26), idle without an id, 10-min timeout (EC-15), failed poll stops then Retry resumes (EC-16).
  - `useCreateEvalCaseFromFinding`: 201 flips the links cache (AC-8), 409 gives `exists` (EC-3), 422 gives `rejected` (EC-4/5), 5xx still throws.
- `app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/EvalCaseButton/EvalCaseButton.test.tsx` (8 tests): ready, creating, in-set link, EC-1 and EC-2 tooltips, inline EC-4/5 alerts.
- `app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.test.tsx` (7 tests):
  - EC-22 empty state and EC-23 "never run" with em-dash KPIs.
  - Case list, passing summary and KPI cards with deltas.
  - Case modal: UI-3 escaped diff, title and body; rename via PATCH; EC-8 source gone.
  - Delete confirmation naming the case, then DELETE, and Cancel.
- `app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/RunAllEvals/RunAllEvals.test.tsx` (6 tests): start, EC-11 disabled, "Running case k of n", AC-26 announcement, EC-15 and EC-16 Retry. The hooks are the seam here; polling is covered in `eval.test.tsx`.
- `app/eval/helpers.test.ts` (5 tests).
- `app/eval/_components/GapSparkline/helpers.test.ts` (2 tests): EC-36 gap, not 0.
- `app/eval/_components/EvalDashboardView/EvalDashboardView.test.tsx` (4 tests): cards, AC-54 rows and navigation, EC-28 disabled badge, EC-24 empty states, EC-19/36 null recall plus sparkline gap, error and no-agents states.
- `app/eval/agents/[agentId]/_components/MetricTrend/helpers.test.ts` (2 tests).
- `app/eval/agents/[agentId]/_components/AgentRunsTable/AgentRunsTable.test.tsx` (5 tests): `toggleSelection`, EC-27 disabled checkbox with tooltip, Compare enabled only with exactly two selected, open run.
- `app/eval/agents/[agentId]/_components/CompareModal/CompareModal.test.tsx` (7 tests): AC-45 to AC-49 cards with pt and $ deltas, case counts, UI-8 escaped prompt diff, AC-50 "System prompt unchanged", EC-26 no-common message, EC-20/21 em dashes, 404/422 messages, Escape and Close.
- `app/eval/agents/[agentId]/_components/RunDetailModal/RunDetailModal.test.tsx` (6 tests): AC-37 per-case results with TP/FP labels, UI-5 escaping, EC-29 `title`, errored case, EC-13, load error.
- `app/eval/agents/[agentId]/_components/EvalAgentDetailView/EvalAgentDetailView.test.tsx` (4 tests): header, KPI cards, trend, select two runs, Compare modal, run-detail modal; EC-23; EC-11 and EC-28; not-found.
- `src/test/eval-fixtures.ts`: typed factories (`runRecord`, `runDetail`, `metrics`, `caseItem`). This is test support rather than a `*.test.*` file, so it is slightly outside the scope you gave. Say so if you would rather I inline them.

### Files extended
- `FindingCard.test.tsx` (+2 tests): the `evalCase` prop shows the button (AC-1) and omitting it shows none.
- `AgentEditor.test.tsx` (+1 test): AC-10, the Evals tab is listed after Context. The existing test still passes.
- `components/app-shell/helpers.test.ts` (+1 test): AC-51, nav item after Conventions, and `activeKeyFor("/eval")` and `/eval/agents/x` return "eval".

### Source bug found (not fixed)
- **Missing translation for the "Traces passed" KPI card.** `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/EvalKpiCards/EvalKpiCards.tsx:34` resolves the label as `t(\`evalsTab.kpi.${k.key}\`)`. `helpers.ts` gives that card `key: "traces"`, but `client/messages/en/eval.json` only defines `evalsTab.kpi.tracesPassed`. The card renders the raw key and next-intl logs `MISSING_MESSAGE` (NFR-6, AC-35). Fix by renaming either the key or the message. I covered it with `it.fails("NFR-6/AC-35: every KPI card has a translated label, including Traces passed")` in `EvalsTab.test.tsx` so the suite stays green. Once the source is fixed, change `it.fails` to `it`.

### Notes
- `@testing-library/user-event` is not installed in `client/`, and I did not touch `package.json` or the lockfile. The new tests use `fireEvent`, as the existing client tests do. If the skill's userEvent rule matters, someone needs to add the dependency.
- The log `.claude/implementer/logs/client-related.log` shows the original 7 failures. The FindingsPanel run above is the passing result.

### Out of scope
- `reviewer-core/`, `e2e/` and `server/` tests (the server SPEC-08 test files are untracked in `server/test/`; I did not touch them).

---

## Hand-back 2

## NFR-7 follow-up (S22): done

The full client suite passes (99 files, 560 tests), and `./scripts/check.sh client typecheck` and `client lint` pass. I added 4 tests (the earlier report said 556 tests; this run has 560).

**Stale comment.** Removed the "SOURCE BUG" comment above the NFR-6/AC-35 `it` in `EvalsTab.test.tsx`. The test is already a plain `it` and passes.

**Tests added**, each with `NFR-7` in the name, asserting inline `style` values because jsdom computes no layout:
- `AgentRunsTable.test.tsx`: the select-checkbox hit area (label) is 24x24, and the version button has min-width and min-height of 24.
- `EvalsTab.test.tsx`: the delete icon button is 30x30, and the "View full dashboard →" link and the empty-state "Go to Pull Requests" link have min-height 24.
- `EvalCaseButton.test.tsx`: the "In eval set" link has min-height 28.
- `EvalDashboardView.test.tsx`: both the agent-card link and the recent-runs agent link have min-height 24.

**Controls without an explicit min-size style (not fixed, no test asserts them):**
- The kit `Button` has no min-width or min-height. That covers the AgentRunsTable Compare button, "Run all evals", "Retry", and the "Turn into eval case" button in its ready, disabled and creating states. Its `sm` variant (padding 5px 9px, font 12.5px, line-height 1.2) works out to roughly 27px tall once it has text and a border, so I expect it meets 24px, but no inline style guarantees it. The source is `client/src/vendor/ui/primitives/Button.tsx:26-46`, which is vendor code I did not touch.
- `EvalCaseButton/styles.ts:7` `hintWrap` has no min-size. Only `inSet` (line 11, `minHeight: 28`) has one.
- The checkbox itself is 16x16 (`AgentRunsTable/styles.ts:18`); the 24x24 label around it carries the hit area, which is what the test asserts.

If you want a hard guarantee for the `Button`-based controls, a `minHeight: MIN_TARGET_PX` would have to go on the kit `Button` or on a wrapper in each caller. I can then add assertions.