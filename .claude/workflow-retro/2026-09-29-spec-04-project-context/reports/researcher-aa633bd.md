## Hand-back 1

## Repository research: prior Project Context page and GET /repos/:id/context module

### Findings
- **No implementation ever existed in git history.** No commit on any branch (local or remote, `--all`) touches `server/src/modules/context/` or `client/src/app/repos/[repoId]/context/`. `git log --all -- <those paths>` returned nothing.
- The only history is the squashed snapshot `587c46a` (2026-06-14) and the later `06d8a79`. Both contain only client-side stubs and contract leftovers, so the server module and page were trimmed before the snapshot.
- Search hits:
  - `SpecFile`: `587c46a` and `06d8a79`.
  - `ProjectContextView`: `587c46a` only, as a comment.
  - `context/reindex`: `587c46a` only, in a client hook.
  - `specs_read`: `587c46a` only, as an unrelated trace field.
- `06d8a79` ("Intent Layer") only mentions `SpecFile` in a doc or spec text. It says the client calls `api.get<SpecFile[]>(...)` but there is "no server-side" route.
- **Route shapes are known only from the client hooks. No server handler existed.**
  - `GET /repos/:repoId/context` returns `SpecFile[]`.
  - `POST /repos/:repoId/context/reindex` returns `IndexStatus`.
  - The client comment calls this an "A3 contract; safe to call once API exposes it".
- **`SpecFile` fields** (all in the vendored contracts):
  - `path: string`
  - `content?: string | null`
  - `size?: int | null`
  - `updated_at?: string | null`
- **`IndexStatus` fields:**
  - `status`: enum of `idle`, `cloning`, `parsing`, `embedding`, `done`, `error`
  - `pct`: number, 0 to 100
  - `message?: string | null`
  - `chunks_indexed?: int | null`
- **DB tables:** no context-specific table, and no attachments table.
  - The closest is `code_chunks` (`id`, `workspace_id`, `repo_id`, `path`, `content`, `embedding` vector(1536), `source` enum `code|docs|spec`, default `code`). Its `source` enum suggests spec chunks were meant to live here.
  - `symbols`, `references` and `onboarding` are in the same schema file but are unrelated.
- **Discovery of `.md` files** (globs, roots, excludes, size limits): no code found. The only hint is in the i18n string, which says specs go "under .devdigest/specs/". There are no globs, excludes or size limits.
- **Attachments to agents or skills:** no evidence of any.
- **Chunk indexing, coverage metric, edit/upload:**
  - Chunk indexing: only a schema column (`code_chunks.source='spec'`) and the `chunks_indexed` field in `IndexStatus`. No implementation.
  - Coverage metric: none.
  - Edit/upload: the i18n file has `mode.preview/edit`, `editor.save`, `editor.loadError` and `resync` keys, so the UI was designed for edit and save. There is no PUT/POST route, hook or upload code for it.
- Trace `specs_read: string[]` (e.g. `'specs/security-baseline.md'` in `server/test/contracts.test.ts:165`) is always set to `[]` in `run-executor.ts:283,433`. It is not tied to a context module.

### Evidence
- `git ls-tree -r 587c46a` finds no `server/src/modules/context/` and no `client/src/app/repos/[repoId]/context/`. The only context-named files are:
  - `client/messages/en/context.json`
  - `server/src/db/schema/context.ts`
  - `server/src/modules/_shared/context.ts` (this is `getContext()` for tenancy, unrelated)
  - `client/src/lib/repo-context.tsx`
  - `client/src/components/app-shell/hooks/useShellContext.ts`
- `587c46a:client/src/lib/hooks/core.ts:122-136` defines `useContextFiles` (GET `/repos/${repoId}/context`) and `useReindexContext` (POST `/repos/${repoId}/context/reindex`).
- `587c46a:server/src/vendor/shared/contracts/platform.ts:244-259` defines `SpecFile` and `IndexStatus`. The same block is at `platform.ts:281-287` in HEAD's client copy.
- `587c46a:client/src/lib/hooks/repo-intel.ts:28` has the comment "The caller (ProjectContextView) owns when to stop polling". `ProjectContextView` has no definition anywhere.
- `587c46a:client/messages/en/context.json` has:
  - keys `title` ("Project Context"), `chunks`, `reindex`, `indexing`, `resync`, `indexStatus`, `empty`, `mode`, `editor`
  - empty body: "Drop your PRDs, tech specs, and acceptance criteria under .devdigest/specs/. Every agent and the PR brief read them as grounding context."
- `587c46a:server/src/db/schema/context.ts:44` has `source: text('source', { enum: ['code','docs','spec'] })`.
- `587c46a:server/src/modules/repo-intel/*` is a separate code-index pipeline (`walk.ts`, `full.ts`, `incremental.ts`, `routes.ts`) with its own `IndexStatus` type `'full'|'partial'|'degraded'|'failed'`. The `587c46a` grep for `.devdigest/specs` and `context/reindex` in server code found nothing, so it does not serve `/context`. I did not open its `routes.ts`, so its routes are unconfirmed.
- Server `README.md:10` at `587c46a` lists "brief/context/onboarding" among modules, but as a lesson roadmap item, not code.

### References
- Commits `587c46a` and `06d8a79`.
- `client/src/lib/hooks/core.ts` (at `587c46a`).
- `server/src/vendor/shared/contracts/platform.ts` (at `587c46a`).
- `server/src/db/schema/context.ts` (at `587c46a`).
- `client/messages/en/context.json` (at `587c46a`).

### Could not find
- Any server module, page component, handler, or file-discovery logic (globs, roots, excludes, size limits) for Project Context, in any branch.
- Any agent/skill attachment storage for spec files.
- Any coverage metric, or edit/upload route.
- The `git log -S` searches covered `--all` refs, including the `backup/L03-homework-pre-squash` branch. I did not inspect each branch tree individually. The path-scoped `git log --all` check returned nothing, so this is very likely complete.
- The `demo/*` and `test/*` branches were not checked separately.
- The spec text quoted from `06d8a79` was seen only via a `grep -n` of `git show`. I did not read the full file it belongs to.