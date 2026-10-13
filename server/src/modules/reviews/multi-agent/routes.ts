import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MultiAgentRunRequest } from '@devdigest/shared';
import { getContext } from '../../_shared/context.js';
import { IdParams } from '../../_shared/schemas.js';
import { MULTI_AGENT_RATE_LIMIT } from '../constants.js';
import type reviewsRoutes from '../routes.js';
import { MultiAgentService } from './service.js';

// The Fastify instance type, taken from the sibling entry file: `pnpm arch`
// (http-framework-only-in-routes) only recognises `<module>/routes.ts` as an
// entry file, not a nested `routes.ts`, so this file must not import fastify itself.
type App = Parameters<typeof reviewsRoutes>[0];

/**
 * multi-agent module (specs/11-multi-agent-review.md).
 *   POST /pulls/:id/multi-agent-run  {agentIds}  → start N agents as one grouped run; returns the snapshot
 *   GET  /pulls/:id/multi-agent                  → the PR's latest multi-agent run (404 when none)
 *   GET  /multi-agent/estimates                  → per-agent median duration/cost over the last done runs
 */
export default async function multiAgentRoutes(appBase: App) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new MultiAgentService(container);

  // Tight per-route limit: each call fans out to N expensive LLM runs.
  app.post(
    '/pulls/:id/multi-agent-run',
    { schema: { params: IdParams, body: MultiAgentRunRequest }, config: { rateLimit: MULTI_AGENT_RATE_LIMIT } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.startRun(workspaceId, req.params.id, req.body.agentIds, req.log);
    },
  );

  app.get('/pulls/:id/multi-agent', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getLatest(workspaceId, req.params.id);
  });

  app.get('/multi-agent/estimates', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.estimates(workspaceId);
  });
}
