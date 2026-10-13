## Hand-back 1

## Implementation report: SPEC-09 C3 (client, W3) — shared Metric trend

### Plan step → change
All paths below are under `/Users/harlock/Downloads/Sites/devdigest/client/`. Skills applied: the frontend bucket (frontend-ui-architecture, react-testing-library; next-best-practices, react-best-practices, security, typescript-expert only as general rules).
1. C1 breakage fix: `src/app/eval/agents/[agentId]/_components/EvalAgentDetailView/EvalAgentDetailView.test.tsx` trend fixtures now carry `cost_usd`. `src/test/eval-fixtures.ts` and `EvalDashboardView.test.tsx` had no trend fixtures, so they needed nothing.
2. Move and generalise `MetricTrend` into `src/components/metric-trend/`. It is the flat layout of the sibling `eval-case-editor`, with no `_components/`.
   - `git mv` of `helpers.ts`, `helpers.test.ts`, `constants.ts` and `styles.ts` to the top of `metric-trend/`.
   - `MetricTrend/MetricTrend.tsx` is the generic `MetricTrend<P>({points, getKey, getVersion, getValue(p, metric), tooltipText(p), style?})`.
   - `AgentMetricTrend/` is the agent wiring (AC-55 to AC-57), shared by the agent tab and the dashboard.
   - `index.ts` is the public surface. It exports `METRIC_COLORS`, which now lives in `constants.ts`.
   - The old route-private folder is gone. `src/app/eval/constants.ts` re-exports `METRIC_COLORS` from `@/components/metric-trend`, so there is one source of the colours.
3. Dashboard detail page: `EvalAgentDetailView.tsx` uses `AgentMetricTrend` with `style={{marginTop: 18}}`, which keeps the old spacing.
4. Agent Evals tab: `src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.tsx` renders `<AgentMetricTrend trend={overview.data.trend}/>` under the KPI cards, inside the existing loaded branch. Nothing else in the tab changed.
5. Skill Evals tab:
   - New `src/app/skills/_components/SkillEditor/_components/EvalsTab/_components/SkillMetricTrend/` (component, `helpers.ts` with `skillTooltipValues`, `index.ts`, `helpers.test.ts`).
   - It is wired into `EvalsTab.tsx` after `RunStatus`, from `overview.data.trend`.
   - It is colocated because only the skill tab uses it.
6. `src/lib/eval-format.ts` gains `formatLiftPoints(withValue, rawLift)` and `formatRanAt`.
   - `formatRanAt` moved here from `src/app/eval/helpers.ts`, because a shared component may not import a route.
   - `app/eval/helpers.ts` re-exports it, so the existing callers and `helpers.test.ts` are untouched.
7. `messages/en/eval.json`:
   - `agentDetail.trend.*` is now a top-level `trend.*`: `title`, `chartLabel`, `recall`, `precision`, `citation`, `versionLabel`, `noRunsYet`, `tooltip.agent` and `tooltip.skill`. The old keys had no other users.
   - `agentDetail.noRunsYet` is kept, because the view still uses it.

**Behaviour of the chart**
- One native `<button>` per run is overlaid on the SVG and is Tab-reachable. Its `aria-label` is the tooltip text, and the tooltip is a `role="tooltip"` div with the same string.
- The tooltip opens on pointer-enter and focus. It closes on pointer-leave of the plot, on blur and on Escape (Escape calls `stopPropagation` only while the tooltip is open).
- Each target is `width: 24px`, `minWidth: 24px`, `minHeight: 24px`, and spans the plot height.
- A null metric is a gap in the custom SVG and is never plotted as 0.
- The x-axis label is `v{version}`.
- Tooltip text is plain text in the DOM, and `aria-label` is escaped by React.

### Tests run (inner loop only — caller runs the outer loop)
- `./scripts/check.sh client typecheck` — PASS
- `./scripts/check.sh client lint <my dirs>` — PASS
- `./scripts/check.sh client arch` — PASS
- `./scripts/check.sh client related <my files and dirs>` — PASS (57 passed)
- `./scripts/check.sh client test` — PASS (661 passed). I ran this once as an extra, so the whole client suite is green in the current tree.

New or extended tests, named by AC/EC id:
- `src/components/metric-trend/MetricTrend/MetricTrend.test.tsx`:
  - AC-36 series and `v{n}` labels.
  - AC-38 one Tab-reachable button per run, with name equal to tooltip text equal to the rendered tooltip text.
  - AC-39 hover and pointer-leave, focus and blur, Escape, and focus moving between runs.
  - NFR-8 24×24 px targets.
  - EC-28 gaps: 7 dots rather than 9, and the series path has two `M` commands and no `L`.
  - EC-30 "No runs yet".
