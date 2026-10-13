## Hand-back 1

No defects found with confidence of at least 0.6, so the result is empty. This was a read-only review and I ran nothing that changes files. I read the changes themselves (not just the diff hunks) and the code they call into.

**Server**
- `server/src/adapters/git/simple-git.ts`
  - `readFileAtCommit`, `ensureCommit` (single-flight plus the per-clone queue) and `doEnsureCommit`.
  - `server/src/adapters/git/ls-tree.ts`.
- `server/src/modules/_shared/pr-context.ts`, `pr-context-truncate.ts`, `pr-context-paths.ts`.
- `server/src/modules/pulls/context-service.ts`, `repository.ts`, `routes.ts`.
- `server/src/modules/reviews/run-executor.ts`.
  - The AC-24 double resolve and the project-context budget.
  - Trace and fingerprint on the success and failure paths.
- `server/src/modules/reviews/run.repo.ts` (the `->>` fingerprint join), `intent-classifier.ts` and `service.ts` (the fingerprint is stored).
- `server/src/modules/brief/*`.
- The migrations and the schema.
  - `pr_files.status`, `pull_requests.context_paths` and `pr_intent.context_fingerprint` all have columns.
  - `pr_brief` stores its fingerprint inside the JSON envelope, so it needs no column.

**Client and reviewer-core**
- `client/src/lib/hooks/pr-context.ts`
  - The optimistic save.
  - The `isMutating` checks in `onSuccess` and `onSettled`.
  - `isContextStale`.
- `ContextTab`, `IntentCard`, `PrBrief`, `RunHistory` and `ProjectContextSection`.
- `reviewer-core/src/prompt.ts`.

**Checks that held**
- The contract fields the server produces match what the client reads: `context_fingerprint` on the intent, run summary, trace and brief envelope, plus the `origin: 'pr'` match.
- The `isMutating <= 1` guards behave correctly, because the current mutation is still pending inside `onSuccess`.
- A `null` stored fingerprint reads as not stale, by design.

**Considered and dropped (below 0.6 confidence or not demonstrable)**
- A one-line document that exceeds the remaining budget becomes `over_budget` rather than `truncated`, because the truncation search caps at `lines.length - 1` lines. This is an intended edge, not a wrong result.
- If the head-commit fetch fails offline, `GET /context` returns an "unreadable" fingerprint that differs from a stored one, so a stale badge could show. This is speculative and not tied to a defect in the changed code.

| severity | file:line | defect | failing input |
|---|---|---|---|
| none | - | - | - |

```findings-json
{
  "reviewer": "bug",
  "findings": []
}
```