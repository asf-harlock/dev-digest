## Hand-back 1

## Test-writing report: SPEC-07 PR Context

I wrote the hermetic server and client tests, one Docker-backed `*.it.test.ts`, and one e2e step. All of it passes. The 3 failing `onboarding-tour.it.test.ts` tests and the failing `skills.it.test.ts` test are not mine, and I didn't touch them.

### Tests added/extended
New server files:
- `/Users/harlock/Downloads/Sites/devdigest/server/test/pulls-context-routes.test.ts` (26 tests) covers the three routes through `buildApp` with an in-memory `PullsRepository`. It checks:
  - 404 outside the workspace on all three routes (EC-22).
  - 422 on bad paths and on more than 20 paths, with nothing written (EC-23, NFR-5).
  - A save writes only the path list and makes no LLM call (AC-41, NFR-1).
  - The GET entries, origin badges, attachable list, suggestions and the map-reduce flag (AC-2, AC-3, AC-6, AC-9, AC-10).
  - The not-cloned, bad-SHA and missing-file states and the live injection warning (EC-1, EC-8, EC-24, EC-25).
  - The preview read at the head SHA versus the default branch (AC-42).
- `/Users/harlock/Downloads/Sites/devdigest/server/src/adapters/git/simple-git.test.ts` (17 tests) runs `readFileAtCommit` and `ensureCommit` against real temporary git repos. It covers:
  - Symlink, submodule, directory, over 64 KB, exactly 64 KB, NUL and non-UTF-8 files.
  - Bad SHAs, non-normal paths and literal pathspecs (EC-4..7, UI-2..4).
  - A real fetch of a missing head commit (EC-2).
  - A failed fetch that leaks no URL or git text (EC-3).
  - Three concurrent callers produce the same number of git fetches as one, counted with a `git` shim on PATH (NFR-3).
- `/Users/harlock/Downloads/Sites/devdigest/server/src/adapters/github/octokit.test.ts` (2 tests) covers the GitHub file-status mapping (AC-2).
- `/Users/harlock/Downloads/Sites/devdigest/server/test/run-executor-pr-context.test.ts` (9 tests) drives the real `ReviewRunExecutor`. It covers:
  - PR docs sent before project docs, and `origin: 'pr'` entries first in the trace.
  - `specs_read` and the fingerprint (AC-21, AC-22, AC-25, AC-28).
  - The `pr context: N doc(s) attached` log line, with no document text in it (AC-26).
  - The 16,000 minus PR tokens budget (AC-20) and the AC-24 dedupe in both directions.
  - Byte-identical behaviour with an empty list (EC-11), fetch failure (EC-3), a single resolve for two agents (EC-13), and a failed run still persisting its PR entries.
- `/Users/harlock/Downloads/Sites/devdigest/server/test/brief-pr-context.test.ts` (8 tests) covers:
  - The `## PR context` blocks replacing the agent-document fallback (AC-29).
  - The fallback path with a null fingerprint (AC-30, AC-31).
  - `specs_missing` naming each path and status when nothing resolves, and for a truncated doc (EC-9, EC-10).
  - The fetch-failure case (EC-3) and hostile text staying inside its block (EC-28).
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/reviews/intent-classifier.test.ts` (10 tests) covers:
  - EC-12: removing the guard and the `## PR context` section from a PR-context prompt gives the empty-list prompt byte for byte.
  - The `spec` sources `used` and `unreachable`, the fingerprint, and no agent or skill docs (AC-32..36).
  - A hostile path and forged tags (EC-28, UI-5, UI-6).
- `/Users/harlock/Downloads/Sites/devdigest/server/test/pulls-context.it.test.ts` (9 tests, Docker-backed) covers the three new columns, workspace-scoped GET/PUT, 422 and 404, and the run summary fingerprint read from the trace (AC-40, EC-21).

