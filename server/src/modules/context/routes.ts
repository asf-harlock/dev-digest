import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ContextService } from './service.js';

/**
 * Project Context module (SPEC-04) — markdown documents of a repo clone that
 * can be attached to agents and skills.
 *   GET  /repos/:id/context              → ContextListing (no file content)
 *   GET  /repos/:id/context/file?path=   → SpecFile WITH content (preview)
 *   POST /repos/:id/context/rescan       → git sync, then ContextListing
 *
 * Attaching happens on `PUT /agents/:id/context` and `PUT /skills/:id/context`.
 * A path that fails the UI-1 rules is a 422 `validation_error`.
 */

const FileQuery = z.object({ path: z.string().min(1) });

export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ContextService(app.container);

  app.get('/repos/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: FileQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.file(workspaceId, req.params.id, req.query.path);
    },
  );

  app.post('/repos/:id/context/rescan', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.rescan(workspaceId, req.params.id, req.log);
  });
}
