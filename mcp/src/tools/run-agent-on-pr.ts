import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toToolErrorResult } from '../errors.js';
import { REPO_ARG_DESCRIPTION, resolveAgent, resolvePull, resolveRepo } from '../resolvers.js';
import { newNonce } from '../security.js';
import type { ToolDeps } from '../server.js';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  reviewResultOutputSchema,
  shapeReviewResult,
  summarizeReviewResult,
  waitForRun,
  type WaitForRunExtra,
} from './review-result.js';

const inputSchema = {
  repo: z.string().min(1).describe(REPO_ARG_DESCRIPTION),
  pr: z.number().int().positive().describe('Pull request number.'),
  agent: z.string().min(1).describe('Agent id, or its name (case-insensitive).'),
  include_dismissed: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include findings the user already dismissed.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .default(DEFAULT_LIMIT)
    .describe(`Max findings to return (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT}).`),
};

function description(timeoutMs: number): string {
  const seconds = Math.round(timeoutMs / 1000);
  return (
    `Runs one review agent on a pull request and returns the finished result: verdict, score and findings sorted by severity, capped at \`limit\`. ` +
    `Waits up to ${seconds}s; if the run is still going it returns status:'running' with a run_id — then call get_findings(run_id) instead of starting another run. ` +
    'Each call starts a NEW paid LLM run (the only tool that writes; capped at 10 runs/minute).'
  );
}

export function registerRunAgentOnPr(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      title: 'Run agent on PR',
      description: description(deps.config.runTimeoutMs),
      inputSchema,
      outputSchema: reviewResultOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ repo, pr, agent, include_dismissed, limit }, extra) => {
      try {
        const repoRow = await resolveRepo(deps.api, repo);
        const pull = await resolvePull(deps.api, repoRow.id, repoRow.full_name, pr);
        const resolvedAgent = await resolveAgent(deps.api, agent);

        const { run_id } = await deps.api.startReview(pull.id, resolvedAgent.id);

        const waitExtra: WaitForRunExtra = {
          progressToken: extra._meta?.progressToken,
          // `extra.sendNotification` only accepts `ServerNotification`;
          // `WaitForRunExtra` intentionally widens to `unknown` so
          // `review-result.ts` doesn't need the SDK's notification types.
          sendNotification: extra.sendNotification as (notification: unknown) => Promise<void>,
        };
        const run = await waitForRun(deps, run_id, waitExtra);

        const review = run.status === 'done' ? await deps.api.getRunFindings(run_id) : null;
        const nonce = newNonce();
        const result = shapeReviewResult(
          run,
          review,
          { includeDismissed: include_dismissed, limit },
          nonce,
        );

        return {
          structuredContent: result,
          content: [{ type: 'text', text: summarizeReviewResult(result) }],
        };
      } catch (err) {
        return toToolErrorResult(err);
      }
    },
  );
}
