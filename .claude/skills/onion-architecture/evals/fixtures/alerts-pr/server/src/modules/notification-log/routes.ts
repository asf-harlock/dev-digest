import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { NotificationLogService } from './service.js';
import { CHANNELS, LOG_MAX_PAGE_SIZE } from './constants.js';

const PageQuery = z.object({
  before: z.coerce.date().optional(),
  size: z.coerce.number().int().min(1).max(LOG_MAX_PAGE_SIZE).optional(),
});
const RecordBody = z.object({
  review_id: z.string().uuid(),
  finding_id: z.string().uuid(),
  channel: z.enum(CHANNELS),
});

/**
 * Notification-log module.
 *   GET  /notification-log     → newest first, cursor by `before`
 *   POST /notification-log     → record that a finding was announced
 */
export default async function notificationLogRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new NotificationLogService(app.container);

  app.get('/notification-log', { schema: { querystring: PageQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.page(workspaceId, req.query.before, req.query.size);
  });

  app.post('/notification-log', { schema: { body: RecordBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const { review_id, finding_id, channel } = req.body;
    const entry = await service.record(workspaceId, review_id, finding_id, channel);
    return reply.code(201).send(entry);
  });
}
