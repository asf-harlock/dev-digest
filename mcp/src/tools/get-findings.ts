import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpToolError, notFound, toToolErrorResult } from '../errors.js';
import { newNonce } from '../security.js';
import type { ToolDeps } from '../server.js';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  reviewResultOutputSchema,
  shapeReviewResult,
  summarizeReviewResult,
} from './review-result.js';

const inputSchema = {
  run_id: z.string().min(1).describe('The run_id returned by run_agent_on_pr.'),
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
  'Fetches the verdict and findings for a review run already started by run_agent_on_pr, without starting a new one. Returns the same shape as run_agent_on_pr: verdict, score, and findings sorted by severity and capped at `limit`, with dismissed findings excluded by default. If the run is still in progress, returns status:\'running\' — call again shortly. Read-only and safe to call repeatedly with the same run_id.';

export function registerGetFindings(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_findings',
    {
      title: 'Get findings',
      description: DESCRIPTION,
      inputSchema,
      outputSchema: reviewResultOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ run_id, include_dismissed, limit }) => {
      try {
        const run = await deps.api.getRun(run_id).catch((err: unknown) => {
          if (err instanceof McpToolError && err.code === 'not_found') {
            throw notFound(`Run '${run_id}' not found. Call run_agent_on_pr to start one.`);
          }
          throw err;
        });

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
