## Hand-back 1

## S1 report: SPEC-05 slice 1 (steps 1-3)

### Files changed (not committed)
- `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts`
  - The staged `Onboarding`, `OnboardingSection` and `OnboardingLink` are replaced.
  - New schemas: `TourSectionKind`, `TourSource`, `TourRankingMode`, five typed section schemas combined in a `TourSection` discriminated union, and `TourMeta`.
  - `Onboarding` is now `{sections, meta}`.
  - Also new: `OnboardingTourResponse`, which holds `stored`, `generating`, `stale`, `tour`, `model_hint`, `file_count` and `can_use_activity`.
  - Also new: `OnboardingTourGenerateRequest`, which has `mode` and `window_days` (int, 7..730).
  - The server copy uses `.default()` and the client copy uses `.optional()`.
  - Persisted jsonb fields use `.nullish()`.
- `server/src/vendor/shared/adapters.ts` (server copy only, as authorised): added `GitClient.historyCounts(repo, sinceDays): Promise<Record<string, number>>`. The JSDoc states the error contract: a `RangeError` for a non-integer or out-of-range `sinceDays` (1..3650), and an `Error` for a missing clone, git failure or 60 s abort. It never returns partial counts, and callers decide the fallback.
- `server/src/adapters/git/simple-git.ts`: implemented `historyCounts`.
  - It runs `git fetch --shallow-since=<N>.days.ago origin` and `git log --name-only --pretty=format: --since=…` through `g.raw([...])` argv arrays, with no shell interpolation.
  - One `AbortController` gives a 60 s abort over both commands.
  - It checks the integer window before running git, and throws a clear error when `.git` is missing.
- `server/src/adapters/mocks.ts`: `MockGitClient.historyCounts`, driven by new `MockGitOptions.historyCounts` and `historyError`.
- New tests: `server/test/onboarding-tour-contract.test.ts` and `client/src/vendor/shared/contracts/knowledge.test.ts`. They cover meta defaults, old-document parsing, null tolerance, round trip, unknown section kind, and the window_days bounds (6, 7, 730, 731 and non-integer).
- `server/test/contracts.test.ts`: updated the existing `Onboarding.parse` fixture (around line 143) from the old `{title, links}` shape to the new architecture section shape.

### Gates
- PASS server:typecheck 3s
- PASS client:typecheck 2s
- PASS core:typecheck 1s
- PASS server:test 2s (368 passed)
- PASS client:related (7 passed) for the new client contract test
- PASS client:test 7s (312 passed). This was an extra run.

### Deviations and notes
- I edited `server/test/contracts.test.ts`, which the plan did not list. The old-shape `Onboarding` fixture failed under the new contract, and the plan says to replace that contract.
- Nothing else imports the old `Onboarding*` symbols. A grep of server/, client/ and reviewer-core/ found only doc comments in `vendor/shared/index.ts`.
- The client test sits at `client/src/vendor/shared/contracts/knowledge.test.ts`, inside the vendor directory. The plan said "next to the client copy", and vitest's `src/**/*.test.ts` include picks it up.
- The `historyCounts` window cap of 3650 days is my addition. The 7..730 bound is enforced at the request contract.
- `historyCounts` was not exercised against a real git repo. It is covered by typecheck only, and the mock is for tests.
- Handoff: the fetch deepens the clone permanently (Q-7, accepted). `--shallow-since` on a full clone is a harmless no-op.

---

## Hand-back 2

## Follow-up fix: first-task `complexity` (AC-9)

The contract gap is fixed in both copies, the server skeleton now sets complexity on every deterministic first task, and the client card shows it as text. Nothing is committed. All gates pass after a lint fix in my own slice-1 code (details below).

### Files changed
- `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts`: `TourFirstTask` gains `complexity: z.enum(['low','medium','high']).nullish()`. It is the same in both copies, so old stored rows still parse.
- `server/src/modules/onboarding-tour/helpers.ts`:
  - New exported `firstTaskComplexity(paths)`: `low` when there are no targets or every target is a docs/tests/md path, `medium` otherwise.
  - The rule is documented in the code.
  - `buildFirstTasks` sets `complexity` on all three skeleton tasks.
  - `high` is left for the model in slice 3.
- `server/src/modules/onboarding-tour/helpers.test.ts`: new `firstTaskComplexity` tests.
- `server/test/onboarding-tour-contract.test.ts` and `client/src/vendor/shared/contracts/knowledge.test.ts`: complexity cases (absent, null, valid, invalid).
- `client/src/app/repos/[repoId]/onboarding-tour/_components/FirstTasksSection/FirstTasksSection.tsx`: the badge shows "Low/Medium/High complexity (suggested)" as text, and falls back to "Suggestion" alone when complexity is null or absent.
- `client/src/app/repos/[repoId]/onboarding-tour/_components/FirstTasksSection/FirstTasksSection.test.tsx`: new test file for the badge.
- `client/messages/en/onboarding.json`: new `tour.complexity.{low,medium,high}` and `tour.suggestedComplexity` keys.
- `server/src/adapters/git/simple-git.ts`: the server lint run flagged a `preserve-caught-error` error in my slice-1 `historyCounts`. I fixed it by passing `{ cause: err }` to the timeout error.

### Gates
- PASS server:typecheck
- PASS server:lint (after the `cause` fix)
- PASS server:test (384 passed)
- PASS client:typecheck
- PASS client:lint
- PASS client:test (343 passed)
- PASS core:typecheck

### Deviations
None beyond the `simple-git.ts` lint fix above.