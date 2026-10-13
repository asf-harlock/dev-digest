## Hand-back 1

## Plan verification SPEC-05, round 2 (re-check of selected rows)

| ID | Status | Evidence |
|---|---|---|
| AC-8 | Pass | `READING_PATH_LIMIT` is now 5 (`constants.ts:9`). The new `it.test` at `onboarding-tour.it.test.ts:611` and the `helpers.test.ts:240` describe cover it. |
| AC-10 | Pass | `repository.ts` adds `getRanks`, which reads the stored `file_rank.rank` and not `percentile`. `service.ts collectFacts` uses it. The new test at `it.test.ts:585` uses equal percentile with distinct ranks. |
| AC-26 / S4.14 | Pass | The activity score now builds on stored rank, through the same `ranked` input (`service.ts:~317`). The `it.test.ts:424` test is titled "rank x (1 + hotness)" and asserts mode, window and ranking_fallback in meta. I did not independently inspect `helpers.ts`'s score formula line, because the diff doesn't touch it. |
| NFR-6 | Pass | The facts budget is `TOUR_TOKEN_BUDGET - count(system)` (`service.ts`). The new `it.test.ts:633` covers it. That test failed in one full-suite run and passes in isolation (see the gates section). |
| NFR-12 | Pass | A `logCtx` with repoId, provider, model, `ranking_mode`, `window_days` and `ranking_fallback` is spread into the degraded, failed and success logs. `it.test.ts:652` asserts it and that no prompt text appears. |
| EC-16 (per-package install) | Pass | `clone-files.ts` now sets a per-manifest `pm` and `ownLockfile`. `helpers.ts commandsFromManifest` emits `cd <dir> && <pm> install` when a package has its own lockfile or the repo has no root `package.json`. `helpers.test.ts` adds +47 lines covering it, and the `helpers.test.ts` tests pass. |
| NFR-7 / stale `onboarding.json` | Pass | The legacy keys (sections, regenerate, generate.*, unknownError) are removed from `client/messages/en/onboarding.json`. Client typecheck and tests pass. |
| EC-7 (`/settings/models`) | Pass | `SETTINGS_MODELS_HREF = "/settings/models"` is in `onboarding-tour/constants.ts:25`, and `TourHeader.test.tsx:71` asserts the link href. I did not check that the route exists in `client/src/app`. |
| EC-23 / UI-5 | Pass | The new `ArchitectureSection.test.tsx` renders raw `<img onerror>`, `<script>` and `<b>` and asserts no element is created and the text stays literal. It passes in the client run (359 tests). |
| AC-12 | Pass | `OnThisPage.test.tsx:98` ("AC-12: spy marks the heading in the top band; no hash is written before the user scrolls") exists and passes in the client run. |

### Gates re-run
`./scripts/check.sh <pkg> <gate>` needs a `[files]` argument, so it could not run the full gates. I ran the package scripts directly instead.
- Server typecheck, lint and arch pass.
- Client typecheck and arch pass. Client lint has 0 errors and 1 warning (an `<img>` in `SafeMarkdown`, which this diff doesn't touch). Client tests pass, 359 of 359.
- `reviewer-core` typecheck passes.
- `cd server && pnpm exec vitest run onboarding-tour.it.test` passes 26 of 26.
- `cd server && pnpm test` fails with 8 failed and 529 passed. I ran it twice, and the failures differ between runs.
  - The same 5 tests in `skills-stats.it.test.ts` and `skills.it.test.ts` fail in both runs, so they do not come from this diff.
  - `context-run.it.test.ts` failed in the first run only. The baseline run with the working tree stashed also had 8 failures.
  - Run 1 also failed `onboarding-tour.it.test.ts` "POST persists a model tour". Run 2 failed 3 different tests in that file, including the new NFR-6 test. All of them pass in isolation.
  - The cause looks like shared-DB contention when the Docker-backed files run in parallel. I did not diagnose it beyond that.

### Verdict
All 10 re-checked rows Pass. One caveat: the onboarding `it.test` file is flaky inside the full parallel `pnpm test` run (passes 26/26 when run alone), and 5 to 6 unrelated skills and context-run tests fail there too.