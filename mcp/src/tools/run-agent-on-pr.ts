import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toToolErrorResult } from '../errors.js';
import { resolveAgent, resolvePull, resolveRepo } from '../resolvers.js';
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
  repo: z.string().min(1).describe("Repository as 'owner/name'."),
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

const DESCRIPTION =
  "Runs one review agent against a pull request end to end: resolves the repo/pr/agent, starts a NEW review run, and polls until it finishes or the poll budget runs out. Returns a verdict, score, and findings sorted by severity and capped at `limit`. If the run has not finished in time, returns status:'running' with the run_id so the caller can retry via get_findings. This is the only tool that writes, and it always starts a fresh run — call get_findings instead to re-check an existing one.";

export function registerRunAgentOnPr(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      description: DESCRIPTION,
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
