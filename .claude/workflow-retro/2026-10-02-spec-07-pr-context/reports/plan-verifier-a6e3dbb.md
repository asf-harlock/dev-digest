## Hand-back 1

## Plan verification: SPEC-07 PR Context (pass 2 of 2, definition of done)

### Gates re-run (my own runs)
- `./scripts/check.sh server|client|core typecheck`: PASS, PASS, PASS.
- `./scripts/check.sh server lint`, `client lint`: PASS, PASS.
- `./scripts/check.sh server arch`, `client arch`: PASS, PASS.
- `./scripts/check.sh core test`: PASS, 67 tests.
- `./scripts/check.sh client test`: PASS, 474 tests.
- `./scripts/check.sh server test`: PASS, 600 tests. The two known flaky or pre-existing suites did not fail in this run.
- `cd server && pnpm exec vitest run test/pulls-context.it.test.ts`: PASS, 9 of 9 (Docker was available).
- e2e (`./scripts/e2e.sh`) was not run, as instructed.

### Matrix

| ID | Status | Evidence |
|---|---|---|
| Plan steps 1-7 (contracts, constants, schema, migrations) | Pass | The vendor diff is identical in both copies: 6 files per side, +85 in `platform.ts` on each. Migrations 0017 and 0018 are generated files (`server/src/db/migrations/`). `pulls-context.it.test.ts` passes against the migrated DB. |
| Plan steps 8-12 (git adapter, helpers, resolver, service, routes) | Pass | New files `ls-tree.ts`, `simple-git.ts` (single-flight map at line 23, `ensureCommit` at 260), `pr-context*.ts`, `pulls/context-service.ts` and `pulls/repository.ts` exist, each with tests. Server test and `pulls-context.it.test.ts` pass. |
| Plan step 13 (reviewer-core `## PR context`, guard) | Pass | `prompt.ts` and `test/prompt.test.ts` are modified, and core test passes. |
| Plan steps 14-18 (client hook, tab, header, stale notes, Trace, i18n) | Pass | `ContextTab`, `PrContext*` components and `lib/hooks/pr-context.ts` exist. `prContext.json` is present. The client test passes (474) along with lint and arch. |
| Plan steps 19-22 (run-executor, brief, intent, no-LLM on save) | Pass | `context_fingerprint` is written at `run-executor.ts:472` and `:626`. Tests: `run-executor-pr-context.test.ts`, `brief-pr-context.test.ts`, `intent-classifier.test.ts`, `pulls-context-routes.test.ts`. |
| Plan step 23 (tests, e2e step) | Pass for the tests, Unverified for the e2e run | The step is in `02-repo-pulls-detail.flow.json:12-14`. It clicks "PR context", waits for `tab=context`, then waits for "cloned locally", which matches `prContext.notCloned`. The flow was not run. |
| US-1..9 | Pass | Covered by the AC rows below. |
| AC-1..6 | Pass | Tab and badge, rows, attachable list, optimistic save, `context_paths` column, GET contract. Route tests, `ContextTab` tests and the `.it` suite pass. |
| AC-7 | Pass | The Attach/Attached toggle exists (`prContext.json` `preview.attach` and `preview.attached`). Pass-1 Fail, rechecked. |
| AC-8 | Pass | The footer `total` and `reserve` strings are both present. Pass-1 partial Fail, rechecked. |
| AC-9..19 | Pass | Map-reduce note, suggestions and matcher, head-SHA reads, 64 KB cap, SPEC-04 unchanged, budget, truncation and over_budget. Unit tests pass. |
| AC-20..30 | Pass | AC-20 was a pass-1 Fail and was rechecked. Run-executor, trace, brief and Trace-drawer tests pass. |
| AC-31..37 | Pass | AC-31 was a pass-1 Fail and was rechecked. Brief and intent fingerprints and sources, and the fingerprint helper, are tested. |
| AC-38..40 | Pass | Stale notes on PrBrief, IntentCard and the Agent runs row, including the user-approved `RunSummary.context_fingerprint` extension. Tests are in the client suite. |
| AC-41, AC-42 | Pass | No-LLM-on-save is asserted in the route tests. The preview contract is covered by route tests and the `.it` suite. |
| EC-1..7 | Pass | Not cloned, fetch, missing, symlink, too_large and not_utf8 are covered in `pr-context.test.ts` and `simple-git.test.ts`. |
| EC-8..18 | Pass | The client `ContextTab` tests cover these states. |
| EC-19, EC-20 | Pass | `attachable.empty` now names `specs/`, `docs/` and `insights/`. A `clearFilter` string exists. Both were pass-1 Fails, rechecked. |
| EC-21..28 | Pass | EC-26 now has a test (`pr-context-paths.test.ts:72`). EC-22: the 404-before-422 ordering was checked by code only, with no test for an invalid path on a foreign PR. |
| NFR-1, 3..10, 12 | Pass | NFR-3: the in-flight fetch is now single-flight per clone (`simple-git.ts:23`, pass-1 Fail rechecked). |
| UI-1..7, 9..12 | Pass | The path validator, ls-tree, wrapUntrusted and sanitizer tests are in the server, core and client suites. |
| NFR-6 | Pass, partial evidence | `MIN_TARGET = 24` in `PrContextRow/styles.ts`, with keyboard Move buttons and a checkbox named for the path. Visible focus was not confirmed, so Playwright could settle it. |
| UI-8 | Pass | `ProjectContextSection.tsx:37` renders the text in a `<pre>`. |
| NFR-2 | Unverified | No timing check exists. |
| NFR-11 | Unverified | The e2e flow is edited but not run. Unit-level not-cloned states pass. |

### Non-Pass rows
- NFR-2: Unverified. No performance check addresses it.
- NFR-11: Unverified. The e2e run is pending and is a parallel task.

### Not covered by the plan (out of scope)
- `GET /pulls/:id/context/preview` validates the path (422) before the workspace check (404). EC-22 has no test for that ordering.

### Verdict
Every plan step and every spec ID is Pass except NFR-2 and NFR-11, which are Unverified. The NFR-6 focus part has partial evidence, and the e2e flow has not been run. All required gates pass.

### Spec status
Not ready for `implemented` yet. Recommend setting `Status: implemented` in `specs/07-pr-context.md` once the Playwright/e2e run confirms NFR-11. The user should also accept NFR-2 as unmeasured, or add a timing check.