- `src/components/metric-trend/AgentMetricTrend/helpers.test.ts`: AC-56, and EC-27 where null cost shows "—".
- `SkillMetricTrend/helpers.test.ts`: AC-37, NFR-9, EC-26 and EC-27.
- `src/lib/eval-format.test.ts`: `formatLiftPoints` and `formatRanAt`.
- Wiring tests:
  - Agent `EvalsTab.test.tsx`: AC-55/56/EC-27, and EC-30.
  - Skill `EvalsTab.test.tsx`: AC-36/37/EC-27, and EC-30.
  - `EvalAgentDetailView.test.tsx`: AC-56/57/EC-27 with Escape.
- `src/components/metric-trend/helpers.test.ts`: added an `xPercent` alignment test. The two existing tests are unchanged.

### Existing assertions I changed
1. `src/app/skills/_components/SkillEditor/_components/EvalsTab/EvalsTab.test.tsx`, AC-9/AC-12 test: `screen.getAllByRole("listitem")` is now scoped to `within(getByRole("list", {name: "Skill eval cases"}))`. The trend legend is a `<ul>`, so the unscoped query also counted the three legend items. This is a Phase A test of a new file, not a SPEC-08 assertion.
2. `EvalAgentDetailView.test.tsx`: fixture data only (`cost_usd`), plus new assertions. No existing assertion changed.
3. The `getByRole("img", {name: "...over the last 2 runs"})` assertions still pass unchanged. The SVG keeps `role="img"` with that label, and the buttons sit beside it, not inside it.

### Self-check (implementation scope only)
- Diff matches the plan: yes. Both tabs and the dashboard use the shared chart, the tooltips match AC-37/AC-56, the empty state is "No runs yet", and NFR-16 is respected apart from the one scoped assertion above.
- Naming / "Do not touch" rules respected: yes. Nothing was edited in `server/**` or `*/src/vendor/**`. No `_components/` sits inside `src/components`. No `fetch` was added to components. Folders are kebab-case under `components` and PascalCase under routes.
- i18n keys exist: I checked every `t("trend.…")` call, found with `grep -o 't("trend[^"]*"' -r src`, against `messages/en/eval.json` with `python3 json.load(...)['trend']`. All 9 keys resolve, `title` through `tooltip.skill` and `tooltip.agent`. The tests also assert the exact rendered English strings. No `skills.json` keys were added.

### Decisions where the plan was silent
- **Lift in the skill tooltip (NFR-9).** `EvalSkillTrendPoint` has `with` metrics and raw `lift` (with − without) but no `without` values.
  - I rebuild `without = with − lift`, round it to 9 decimals, then apply `round(with·100) − round(without·100)`. This is exact up to float noise.
  - If you want the exact stored without-arm values, a contract field is needed (see below).
- **Tooltip text.** It is one line joined with " · ", because the accessible name must equal it and the `aria-label` should not carry newlines. Examples:
  - Agent: `v2 · 2026-09-02 10:00 · Recall 75% · Precision 80% · Citation accuracy 90% · Cost —`
  - Skill: `v1 · date · Beta v3 · gpt-4.1 · With skill: recall…, precision…, citation accuracy… · Lift: recall ▲ 4 pt, … · Cost (both arms) $0.20`
- **Date format.** The run date uses the existing `formatRanAt` ("YYYY-MM-DD HH:mm", local time).
- **Dense charts.** With up to 100 runs, adjacent 24 px targets overlap (about 6.5 px spacing). Each run still has its own ≥ 24×24 px target and is Tab-reachable, but a mouse hover in a dense chart resolves to the topmost overlapping button, so it can be off by a point or two. Nearest-point hit-testing would be a follow-up if wanted.
- **Chart placement.** The agent chart sits in the metrics section under the KPI cards. The skill chart sits under the lift line and the run status, above the case list. Both render only once the overview has loaded.
- **Legend markup.** The legend stays a `<ul>`, as in the old chart.

### Needed from the server / contracts
Nothing is blocking.
- Optional: `without` metrics (or the three without-arm ratios) on `EvalSkillTrendPoint`, if exact NFR-9 rounding at .5 boundaries must not rely on reconstructing `with − lift`.
- C2 must deliver `cost_usd` and up to 100 points on the agent trend. The client already expects both and tolerates `null` cost and an empty trend.

### Handoff note
- `git mv` staged the renames, as with the other staged moves in the tree.
- The chart's `onPointerLeave` closes the tooltip even if a run still has keyboard focus. This matches AC-39 ("moves focus or the pointer away") but is worth a look in review.
- Review attention: the new shared component `src/components/metric-trend/` (a11y of the overlay-button pattern), and `src/app/eval/helpers.ts` and `src/app/eval/constants.ts` now re-exporting from the shared layers.
- Run the outer loop (`client test`, `arch`, `lint`) once W2 finishes. `/pr-self-review` is still to be done before any PR.

---

