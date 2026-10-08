import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AlertRulesService } from './service.js';
import { RULE_NAME_MAX_LENGTH, SEVERITIES } from './constants.js';

const RuleBody = z.object({
  name: z.string().min(1).max(RULE_NAME_MAX_LENGTH),
  severity: z.enum(SEVERITIES),
});

/**
 * Alert-rules module.
 *   GET  /alert-rules               → rules of the workspace
 *   POST /alert-rules               → create a rule
 *   GET  /alert-rules/:id/preview   → how many findings the rule would match
 *   POST /alert-rules/:id/test      → push a test alert to Slack
 */
export default async function alertRulesRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AlertRulesService(app.container);

  app.get('/alert-rules', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post('/alert-rules', async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const body = RuleBody.parse(req.body);
    const rule = await service.create(workspaceId, userId, body.name, body.severity);
    return reply.code(201).send(rule);
  });

  app.get('/alert-rules/:id/preview', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.preview(workspaceId, req.params.id);
  });

  app.post('/alert-rules/:id/test', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.sendTest(req, workspaceId, req.params.id);
  });
}
