## Hand-back 1

## Test-writing report: SPEC-09 Phase C gaps (AC-55–58, AC-36–39, EC-27/28/30, NFR-13)

### Tests added
- `/Users/harlock/Downloads/Sites/devdigest/server/test/eval-trend.it.test.ts` (new, Docker, 3 tests; `eval.it.test.ts` untouched; skills applied: backend bucket via fastify-best-practices, drizzle conventions copied from `skill-eval-runs.it.test.ts`)
  1. `AC-58/EC-27/NFR-5` — seeds 105 finished agent runs, with a null-recall gap (i=50) and a null cost on every 7th run. It also seeds a newer errored run, a newer running run and 3 newer skill runs on the same carrier agent. `GET /agents/:id/eval-overview` returns exactly 100 trend points, the 100 most recent, in chronological order. `finished_runs` is 105 and latest/previous are right. Each point carries `cost_usd` (real value, or null, never 0). The gap stays in place as null recall. The errored, running and skill runs appear in neither `trend` nor `runs`; `running_run_id` still reports the running run.
  2. `AC-57/AC-58/NFR-5` — `GET /eval-dashboard` with the same 105-run history. The sparkline is 10 recall points, oldest first, gap preserved. `latest` is the newest finished run with the right `cost_usd`. `recent_runs` is ≤20, every record has `cost_usd`, null stays null, and no skill runs appear. The overview's last trend point matches the dashboard `latest` (id and cost).
  3. `NFR-13/AC-58` — agent overview with 105 finished runs, each holding 50 case outcomes of jsonb, plus 50 cases. It answers in under 500 ms and still returns a 100-point trend. The existing NFR-13 test in `eval.it.test.ts` now seeds only 50 agent runs, so this closes that gap.
- `/Users/harlock/Downloads/Sites/devdigest/client/src/components/metric-trend/AgentMetricTrend/AgentMetricTrend.test.tsx` (new, 1 test; skill: react-testing-library) — covers `AC-55/AC-58/EC-27/EC-28` at the full 100-run window. Checks:
  - 100 Tab-reachable targets.
  - ≤10 x-axis labels, starting at "v1".
  - A null recall leaves a gap (99 dots, broken path).
  - A null cost reads "Cost —" in the accessible name and the tooltip, never `$0.00`.
- `/Users/harlock/Downloads/Sites/devdigest/client/src/app/skills/_components/SkillEditor/_components/EvalsTab/_components/SkillMetricTrend/SkillMetricTrend.test.tsx` (new, 1 test) — covers `AC-36/AC-37/EC-27/EC-28` on the skill wiring at 100 runs. A null citation breaks only the citation series (99 dots, two path segments). Null citation and null lift read "—" in the tooltip. A null total cost reads "—", not `$0.00`.

Not duplicated: the existing tests already cover null cost on the skill and agent tabs, plus Escape, blur, hover and 24 px targets. Two things need no new test:
- A null metric gap on the skill tab: it is generic chart behaviour, covered in `MetricTrend.test.tsx`; I added only the wiring-level check above.
- Escape closing a surrounding modal: the chart is never inside a modal, and no spec item requires it. I found no real hole and invented no test.

### Run results
- `cd server && pnpm exec vitest run test/eval-trend.it.test.ts` — PASS, 3/3 (Docker up).
- `./scripts/check.sh client related <both new client files>` — PASS, 2/2.
- `./scripts/check.sh server typecheck` — PASS.
- `./scripts/check.sh client typecheck` — PASS.
- `./scripts/check.sh server lint server/test/eval-trend.it.test.ts` — PASS.
- `./scripts/check.sh client lint <both new client files>` — PASS.
- `server typecheck` only includes `src/**/*.ts`, so I ran a one-off tsc including `test/eval-trend.it.test.ts` (temp tsconfig, since removed). It reported no errors in my file.

### Findings (implementation bugs found)
- No implementation bugs. All assertions passed first time.
- Stale doc comment (cosmetic, not fixed; it's under vendor/ so I didn't touch it): both `contracts/eval-ci.ts` copies still say on `EvalOverview` "`trend` <= 30 chronological". The behaviour is 100 per AC-58.
- Item 2 correction: `GET /eval-dashboard` has no trend points. It returns `agents[].sparkline` (recall only, 10 points) and `latest` / `recent_runs` records, which already carry `cost_usd`. The dashboard detail page gets its chart from `GET /agents/:id/eval-overview`. I tested the actual shape and tied the two reads together.
- Baseline failures from `.claude/sdd/SPEC-09/state.json` were not touched or claimed.

### Out of scope
- `reviewer-core/` and `e2e/` were not touched. No non-test source was edited.