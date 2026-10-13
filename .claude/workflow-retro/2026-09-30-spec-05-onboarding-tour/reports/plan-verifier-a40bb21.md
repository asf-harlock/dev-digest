## Hand-back 1

## Plan verification (pass 2 of 2): SPEC-05 Onboarding Tour (567ed70..HEAD c2f38fb)

Verdict: no row failed. 94 of 101 rows Pass; 7 rows are Pass on indirect evidence only (listed below). I recommend `Status: implemented`, subject to the caveats at the end.

### Gates re-run (my own runs)
- Server gates: `pnpm typecheck`, `pnpm lint` and `pnpm arch` all pass (189 modules, no violations). I ran the package scripts directly and did not use `check.sh`.
- Client gates: `pnpm typecheck` and `pnpm arch` pass (541 modules, no violations). `pnpm lint` has 0 errors and 1 pre-existing `<img>` warning.
- `cd reviewer-core && npm run typecheck` passes.
- `cd e2e && npm run typecheck` passes.
- `cd client && pnpm test`: 73 files, 359 tests pass.
- `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` (hermetic): 36 files, 406 tests pass.
- `cd server && pnpm exec vitest run onboarding-tour.it.test repo-intel`: 5 files, 53 tests pass. `onboarding-tour.it` alone is 27/27, and Docker was available.
- `./scripts/e2e.sh`: "10/10 flows passed". Flow 10 ("Onboarding tour renders its deterministic skeleton with the On this page menu") passes.
- I did not run the full parallel `pnpm test`, because you said not to gate on it.

### Matrix (compact)

**Plan steps 1-16: all Pass.**
- S1 (steps 1-3): the contract is in both shared copies, `GitClient.historyCounts` exists, and the contract tests pass (`server/test/onboarding-tour-contract.test.ts` and `client/src/vendor/shared/contracts/knowledge.test.ts`).
- S2 (steps 4-9): the server module, client route and components, sidebar item, hooks, tests, and e2e flow 10 all exist and pass.
- S3 (steps 10-13): covered by `enrichment.test.ts` and the LLM cases in `onboarding-tour.it`. I checked that `llm.calls` has length 1 per generation.
- S4 (steps 14-16): covered by the hotness, EC-9 fallback and stored-rank cases in `onboarding-tour.it`. The toggle and warning are covered by client tests.
- The "skills the implementer applies" row is not evidenced by any diff check. I am leaving it Unverified, as in pass 1.

**User story (US-1..US-5): Pass.**

**AC-1..AC-33: Pass.**
- Evidence is a named test or the e2e flow. Examples: AC-16 (`TourSection.test.tsx`), AC-11/13/14 (`OnThisPage.test.tsx:80`), AC-12 (`OnThisPage.test.tsx:98`), AC-15 (`OnThisPage.test.tsx:125`), AC-17/29 (`TourHeader.test.tsx:54`), AC-10/26 (`onboarding-tour.it.test.ts:608`).
- The AC-8, AC-10 and AC-26 fails from pass 1 are fixed and covered by tests.
- AC-28 has no literal ID in any test name. It is covered by the persisted-meta assertions in `onboarding-tour.it` (the "meta populated" test at line 301 and the stored-tour cases).

**EC-1..EC-23: Pass.**
- Each has a named test. Examples: EC-3 (`onboarding-tour.it:327`), EC-2 (:344), EC-9 (:484), EC-23 (`ArchitectureSection.test.tsx:18`), EC-7 (`TourHeader.test.tsx:68`).
- The latest commit's degraded-index case (B1, :388) keeps a stored model tour and records the reason in `last_error`.
- EC-8 is covered as the approved 422 plus disabled-option deviation.

**NFR-1..NFR-13: Pass.**
- The NFR-1, NFR-3 and NFR-11 tests have no literal ID in their names. They are covered by `llm.calls` length 1 (`onboarding-tour.it:306`), the determinism test (`helpers.test.ts:104`) and the contract defaults tests.
- NFR-13 is covered by the e2e flow and the client tests.

**UI-1..UI-10: Pass on evidence, but the direct evidence for UI-9 and UI-10 is thin. See the non-Pass rows.**

### Non-Pass rows
- None fail, are blocked, or have no evidence at all. These rows pass on indirect evidence only:
  - UI-3: output validation is covered by the EC-2 validation-failure test, with no UI-3 ID in any test.
  - UI-8: `historyCounts` uses argv arrays (`simple-git.ts:148`) and rejects a non-positive window (`RangeError`, `onboarding-tour.it:737`). There is no test of injection-shaped input.
  - UI-9: the collector reuses `readContextFile`, which refuses symlinks and `..` (`test/project-context.test.ts`). There is no tour-specific traversal test.
  - UI-10: the untrusted-block neutralisation test (`enrichment.test.ts:185`) covers it. No test feeds instruction-like repo text end to end.
  - Skills-applied row: Unverified (see above).
  - AC-28, NFR-3: no literal ID in any test name. They pass via the tests named above.
- The e2e flow asserts `nav[aria-label="On this page"]` (an approved deviation).

### Not covered by the plan
- Subpackage-only repos get no install command. This was noted in pass 1, and I did not re-check it.
- Flaky `onboarding-tour.it` timing under full parallel `pnpm test`, and the known pre-existing `skills*.it` failures. I did not run them, and they are not gated.

### Spec status
- Every spec ID is Pass, and the approved deviations were treated as intended. I recommend the user set `Status: implemented` in `/Users/harlock/Downloads/Sites/devdigest/specs/05-onboarding-tour.md`. The UI-8, UI-9 and UI-10 rows rest on indirect evidence. If you want direct tests for them, add them before the flip.