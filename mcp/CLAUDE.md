# @devdigest/mcp

Local stdio MCP server exposing DevDigest PR review as five tools
(`list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`,
`get_blast_radius`). A thin HTTP client over `@devdigest/api` on `:3001` —
never touches the database or a server module directly.

## Read when

- **Understanding the tools, registration or how to verify a change** →
  read `README.md`.
- **Debugging something that smells familiar** → read `INSIGHTS.md`; run the
  `engineering-insights` skill at the end of the task to add to it.

## Rules

- **stdio only.** `index.ts` owns the transport; nothing under `src/` may write
  to stdout — that stream is JSON-RPC protocol traffic only. All diagnostics go
  to stderr via `console.error`.
- **Thin HTTP adapter.** `api-client.ts` talks to `@devdigest/api` over `fetch`.
  Never import a `server/src/modules/**` file at runtime — that would couple a
  standalone process to internals owned by a different package with its own
  lifecycle (see Gotchas).
- **`@devdigest/shared` imports are type-only** (`import type { … } from
  '@devdigest/shared'`). The tsconfig alias points at the server's vendored
  copy; a runtime import would pull server code into this process.
- **Tool contracts:** flat arguments (no `z.union`, no nested objects), a
  concise structured response (`outputSchema` + `structuredContent`) plus one
  short text line for non-structured clients, and free text sourced from a PR
  or an LLM (`title`, `rationale`, `suggestion`, `rule`, …) wrapped with
  `wrapUntrusted()` (`security.ts`) before it reaches a result.
- **Errors are actionable.** Every tool funnels failures through
  `McpToolError` + `toToolErrorResult` (`errors.ts`) — a stable code plus a
  short sentence that tells the caller what to do next, never a stack trace.
- **`instructions` stays ≤400 chars** (`server.ts`, checked by `server.test.ts`)
  — a client loads it on every session, so it is not the place for prose. No
  tool sets `alwaysLoad`.
- This package uses npm (`package-lock.json`), not pnpm.

## Gotchas

- **Why a separate process, not a module inside `server/`:** `buildApp()`
  reaps stale `running` runs on boot, which is only correct for a single API
  instance per database (`server/CLAUDE.md`). Claude Code can start a new MCP
  process per session; several of those talking to the DB directly would
  conflict. Going through HTTP instead also means the existing rate limit and
  Fastify validation apply for free, and the onion-architecture boundaries in
  `server/` stay untouched.
- **Gates are NOT wired into `/pr-self-review`.** `mcp/` files route to
  `unrouted` there: adding an `mcp` bucket to `routing.json`/`run-gates.sh`
  (and CI) was deliberately deferred when this package was created. Run `cd mcp && npm run typecheck && npm
  test` manually before opening a PR that touches this package, and say so in
  the PR body.
- `get_blast_radius` is registered only when `DEVDIGEST_MCP_ENABLE_BLAST_RADIUS
  =true` — it is a stub that always returns `isError:true`. An always-listed
  tool a client can't actually use yet is worse than an absent one.
- **Never add a `zod` path alias to `tsconfig.json`** (the `"zod": ["./node_modules/zod"]`
  trick `reviewer-core` uses). With it, every `server.registerTool(...)` call
  fails with `TS2589 Type instantiation is excessively deep` and `tsc` can run
  out of memory before printing anything. Without it, a bare `import { z } from 'zod'`
  type-checks in about 1 s. `@devdigest/shared` types then resolve zod from
  `server/node_modules`, which is harmless because those imports are type-only.
