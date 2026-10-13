SPEC-07 follow-up: close contract gaps the user decided to fix. Plan: `.claude/sdd/SPEC-07/plan.md`. Spec: `.claude/sdd/SPEC-07/spec.md` (copy of `specs/07-pr-context.md`). All workstreams W1, W2a-d are done and uncommitted in the working tree; you are the only agent running, so you may edit any SPEC-07 file listed below. Vendor edits are approved for SPEC-07 hunks only — keep server/client copies of each SPEC-07 hunk identical; leave pre-existing drift alone. Do not commit.

Fix these five items:

1. **AC-42 preview contract.** `PrContextPreview` in `{server,client}/src/vendor/shared/contracts/platform.ts` lacks `kind`, `origin`, `tokens`, `read_at_sha`. The preview route already returns them via a local `PrContextPreviewResponse` type in `server/src/modules/pulls/`. Move them into the shared contract, drop the local widening type, and make the client preview drawer (`client/src/app/repos/[repoId]/pulls/[number]/_components/PrContextPreviewDrawer/`) read them through the typed contract and show them per AC-42.

2. **AC-2 origin badge.** `PrContextOrigin` is `changed | default_branch`; AC-2 needs "added in this PR" vs "modified in this PR". First check whether `pr_files` (server/src/db/schema) already stores a per-file status (added/modified/removed/renamed). 
   - If it does: extend the enum (e.g. `added | modified | default_branch`) in both copies, compute it in `server/src/modules/pulls/context-service.ts` (and `_shared/pr-context-paths.ts` `buildAttachableList` if that's where origin is set), and render the right badge + i18n in the client rows.
   - If it does NOT and a migration would be needed: STOP on this item only, do not generate a migration, finish the others, and report what column would be needed.

3. **AC-38..40 run-row stale note.** `RunSummary` has no `context_fingerprint`. Add `context_fingerprint: z.string().nullish()` to `RunSummary` in both vendor copies, populate it server-side from the run trace wherever run summaries are built (find it under `server/src/modules/reviews/`), and move/add the "Run used different PR context" note onto the Agent runs row (`RunHistory` / `ReviewRunAccordion` in the client), using `isContextStale` from `client/src/lib/hooks/pr-context.ts`. Keep the drawer note only if the spec also asks for it there; otherwise remove it.

4. **EC-7 reason.** Add `not_utf8` to `ReadFileAtCommitResult`'s failure reasons in both `adapters.ts` copies; have `server/src/adapters/git/simple-git.ts` return it for NUL bytes / invalid UTF-8 instead of `fetch_failed`; update `MockGitClient` in `server/src/adapters/mocks.ts`; map it to `unreadable` explicitly in `server/src/modules/_shared/pr-context.ts`.

5. **Intent fingerprint in PR detail.** `server/src/modules/pulls/routes.ts` (around lines 295-310) builds the `intent` DTO without `context_fingerprint`; add `context_fingerprint: intentRow.contextFingerprint` (the repo's `getIntent` already returns it), so the client's intent stale check (AC-36, AC-39) works.

Also check and report (do not change unless it's clearly a bug against the spec): the brief's PR-context path reportedly uses an "8k" default budget — confirm `resolvePrContext`'s default is `PR_CONTEXT_TOKEN_BUDGET` (10,000) per AC-17 and that the brief uses it.

Gates: `./scripts/check.sh server typecheck`, `server lint`, `server arch`, `server test`, `client typecheck`, `client lint`, `client arch`, `client test`, `core typecheck`. Report briefly: per item fixed/stopped with file:line, gate results, and the budget finding.