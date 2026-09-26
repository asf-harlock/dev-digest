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

// Kept well under the ≤400 budget a client charges against context at
// connect time — it is loaded on every session, always.
export const INSTRUCTIONS =
  "DevDigest PR review via the local API (:3001, start with ./scripts/dev.sh). Workflow: list_agents → run_agent_on_pr(repo,pr,agent) for a verdict+findings → get_findings(run_id) if still running → get_conventions(repo) for house rules → get_blast_radius(repo,pr) for impact map. repo = 'owner/name'.";

export function buildMcpServer(deps: ToolDeps): McpServer {
  const server = new McpServer(
    { name: 'devdigest-mcp', version: '0.1.0' },
    { instructions: INSTRUCTIONS },
  );

  registerListAgents(server, deps);
  registerRunAgentOnPr(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server, deps);

  return server;
}
