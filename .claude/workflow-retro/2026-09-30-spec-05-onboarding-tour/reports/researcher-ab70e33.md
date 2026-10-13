## Hand-back 1

## Repository research: when repo indexing runs / what changes on resync

### Findings
1. Job kinds (`repo-intel-index`, `repo-intel-refresh`, `repo-intel-resync`) are registered in `RepoIntelService.registerIndexJobHandlers`. Handlers: INDEX -> `indexRepo` (full), REFRESH -> `refreshIndex` (incremental), RESYNC -> `resyncRepo` (git sync, then incremental).
2. Enqueue callers (only three exist):
   - On clone: `RepoService.runCloneJob` enqueues INDEX (full) after `updateClonePath`. Enqueue failures are swallowed.
   - Manual "refresh" (`RepoService.refresh`, the repos refresh route): enqueues a CLONE job and also a REFRESH job. The code comment says the incremental pass is a no-op if HEAD is unchanged. Clone completion also enqueues a new INDEX job, so a full index can follow a refresh. That last point is my inference from the two code paths, not something I checked at runtime.
   - Manual resync: `POST /repos/:id/resync` enqueues RESYNC and returns 202.
   - I found no `POST /repos/:id/reindex` route. The comment in `repos/service.ts:73` mentions it, but `grep reindex` over the routes files finds nothing.
   - `indexRepo` and `refreshIndex` can also be called inline, for example by the CI runner (per the comment at `service.ts:118-121`). I did not trace those call sites.
3. Polling never triggers indexing. `POST /repos/:id/poll` only syncs the PR list from GitHub. It is manual, not a timer, and contains no enqueue or index code. The Context module's `rescan` does `git.sync` but does not index.
4. `lastIndexedSha` and `updatedAt` on a resync (`runIncremental` in `pipeline/incremental.ts`):
   - No clone: returns degraded `no_clone` and writes nothing.
   - `git.sync` fails: returns degraded and writes nothing.
   - HEAD SHA equals `lastIndexedSha`: only `touchIndexState`, which bumps `updatedAt`. `lastIndexedSha` and `filesIndexed` are unchanged. So `updatedAt` changes on EVERY successful resync even when HEAD is the same.
   - HEAD changed but no changed files in a supported extension: `advanceSha` sets the new `lastIndexedSha` and bumps `updatedAt`. `filesIndexed` is unchanged.
   - HEAD changed with supported changes: `upsertIndexState` writes the new SHA, `filesIndexed`, and `updatedAt`.
   - Fallbacks to a full index (`runFullIndex`): no state row, `indexerVersion` mismatch, `diffNameOnly` failure, or a diff larger than `INCREMENTAL_FULL_THRESHOLD`. A full index writes the new SHA and a fresh count.
   - Conclusion: `lastIndexedSha` changes only when HEAD moves. `updatedAt` is a liveness timestamp and is not a change signal.
   - Caveat: a SHA bump does not always mean parsed code changed. The `advanceSha` branch moves the SHA for docs-only or unsupported-extension commits. A SHA-based stale check therefore over-reports staleness compared with a code-based one.
5. `filesIndexed`:
   - Stored in the `repo_index_state.files_indexed` column (integer, not null, default 0). The table has one row per repo, keyed by `repo_id`. Other columns: `last_indexed_sha`, `indexer_version`, `status`, `files_skipped`, `stats`, `updated_at`.
   - Full index: count of files parsed in that run.
   - Incremental: prior count plus files in this slice, so it is approximate. A re-parsed file is counted again (per the code at `incremental.ts:257-260`). It is not an exact file count after incremental runs.
   - Exposed via `GET /repos/:id/index-state`, which returns `container.repoIntel.getIndexState(id)`. With no row it returns a synthesized degraded state: `lastIndexedSha: ''`, `filesIndexed: 0`, `reason: 'no_data'`, `updatedAt: new Date(0)`.
6. For the "stale tour" definition: comparing a tour's stored SHA to `getIndexState(repoId).lastIndexedSha` works. Treat an empty `''` SHA as "no index / unknown", not as stale. The SHA only advances after a clone-triggered INDEX, a refresh, or a resync, so a tour can look fresh while the remote has newer commits that haven't been synced yet.

### Evidence
- `server/src/modules/repo-intel/service.ts:172-182` — registers INDEX/REFRESH/RESYNC handlers.
- `server/src/modules/repo-intel/service.ts:122-133` — `indexRepo` calls `runFullIndex`; `refreshIndex` calls `runIncremental`.
- `server/src/modules/repo-intel/service.ts:143-162` — `resyncRepo` does `git.sync`, then `runIncremental`.
- `server/src/modules/repo-intel/service.ts:189-205` — `getIndexState`, including the synthesized degraded row.
- `server/src/modules/repos/service.ts:50-78` — `runCloneJob` enqueues INDEX at L68; the L73 comment mentions `POST /repos/:id/reindex`.
- `server/src/modules/repos/service.ts:112-136` — `refresh` enqueues CLONE (L117) and REFRESH (L129).
- `server/src/modules/repo-intel/routes.ts:32-63` — `GET /repos/:id/index-state` and `POST /repos/:id/resync` (enqueue at L53, 202).
- `server/src/modules/polling/routes.ts:10-66` — poll is PR-list sync only, `reviewTriggered: false`.
- `server/src/modules/repo-intel/pipeline/incremental.ts:96-105` — `sha_unchanged` branch touches `updatedAt` only.
- `server/src/modules/repo-intel/pipeline/incremental.ts:118-129` — `advanceSha` branch when no supported changes.
- `server/src/modules/repo-intel/pipeline/incremental.ts:257-270` — `upsertIndexState` with summed `filesIndexed`.
- `server/src/modules/repo-intel/pipeline/full.ts:271-274` — full index writes the new SHA and count.
- `server/src/modules/repo-intel/repository.ts:296-334` — `upsertIndexState` and `touchIndexState` (only `updatedAt`, plus `stats` if passed).
- `server/src/modules/repo-intel/repository.ts:340-343` — `advanceSha`.
- `server/src/db/schema/repo-intel.ts:36-46` — `repo_index_state` columns.

### References
- /Users/harlock/Downloads/Sites/devdigest/server/src/modules/repo-intel/service.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/modules/repo-intel/routes.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/modules/repo-intel/repository.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/modules/repo-intel/pipeline/incremental.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/modules/repo-intel/pipeline/full.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/modules/repos/service.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/modules/polling/routes.ts
- /Users/harlock/Downloads/Sites/devdigest/server/src/db/schema/repo-intel.ts

### Could not find
- A `/repos/:id/reindex` route. It is mentioned only in a comment.
- Any automatic or timer-based indexing. Everything is triggered by a user action: add repo, refresh, or resync.
- I did not check the CI-runner callers of inline `indexRepo`/`refreshIndex`.
- I did not check the repos routes file that exposes `refresh`. I only read the service method.
- I did not read `runFullIndex`'s failure paths closely (`full.ts` around L109 and L337 return degraded results with `filesIndexed: 0`). I did not confirm whether those paths overwrite the existing state row.