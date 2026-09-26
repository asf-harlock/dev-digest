import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * blast module — impact map for a PR: the symbols it changes, their callers,
 * and any HTTP endpoints/cron jobs reachable from those callers. Best-effort
 * over `repo-intel`'s `getBlastRadius`, which never throws (degrades via
 * `BlastRadius.degraded`/`reason` instead).
 *
 *   GET /pulls/:id/blast → BlastRadius
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);

  app.get('/pulls/:id/blast', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getBlastRadius(workspaceId, req.params.id);
  });
}
