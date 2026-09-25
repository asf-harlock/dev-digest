# `@devdigest/mcp` — local PR-review MCP server

A local, stdio-only [MCP](https://modelcontextprotocol.io) server that exposes
DevDigest PR review as tools an MCP client (Claude Code, the Inspector, …) can
call directly: run an agent on a PR and get back a verdict plus findings,
without leaving the chat.

It never touches the database. Every tool is a thin HTTP call to the running
`@devdigest/api` on `:3001` — the same rate limits and validation the web UI
gets apply here too.

## Prerequisites

1. `@devdigest/api` (and Postgres) must be running: from the repo root,
   `./scripts/dev.sh` (or `docker compose up -d` + `cd server && pnpm
   db:migrate && pnpm db:seed && pnpm dev`).
2. `cd mcp && npm install` (npm, not pnpm — see the root `CLAUDE.md`).

## Registering with an MCP client

The repo root `.mcp.json` registers this server:

```json
{
  "mcpServers": {
    "devdigest": {
      "command": "npm",
      "args": ["--prefix", "mcp", "run", "--silent", "start"],
      "env": { "DEVDIGEST_API_URL": "http://localhost:3001" }
    }
  }
}
```

`npm --prefix mcp run --silent start` (not `npx tsx mcp/src/index.ts`): the
repo root has no `node_modules`, so a bare `npx tsx` there fetches a fresh,
unpinned `tsx` from the registry instead of using the version pinned in
`mcp/package.json` — slower, and not the version this package was tested
against. `--silent` also keeps npm's own banner off stdout, which matters
here: stdout is JSON-RPC protocol traffic only (see Gotchas in `CLAUDE.md`).

Claude Code picks this up automatically from the repo root. No `alwaysLoad` is
set on any tool — nothing here is preloaded into every session for free.

## Environment variables

See `.env.example`. All are optional; `.mcp.json` only sets `DEVDIGEST_API_URL`.

| Var | Default | Meaning |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Base URL of `@devdigest/api`. |
| `DEVDIGEST_MCP_RUN_TIMEOUT_MS` | `55000` | How long `run_agent_on_pr` polls before returning `{status:'running'}`. |
| `DEVDIGEST_MCP_POLL_INTERVAL_MS` | `2000` | Poll interval while a review run is in progress. |
| `DEVDIGEST_MCP_ENABLE_BLAST_RADIUS` | `false` (must be exactly `true` to enable) | Registers the `get_blast_radius` stub tool. |

## Tools

| Tool | Args | Returns | Notes |
|---|---|---|---|
| `list_agents` | — | `{agents:[…]}` (no `system_prompt`/`output_schema`) | Read-only, idempotent. |
| `run_agent_on_pr` | `repo, pr, agent, include_dismissed?, limit?` | `{status, run_id, verdict, score, counts, total, truncated, findings[]}` | The only tool that writes. Starts a review, polls `GET /runs/:id`, and returns findings once done — or `{status:'running'}` past the timeout, with a hint to call `get_findings`. |
| `get_findings` | `run_id, include_dismissed?, limit?` | Same shape as `run_agent_on_pr` | Reads back a run started earlier. |
| `get_conventions` | `repo, limit?` | `{repo, scanned, rules[], note}` | Only `accepted` conventions; empty + a `note` if the repo hasn't been scanned. |
| `get_blast_radius` | `repo, pr` | Always `isError:true` | **Stub** — registered only under `DEVDIGEST_MCP_ENABLE_BLAST_RADIUS=true`. L04 homework: wire it to `container.repoIntel.getBlastRadius` (`server/src/modules/repo-intel/service.ts:220`) and the `BlastRadius` contract (`server/src/vendor/shared/contracts/brief.ts:53`). |

`repo` is always `owner/name`. Free text sourced from a PR or an LLM's own
output (`title`, `rationale`, `suggestion`, `rule`, …) is wrapped in a
per-call `<untrusted-…>` boundary before it reaches a result — see
`security.ts`.

## Verifying a change

```sh
cd mcp && npm run typecheck && npm test
```

Gates here are **not** wired into `/pr-self-review` (see `CLAUDE.md`) — run
them by hand before opening a PR that touches this package.

To exercise the server end to end:

```sh
./scripts/dev.sh   # from the repo root, if not already running
npx @modelcontextprotocol/inspector --cli npx tsx mcp/src/index.ts --method tools/list
```

Then call a tool against the seeded demo data (`acme/payments-api`, PR #482),
e.g. `--method tools/call --tool-name list_agents`.

From inside Claude Code with the repo's `.mcp.json` picked up, run `/context
all` — the session should only be charged for the tool names and the
`instructions` string (≤400 chars) at connect time, nothing per-tool beyond that.
