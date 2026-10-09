import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, count, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { DigestService } from './service.js';
import { countByStatus } from './helpers.js';

const LiveParams = z.object({ owner: z.string().min(1), name: z.string().min(1) });

/**
 * Digest module.
 *   GET /digest/weekly                  → PRs opened in the last week, grouped by day
 *   GET /digest/repos/:id/summary       → PR counts per status for one repo
 *   GET /digest/live/:owner/:name       → open PR count straight from GitHub
 */
export default async function digestRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new DigestService(app.container);

  app.get('/digest/weekly', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.weekly(workspaceId);
  });

  app.get('/digest/repos/:id/summary', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const rows = await app.container.db
      .select({ status: t.pullRequests.status, total: count() })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.repoId, req.params.id)))
      .groupBy(t.pullRequests.status);
    return { repoId: req.params.id, byStatus: countByStatus(rows) };
  });

  app.get('/digest/live/:owner/:name', { schema: { params: LiveParams } }, async (req) => {
    await getContext(app.container, req);
    return service.liveOpenCount(req.params.owner, req.params.name);
  });
}