## Hand-back 2

## Fix mode report: SPEC-09 W3 (client), plan-verifier pass 1 rows F1 and F2

The AC-39 fix and the new tests are in, the empty `MetricTrend/` directory is deleted, and all client gates pass. The full client suite also passes (670 tests).

### Files changed (under `/Users/harlock/Downloads/Sites/devdigest/client/`)
- `src/components/metric-trend/MetricTrend/MetricTrend.tsx` (F1)
- `src/components/metric-trend/MetricTrend/MetricTrend.test.tsx` (F1, three new AC-39 tests)
- `src/test/i18n-key-coverage.test.ts` (F2, new)
- `src/components/diff-viewer/DiffViewer/DiffViewer.test.tsx` (F2, one test added)
- Deleted the empty directory `src/app/eval/agents/[agentId]/_components/MetricTrend/`.
- Nothing under `server/**` or `*/src/vendor/**` was touched.

### F1 (AC-39): how Escape and pointer-leave now work
- **Escape.**
  - A `document` keydown listener in the capture phase is registered only while a tooltip is open (`useEffect` keyed on whether a tooltip is open). It is removed when the tooltip closes or the chart unmounts.
  - On Escape it calls `stopPropagation()` and closes the tooltip, so Escape works for a hover-only tooltip and for a focused one.
  - It runs in the capture phase so a surrounding dialog's Escape handler never sees that one keypress.
  - With no tooltip open nothing is registered, so Escape passes through untouched.
  - The old `onKeyDown` on the target button is removed.
- **Pointer-leave.**
  - `onPointerLeave` moved from the whole plot to each run's target button. Leaving that run into empty plot space now closes its tooltip.
  - The close is `cur === i ? null : cur`, so a late leave from run A cannot close the tooltip that run B has just opened.
  - Decision: pointer-leave closes the tooltip even if that run still has keyboard focus, since AC-39 says "moves focus OR the pointer away → close". It is deterministic and the tests cover it.
  - Focus and blur behaviour is unchanged.
- **New tests in `MetricTrend.test.tsx`** (names start with "AC-39:"):
  - A hover-only tooltip closes on Escape with `document.body` active, and other keys leave it open.
  - Pointer leaving a run into empty plot closes the tooltip, including when that run is focused, and a stale leave from a different run does not close the open one.
  - `stopPropagation` is called on Escape only while a tooltip is open (checked three times: closed, then open, then closed again).
- The existing focus+Escape and blur tests still pass.

### F2
- **Key coverage test.**
  - The repo had no messages-coverage test and no test that reads files, so I added `src/test/i18n-key-coverage.test.ts`. It uses only `fs` and `path`, with no render and no fetch.
  - For the SPEC-09 files it reads each `const x = useTranslations("ns")` binding and looks up every `x("literal.key")` in `messages/en/<ns>.json`. Missing keys, and literal keys that resolve to a group of keys instead of a message string, fail the test.
  - A template key such as `` t(`a.${k}`) `` is checked up to its first `${`; that prefix must exist.
  - Scanned: `components/{eval-case-editor, eval-case-row, delete-case-dialog, case-state-label, metric-trend}`, the agent and skill Evals tabs, `RunDialog`, `use-skill-eval-flow.ts` and `SkillEvalMenu`.
  - It also asserts the scan actually found the files and keys, and spot-checks `eval.trend.tooltip.skill` and the `skills` `evals.runDialog.*` keys.
  - I checked that it fails: a temporary file with `t("trend.bogus")` and a bad template key was reported as missing, then I deleted it.
  - Limit: it only sees literal keys and template prefixes. A key passed through a variable or a helper function is not checked, and keys used in other namespaces' files are out of scope.
- **`highlightRange` at DiffViewer level.** Added one test to `DiffViewer.test.tsx` (SPEC-09 AC-8): the range is outlined in every file card (lines 2 and 3 of two files, 4 rows), a large file stays collapsed, and `scrollIntoView` is not called.

### Gates
- `./scripts/check.sh client related <MetricTrend.tsx, its test, DiffViewer.test.tsx, i18n-key-coverage.test.ts>` — PASS (78 passed)
- `./scripts/check.sh client related <both Evals tab tests, EvalAgentDetailView.test.tsx>` — PASS (32 passed). These tests focus a run and press Escape, and still pass.
- `./scripts/check.sh client typecheck` — PASS
- `./scripts/check.sh client lint client/src/components/metric-trend client/src/test client/src/components/diff-viewer` — PASS
- `./scripts/check.sh client arch` — PASS
- `./scripts/check.sh client test` — PASS (670 passed)

### Notes
- When I checked, `check.sh related` printed a bare "PASS 1s" with no count for directory arguments. Use explicit file paths so it reports a test count.
- NFR-8 and UI-12, which the verifier listed as Unverified, need no code change from me.