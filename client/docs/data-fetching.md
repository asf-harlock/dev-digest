# Data fetching

**Purpose:** How the UI talks to the API.

**What belongs here:** `lib/api.ts` and the `ApiError` taxonomy, the hook layer in `lib/hooks/`, query keys and invalidation, SSE subscription for live run logs.

**What does not belong here:** anything already covered by the module `README.md`,
and anything volatile enough to go stale within a lesson or two.

The layering rule itself (component → hook in `src/lib/hooks/*` → `lib/api.ts`) is in `CLAUDE.md`; this doc is the how.

## The single fetch point: `src/lib/api.ts`

- `apiFetch<T>(path, init)` is the only function that calls `fetch`. It prefixes `API_BASE` (`NEXT_PUBLIC_API_BASE`, default `http://localhost:3001`) and sets `content-type: application/json` only when a body is sent.
- Hooks use the `api` helper: `api.get | post | put | patch | del`. A falsy body is sent as no body. A `204` resolves to `undefined`.
- Always pass the response type as the generic, e.g. `api.get<Repo[]>("/repos")`. Types come from `src/lib/types.ts` or `@devdigest/shared`.
- Enforcement: eslint `no-restricted-globals` bans `fetch` in `src/app/**` and `src/components/**` (`eslint.config.mjs`). `src/lib/**` is exempt, and so are tests, which mock `fetch`.

## `ApiError`

`apiFetch` throws only `ApiError { message, status, code?, details? }`:

| Situation | `status` | `code` |
|---|---|---|
| Network failure / API down | `0` | `network_error` |
| Non-2xx with body `{ error: { code, message, details } }` | HTTP status | `error.code` |
| Non-2xx, non-JSON body | HTTP status | none (message is `"<status> <statusText>"`) |

Rules:

- Branch on `status` (or `code`), never on `message` text. Real examples: `err.status === 409` in `lib/hooks/brief.ts` and `lib/hooks/onboarding-tour.ts`; `err.code === "config_error"` in `brief.ts`.
- Narrow first: the code always checks `e instanceof ApiError` before reading `status`/`code` (`CreateSkillFromConventionsModal.tsx`, `brief.ts`), because a catch can hold a non-API error.
- Showing `error.message` to the user is the existing pattern for inline error bodies (e.g. `app/repos/[repoId]/pulls/page.tsx`); that is display, not branching.
- Global toasts are set up in `src/lib/providers.tsx`: every failed mutation toasts. A failed query toasts only when `status === 0` or `>= 500`. Expected 4xx (e.g. a 404 meaning "nothing yet") stay silent, so handle them inline from `error`/`isError`.
- Query defaults (`providers.tsx`): `retry: 1`, `staleTime: 30_000`, `refetchOnWindowFocus: false`. Hooks override per query, e.g. `retry: false` in `hooks/trace.ts`, `refetchInterval` in `usePulls`.

## Hooks: `src/lib/hooks/*`

- One file per domain (`core.ts` for settings/secrets/repos/pulls/context, plus `agents`, `reviews`, `trace`, `intent`, `smart-diff`, `blast`, `brief`, `pr-context`, `skills`, `conventions`, ...). `hooks/index.ts` re-exports most of them (not `conventions.ts` or `skills.ts`; import those from the file directly).
- Hook files start with `"use client"` (except the `index.ts` barrel) and import `api` via the relative `../api`.
- Queries: `useQuery({ queryKey, queryFn: () => api.get<T>(path), enabled })`. Use `enabled: !!id` when the id may be null (`usePulls`, `usePrReviews`).
- Mutations: `useMutation` + `useQueryClient`, with cache work in `onSuccess`.

### Query keys

Keys are literal arrays, resource name first, then ids: `["repos"]`, `["pulls", repoId]` (list), `["pull", prId]` (detail), `["reviews", prId]`, `["agent", id]`, `["context-file", repoId, path]`. There is no key factory; the same literal is repeated in the query and in every invalidation, so grep the key before renaming it.

### Invalidation after a mutation

- Default: `qc.invalidateQueries({ queryKey })` for every cache the write can change (`useAddRepo` -> `["repos"]`; `useRefreshRepo` -> `["repos"]` and `["pulls", repoId]`).
- Write the reply straight into the cache when it is the fresh resource: `qc.setQueryData` (`useUpdateSettings`, `useRescanContext`).
- Derived views need their own invalidation. Finding and run mutations also invalidate `["smart-diff", prId]` (`useFindingAction`, `useDeleteRun`, `useDeleteReview` in `reviews.ts`).
- Optimistic updates (`useSetAgentSkills`, `useSaveAgentContext` in `agents.ts`) follow `onMutate` (`cancelQueries`, snapshot, `setQueryData`) -> `onError` (roll back) -> `onSettled` (invalidate).
- Polling is by `refetchInterval` as a function of the data (`usePrRuns` polls every 4 s only while a run is `running`).

## SSE: live run logs

`useRunEvents(runIds)` in `hooks/reviews.ts` opens an `EventSource` on `${API_BASE}/runs/:id/events` per run, accumulates `RunEvent`s in state (not in the query cache), and closes on unmount or `onerror`. `kind: "error"` events call `notify.error` directly because they never pass through the global query/mutation error handlers. `EventSource` is not covered by the `fetch` ban; keep SSE inside a hook anyway.

## Add a hook for a new endpoint

1. Pick the domain file in `src/lib/hooks/` (or add one and `export *` it from `index.ts`).
2. Add or reuse the response type in `src/lib/types.ts` / `@devdigest/shared` (shared contracts exist in two copies; see root `CLAUDE.md`).
3. Write the hook with `api.<verb><T>(path)`; give a read a `queryKey` of `["<resource>", ...ids]` and `enabled` for nullable ids.
4. For a mutation, invalidate (or `setQueryData`) every key the write affects, including derived views.
5. In the component call the hook; handle failures from `error`/`isError` by `status`/`code`. Never call `fetch` there.
6. Test beside it as `<name>.test.tsx`: stub `fetch` with `vi.stubGlobal("fetch", …)` and wrap in a `QueryClientProvider` (pattern: `hooks/smart-diff.test.tsx`, `hooks/blast.test.tsx`).
