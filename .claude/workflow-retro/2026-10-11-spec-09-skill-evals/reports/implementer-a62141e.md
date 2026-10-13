## Hand-back 1

## C2 (server, W2) report

### Files changed
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/helpers.ts`: `toTrendPoint` now returns `cost_usd: run.costUsd`. The column is `doublePrecision`, nullable. A null price stays null and is never coerced to 0 (EC-27).
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/constants.ts`: `TREND_LIMIT` 30 → 100.
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/service.ts`: `skillOverview` now uses `TREND_LIMIT`. The `SKILL_TREND_LIMIT` import and use are gone.
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/helpers.test.ts`: the EC-36 exact-equality assertion on `toTrendPoint` now includes `cost_usd: null`. I added an EC-27 test covering a real cost, null, and a genuine 0.
- `/Users/harlock/Downloads/Sites/devdigest/server/test/eval.it.test.ts`: this is outside "files owned", but the window change breaks it, so I updated it. The old `trend ≤30` assertions failed with "got 50".
  - In the overview test, the trend now has length 50 and equals all `finished` in chronological order. The `agent_version`/recall check moved from index 0 to index 20.
  - The NFR-13 test now expects a trend length of 50.
  - The title says ≤100.
  - The test still covers gaps and ordering. It does not exercise the 100-run cap itself, because it seeds only 50 runs.

### Gates
- `check.sh server typecheck`: PASS
- `check.sh server related` (helpers, service, constants, helpers.test): PASS, 178 passed
- `check.sh server lint` (same files): PASS
- `check.sh server arch`: PASS
- `pnpm exec vitest run test/eval.it.test.ts test/skill-eval-runs.it.test.ts`: PASS, 2 files, 63 tests.
  - Before my test edits, `test/eval.it.test.ts` failed 2 tests on the old 30-trend assertions (the AC-57 overview test and the NFR-13 test). After the edits both pass.
  - `test/skill-eval-runs.it.test.ts` was fine throughout.

### NFR-13 timing
- I made a throwaway copy of the NFR-13 perf test seeding 100 finished runs × 50 cases per agent (10 agents). I ran it and then deleted it; `git status` shows no leftover file.
- `GET /agents/:id/eval-overview` took about 5.7 ms with the trend at 100 points and `runs` at 50. The budget is 500 ms. `GET /eval-dashboard` took about 11 ms in the same run.

### Decisions where the plan was silent
- I unified the two constants into one `TREND_LIMIT = 100`, shared by agent and skill trends (Q-6 default: 100 for both owners). Nothing else referenced `SKILL_TREND_LIMIT`.
- The overview's `listRunSummaries` selection is unchanged. It reads scalar columns, `metric_parts` and `jsonb_array_length(case_set / case_results)`. It never selects the `snapshot`, `case_set` or `case_results` jsonb contents (NFR-13). The jsonb columns are touched only through `jsonb_array_length`, which was already the case.
- The errored/null-metric gap behaviour is untouched, and the existing EC-36 IT assertion (run `finished[47]` has null recall) still passes.

### Handoff notes
- The `test/eval.it.test.ts` edits above are in a file W2 did not own. They are assertion-only.
- Nothing in `client/**`, the vendored contracts or migrations was touched.
- I did not touch or claim the baseline `.it` failures or flaky tests listed in `state.json`.
- I did not check next-intl keys; there are none on the server side.