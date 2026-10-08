import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, count, eq, gte } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { AlertsService } from './service.js';
import { totalsBySeverity } from './helpers.js';
import { ALERT_LOOKBACK_HOURS, ONE_HOUR_MS } from './constants.js';

const DeliverBody = z.object({
  rule_id: z.string().min(1),
  severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
  message: z.string().min(1).max(500),
});

/**
 * Alerts module.
 *   GET  /alerts            → events from the last day
 *   GET  /alerts/summary    → event counts per severity
 *   POST /alerts/deliver    → record an event and push it to Slack
 */
export default async function alertsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AlertsService(app.container);

  app.get('/alerts', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listRecent(workspaceId);
  });

  app.get('/alerts/summary', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const since = new Date(Date.now() - ALERT_LOOKBACK_HOURS * ONE_HOUR_MS);
    const rows = await app.container.db
      .select({ severity: t.alertEvents.severity, total: count() })
      .from(t.alertEvents)
      .where(and(eq(t.alertEvents.workspaceId, workspaceId), gte(t.alertEvents.createdAt, since)))
      .groupBy(t.alertEvents.severity);
    return totalsBySeverity(rows);
  });

  app.post('/alerts/deliver', { schema: { body: DeliverBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const { rule_id, severity, message } = req.body;
    return service.deliver(workspaceId, rule_id, severity, message);
  });
}
