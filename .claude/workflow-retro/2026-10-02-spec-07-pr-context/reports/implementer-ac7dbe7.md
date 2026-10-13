## Hand-back 1

## SPEC-07 AC-2 follow-up: per-file status and added/modified origin badges

All nine gates pass.

**Migration** `/Users/harlock/Downloads/Sites/devdigest/server/src/db/migrations/0018_green_ironclad.sql`, generated with `pnpm db:generate`:
```sql
ALTER TABLE "pr_files" ADD COLUMN "status" text DEFAULT 'modified' NOT NULL;
```
- `meta/_journal.json` and `meta/0018_snapshot.json` were updated by drizzle.
- `0017_happy_james_howlett.sql` is untouched.
- Rows already in the DB read as `modified` until the PR detail is refreshed from GitHub.

**GitHub status mapping** (`mapFileStatus` in `server/src/adapters/github/octokit.ts`):
- `added` → `added`
- `removed` → `removed`
- `renamed` → `renamed`
- `modified`, `copied`, `changed`, `unchanged` and anything unknown → `modified`

At the context layer, `renamed` and `modified` both show as `modified`, and `removed` falls back to `default_branch`.

**Files changed (server)**
- `server/src/db/schema/pulls.ts`: `status` column on `prFiles`.
- `server/src/adapters/github/octokit.ts`: the mapping above, applied to each file object.
- `server/src/modules/pulls/routes.ts`: the import insert writes `status`, and the persisted-files DTO returns it.
- `server/src/db/seed.ts`: `docs/rate-limiting.md` is seeded as `added`.
- `server/src/modules/pulls/repository.ts`: `changedFilePaths` is replaced by `changedFiles()`, which returns `{path, status}`.
- `server/src/modules/_shared/pr-context-paths.ts`: new `originFor` and `changedStatusMap` helpers. `buildAttachableList` now takes changed files with their status and drops `removed` ones.
- `server/src/modules/pulls/context-service.ts`: `toEntry` and `preview` set origin through `originFor`. A removed file is not attachable, because it doesn't exist at head. Suggestions also skip removed files, since they only draw from the attachable list.
- `server/src/modules/_shared/pr-context-paths.test.ts`: updated to the new signature, with a `removed` case.

**Files changed (shared contract, both copies, identical hunks)**
- `server/src/vendor/shared/contracts/platform.ts` and `client/src/vendor/shared/contracts/platform.ts`.
- `PrContextOrigin` is now `added | modified | default_branch`; `changed` is removed.
- I also added a `PrFileStatus` enum and an optional `status` field on `PrFile`. This goes beyond what you listed, but the GitHub client contract has no other way to carry the status to the importer. The field is optional, so mocks and existing callers still compile.

**Files changed (client)**
- `client/messages/en/prContext.json`: `origin.changed` is replaced by `origin.added` ("added in this PR") and `origin.modified` ("modified in this PR"). The wording is lowercase, as in AC-2.
- The Context tab rows (`PrContextRow.tsx`) and the preview drawer (`PrContextPreviewDrawer.tsx`) already render `t('origin.${origin}')`, so no component change was needed. No client code compared against `'changed'`.

**Gates**
- `./scripts/check.sh server typecheck`: PASS
- `./scripts/check.sh server lint`: PASS
- `./scripts/check.sh server arch`: PASS
- `./scripts/check.sh server test`: PASS (517 passed)
- `./scripts/check.sh client typecheck`: PASS
- `./scripts/check.sh client lint`: PASS
- `./scripts/check.sh client arch`: PASS
- `./scripts/check.sh client test`: PASS (442 passed)
- `./scripts/check.sh core typecheck`: PASS

Not run: the Docker-backed `*.it.test.ts` suites, and I did not apply the migration to a database. Nothing was committed.