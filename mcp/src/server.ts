/**
 * Builds the `McpServer` and wires the five tools onto it. Kept separate
 * from `index.ts` (the stdio transport) so tests can connect via
 * `InMemoryTransport` instead of spawning a real process.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from './api-client.js';
import type { McpConfig } from './config.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';

export interface ToolDeps {
  api: DevDigestApi;
  config: McpConfig;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

// 255 chars — well under the ≤400 budget a client charges against context at
// connect time. Keep it this short; it is loaded on every session, always.
export const INSTRUCTIONS =
  "DevDigest PR review via the local API (:3001, start with ./scripts/dev.sh). Workflow: list_agents → run_agent_on_pr(repo,pr,agent) for a verdict+findings → get_findings(run_id) if still running → get_conventions(repo) for house rules. repo = 'owner/name'.";

export function buildMcpServer(deps: ToolDeps): McpServer {
  const server = new McpServer(
    { name: 'devdigest-mcp', version: '0.1.0' },
    { instructions: INSTRUCTIONS },
  );

  registerListAgents(server, deps);
  registerRunAgentOnPr(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  // Registered only behind the flag — the tool is a stub (L04 homework),
  // and an always-present tool the client can't use yet is worse than none.
  if (deps.config.enableBlastRadius) {
    registerGetBlastRadius(server, deps);
  }

  return server;
}