Extended server file:
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/brief/helpers.test.ts` gained 8 tests for the prompt section, label escaping, the whole-prompt fitter dropping PR docs last (EC-10), and `computeMissingInputs` with PR context.

Client, with `react-testing-library` applied:
- `/Users/harlock/Downloads/Sites/devdigest/client/src/app/repos/[repoId]/pulls/[number]/_components/ContextTab/ContextTab.test.tsx` (14 tests) uses a fake `fetch` and real hooks. It covers loading, error plus Retry, not cloned, empty and filter-no-match. It also covers the save-failure restore, controls disabled during a save, Move up/down, the checkbox accessible name and the aria-live regions. It checks the origin and token badges, the injection warning, the missing row, the suggestion Add, and the preview drawer's sanitising and meta row.
- `.../ContextTab/helpers.test.ts` covers `moveItem`, `filterPaths` and `isContextStale`.
- `.../PrDetailHeader/PrDetailHeader.test.tsx` covers tab position and the count badge (AC-1).
- Stale notes (AC-38..40, EC-21), with null fingerprint treated as not stale, are tested in `PrBrief.test.tsx`, `IntentCard.test.tsx` and `RunHistory.test.tsx`. In `IntentCard.test.tsx` I changed the existing `pr-context` hook mock into a configurable one that keeps the real `isContextStale`.
- `.../RunTraceDrawer/_components/ProjectContextSection/ProjectContextSection.test.tsx` covers the `PR` label, PR entries first, the `truncated` label, and plain-text rendering (AC-27, UI-8).

e2e:
- `/Users/harlock/Downloads/Sites/devdigest/e2e/specs/02-repo-pulls-detail.flow.json` has three new steps: click the "PR context" tab, `wait --url tab=context`, then `wait --text "cloned locally"` (NFR-11). I validated the JSON but did not run the flow, because it needs the full stack and the agent-browser CLI.

### Run result
- `./scripts/check.sh server typecheck`, `client typecheck`, `core typecheck`: all pass.
- `./scripts/check.sh server test`: pass, 597 of 597.
- `./scripts/check.sh client test`: pass, 471 of 471.
- `./scripts/check.sh core test`: pass, 67 of 67. I added no core tests, since `prompt.test.ts` already covers it.
- `./scripts/check.sh server lint`, `client lint`, `server arch`, `client arch`: all pass. `simple-git.test.ts` needed a file-level `no-restricted-syntax` disable with a reason, because it sets PATH and an env for child git processes.
- `cd server && pnpm exec vitest run .it.test` (Docker was up): the 9 new tests pass and the other `.it` suites pass, except as listed below.
  - `onboarding-tour.it.test.ts` has 3 failures, a suite `server/INSIGHTS.md` already lists as flaky.
  - `skills.it.test.ts` has 1 failure ("404s for an unknown skill…", got 422); the plan names the skills stats tests as already failing, and I did not look into this one.

### Findings (not fixed)
No test exposes a failing production bug. Three observations from reading the code:
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/brief/service.ts:367` stores a null fingerprint when a non-empty list's resolver throws (`.catch(() => null)`). That conflicts with Q6, which says a non-empty attached list always stores a non-null fingerprint (AC-31). It is an unlikely path and has no test.
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/reviews/run-executor.ts:285` computes the agent-doc budget from `prContext.tokensSent` before the AC-24 dedupe. Dropped identical PR copies still reduce the agent budget, although AC-20 says "actually sent".
- `MockGitClient.readFileAtCommit` returns a fake `blobId`, not a real git blob id, so AC-24 cannot match through the stock mock. My executor test uses a small subclass that returns `gitBlobId(text)`. I didn't edit `mocks.ts`.

`@testing-library/user-event` is not installed in `client/`, so the client tests use `fireEvent`. A Move-up button is pressed by dispatching a click, which is what Enter or Space does on a `<button>`.

### Out of scope / not covered
- NFR-2 (3 s timing), NFR-8 (a locale-file check) and NFR-9 (the two vendor copies being identical) have no test. NFR-10 has none directly either, though the tests do exercise the constants.
- UI-9 and NFR-12 are only partly covered. Run-log sanitising is checked through the executor, but the server log fields are not asserted.
- UI-12 (redaction gates) and the fork-PR fetch (Q-1) have no test.
- EC-16 (two browser tabs saving) is only checked as sequential saves, in the `.it` test.
- `reviewer-core` was not touched. `e2e/` was edited but not run.