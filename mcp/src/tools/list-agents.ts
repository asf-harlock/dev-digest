/**
 * `list_agents` — flat, no-input tool that lists the review agents
 * configured in this workspace, so a caller can pick which one to pass to
 * `run_agent_on_pr`. Deliberately narrower than the shared `Agent` contract:
 * `system_prompt` and `output_schema` are prompt material, never surfaced to
 * an MCP client (they're also the two fields most likely to carry secrets
 * or proprietary prompt engineering).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toToolErrorResult } from '../errors.js';
import type { ToolDeps } from '../server.js';

const AgentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  strategy: z.string(),
  ci_fail_on: z.string(),
});

// A single `z.object(...)` schema, NOT a raw `{key: zodSchema}` shape —
// passing a raw shape here makes the SDK's `registerTool` generic infer a
// `Record<string, AnySchema>` and structurally compare every property
// against `z3.ZodTypeAny | z4.$ZodType`, which blows up with
// "Type instantiation is excessively deep and possibly infinite" (TS2589)
// on TS 5.9 + @modelcontextprotocol/sdk 1.30.1's zod-compat layer. A single
// object schema is assignable to `AnySchema` directly, without that
// per-property recursion.
const outputSchema = z.object({
  agents: z.array(AgentSummarySchema),
});

export function registerListAgents(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'list_agents',
    {
      title: 'List agents',
      description:
        "List the review agents configured in this workspace — id, name, description, provider, model, enabled, strategy and ci_fail_on. Never returns an agent's system_prompt or output_schema. Pass an agent's id or name as run_agent_on_pr's `agent` argument.",
      outputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
    },
    async () => {
      try {
        const agents = await deps.api.listAgents();
        const summaries = agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          description: agent.description,
          provider: agent.provider,
          model: agent.model,
          enabled: agent.enabled,
          strategy: agent.strategy,
          ci_fail_on: agent.ci_fail_on,
        }));

        return {
          structuredContent: { agents: summaries },
          content: [{ type: 'text', text: `${summaries.length} agent(s) available.` }],
        };
      } catch (err) {
        return toToolErrorResult(err);
      }
    },
  );
}
