import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { TriageService } from './service.js';
import { DISMISS_REASON_MAX_LENGTH } from './constants.js';

const DismissBody = z.object({ reason: z.string().min(1).max(DISMISS_REASON_MAX_LENGTH) });
const ReviewParams = z.object({ reviewId: z.string().uuid() });

/**
 * Triage module.
 *   POST /findings/:id/accept          → mark a finding accepted
 *   POST /findings/:id/dismiss         → mark a finding dismissed, with a reason
 *   GET  /reviews/:reviewId/open       → findings not yet triaged
 */
export default async function triageRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new TriageService(app.container);

  app.post('/findings/:id/accept', { schema: { params: IdParams } }, async (req) => {
    await getContext(app.container, req);
    return service.accept(req, req.params.id);
  });

  app.post('/findings/:id/dismiss', { schema: { params: IdParams, body: DismissBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dismiss(req, workspaceId, req.params.id, req.body.reason);
  });

  app.get('/reviews/:reviewId/open', { schema: { params: ReviewParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listOpen(workspaceId, req.params.reviewId);
  });
}
