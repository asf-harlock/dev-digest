import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { BriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { GENERATE_STATUS_RUNNING, RATE_LIMIT } from './constants.js';
import { BriefService, type BriefServiceOptions } from './service.js';

/**
 * PR brief module (SPEC-06).
 *   GET  /pulls/:id/brief → BriefResponse (200); never calls the model.
 *   POST /pulls/:id/brief → { status: "running" } (202); 404 for a foreign PR,
 *        `config_error` without a key, 409 `conflict` while a run holds the lock.
 * Generation continues in the background; clients poll the GET.
 */

const GenerateAccepted = z.object({ status: z.literal(GENERATE_STATUS_RUNNING) });

export default async function briefRoutes(appBase: FastifyInstance, opts: BriefServiceOptions = {}) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BriefService(app.container, opts);

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: BriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 202: GenerateAccepted } },
      config: { rateLimit: RATE_LIMIT },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      await service.startGenerate(workspaceId, req.params.id, req.log);
      return reply.code(202).send({ status: GENERATE_STATUS_RUNNING });
    },
  );
}
