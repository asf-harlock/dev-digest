## Hand-back 1

## SPEC-07 follow-up report

Items 1, 3, 4 and 5 are fixed. Item 2 is stopped because it needs a migration. All nine gates pass. Nothing is committed.

### Item 1: AC-42 preview contract (fixed)
- `PrContextPreview` in both `{server,client}/src/vendor/shared/contracts/platform.ts` (around line 394) now has `kind`, `origin`, `tokens` and `read_at_sha` (nullish). The two hunks are identical.
- The local `PrContextPreviewResponse` type is gone from `server/src/modules/pulls/context-service.ts`. `preview()` now returns `PrContextPreview`.
- `PrContextPreviewDrawer.tsx` shows a meta row from the typed `data`: kind, origin, tokens and the short read-at SHA. I added a `meta` style in `styles.ts`. I added i18n keys `kind.*` and `preview.readAt` to `client/messages/en/prContext.json`.

### Item 2: AC-2 "added" vs "modified" badge (STOPPED, no migration generated)
- `pr_files` (`server/src/db/schema/pulls.ts:39-51`) has only `id`, `prId`, `path`, `additions`, `deletions` and `patch`. There is no per-file status.
- To fix it: add a `status` text column to `pr_files` (`added | modified | removed | renamed`, default `modified`) and populate it where `pr_files` is written on PR import. The GitHub file objects already carry `status`.
- After that, extend `PrContextOrigin` to `added | modified | default_branch` in both vendor copies. Set origin in `context-service.ts` (`toEntry` and `preview`) and in `buildAttachableList` (`_shared/pr-context-paths.ts`). `PrContextRepository.changedFilePaths` would also have to return the status. Then add the client badge and i18n.
- I did not infer "added" from the patch hunk header, because that would be a heuristic.

### Item 3: AC-38..40 run-row stale note (fixed)
- `RunSummary.context_fingerprint: z.string().nullish()` is added to both `trace.ts` copies.
- `server/src/modules/reviews/repository/run.repo.ts`: `listRunsForPull` and `getRunSummary` now left-join `run_traces` and read `trace->>'context_fingerprint'`. `toRunSummary` takes it as an optional third argument.
- `server/test/run-repo.test.ts` is updated for the new field, with one new test for the fingerprint.
- `RunHistory.tsx` shows `t("timeline.contextStale")` on the run row when `isContextStale(r.context_fingerprint, currentContextFingerprint)` is true. `FindingsTab.tsx` calls `usePrContext(prId)` and passes the current fingerprint down. I did not call `usePrContext` inside `RunHistory`, because its test renders without a query client.
- AC-40 only asks for the note on the Agent runs row, so I removed it from `RunTraceDrawer.tsx`. That meant removing its now-unused `prId` prop and the `prId` passed in `page.tsx`, plus the `drawer.contextStale` key in `runs.json`. The text now lives at `prReview.json` `timeline.contextStale`.

### Item 4: EC-7 `not_utf8` (fixed)
- `not_utf8` is added to the failure reasons in both `adapters.ts` copies (`server/src/vendor/shared/adapters.ts:261`, `client/src/vendor/shared/adapters.ts:204`).
- `server/src/adapters/git/simple-git.ts:243-248` returns `not_utf8` for NUL bytes and for invalid UTF-8.
- `MockGitClient` in `server/src/adapters/mocks.ts` (`commitFiles` type, line 261) accepts it.
- `server/src/modules/_shared/pr-context.ts` (around line 203) maps `not_utf8` to `unreadable` explicitly.

### Item 5: intent fingerprint in PR detail (fixed)
- `server/src/modules/pulls/routes.ts`, in the intent DTO after `classified_for_sha`: `context_fingerprint: intentRow.contextFingerprint ?? null`.

### Gates
- PASS server:typecheck
- PASS server:lint
- PASS server:arch
- PASS server:test (517 passed)
- PASS client:typecheck
- PASS client:lint
- PASS client:arch
- PASS client:test (442 passed)
- PASS core:typecheck

### Budget check (AC-17)
Confirmed, no change needed.
- `resolvePrContext` defaults to `input.budget ?? PR_CONTEXT_TOKEN_BUDGET` (`server/src/modules/_shared/pr-context.ts:194`), and `PR_CONTEXT_TOKEN_BUDGET = 10_000` (`context-paths.ts:24`).
- The brief calls `resolvePrContext` without a `budget` override (`server/src/modules/brief/service.ts:317-323`), so it gets 10,000.
- The only "8_000" in the brief module is `MAX_DESCRIPTION_CHARS` (`brief/constants.ts:28`). That is a character cap on the author's description, not a token budget. The "8k" report is probably a confusion with it.

### Handoff
- I did not add a client test for the preview meta row, the run-row stale note, or the removal of the drawer note. Existing tests still pass.