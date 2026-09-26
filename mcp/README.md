# `@devdigest/mcp` — local PR-review MCP server

A local, stdio-only [MCP](https://modelcontextprotocol.io) server that exposes
DevDigest PR review as tools an MCP client (Claude Code, the Inspector, …) can
call directly: run an agent on a PR and get back a verdict plus findings,
without leaving the chat.

It never touches the database. Every tool is a thin HTTP call to the running
`@devdigest/api` on `:3001` — the same rate limits and validation the web UI
gets apply here too.

## From zero

The app's scripts (`./scripts/dev.sh`, `./scripts/e2e.sh`, `docker compose`)
never start this server. It is a stdio process that an MCP client (Claude
Code, the Inspector) spawns for itself, one per session, and only once you
enable it. There is no daemon to keep running.

**Prerequisites:** Node ≥22 with npm, pnpm ≥10, Docker, and Claude Code.

1. **Bring up the API** from the repo root:
   `./scripts/dev.sh --no-client`, or plain `./scripts/dev.sh` if you also
   want the web UI. It starts Postgres, runs the migrations and the seed, and
   serves `@devdigest/api` on `:3001`. Check it with
   `curl -s localhost:3001/agents`, which should return JSON.
2. **Add an LLM key** (needed only for `run_agent_on_pr`): open the web UI →
   **Settings**. Keys are stored in `~/.devdigest/secrets.json`, never in the
   repo.
3. **Install the package:** `cd mcp && npm ci`. Use npm, not pnpm; `npm ci`
   installs exactly what `package-lock.json` pins.
4. **Check it:** `npm run typecheck && npm test`.
5. **Smoke-test it without Claude Code:** from the repo root, run the Inspector
   command under [Verifying a change](#verifying-a-change). You should see four
   tools, and `list_agents` should return the seeded agents.
6. **Use it from Claude Code:** see [On-demand use](#on-demand-use-claude-code)
   below.

## On-demand use (Claude Code)

`.mcp.json` only *declares* the server. Whether it connects is a per-developer
switch kept in the git-ignored `.claude/settings.local.json`:

```json
{ "disabledMcpjsonServers": ["devdigest"] }
```

With that setting, new sessions start without the server: its tools and its
`instructions` cost nothing. When you need it:

1. Make sure the API is up (step 1 above).
2. In the Claude Code session, run `/mcp enable devdigest` and check its status
   with `/mcp`. The four tools are now available.
3. When you are done, run `/mcp disable devdigest`, so the next sessions start
   without it again.

If you answered "use all project servers" at the trust prompt instead, the
server connects in every session. Put `devdigest` into
`disabledMcpjsonServers` (and out of `enabledMcpjsonServers`) to go back to
on-demand use.

**Troubleshooting**

- Every call returns `api_unavailable` → the API is not running. Go back to
  step 1.
- `/mcp` shows the server as *failed* → run
  `npm --prefix mcp run --silent start` from the repo root. The server should
  print `[devdigest-mcp] ready …` on stderr and then wait for input (Ctrl-C to
  quit). Any error printed there is the reason.
- A code change isn't picked up → run `/mcp reconnect devdigest`. The process
  is spawned once per connection.

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

No `alwaysLoad` is set on any tool, so nothing here is preloaded into a
session. Claude Code asks once whether to trust the project's `.mcp.json`
servers. Whether `devdigest` then connects in every session is up to you: see
[On-demand use](#on-demand-use-claude-code).

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
npx @modelcontextprotocol/inspector --cli --config .mcp.json --server devdigest --method tools/list
```

Then call a tool against the seeded demo data (`acme/payments-api`, PR #482),
e.g. `--method tools/call --tool-name list_agents`. Add
`-e DEVDIGEST_MCP_ENABLE_BLAST_RADIUS=true` to include the stub.

From inside Claude Code with the repo's `.mcp.json` picked up, run `/context
all` — the session should only be charged for the tool names and the
`instructions` string (≤400 chars) at connect time, nothing per-tool beyond that.
