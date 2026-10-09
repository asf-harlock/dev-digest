import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { RunExportService } from './service.js';
import { EXPORT_FORMATS, EXPORT_NAME_MAX_LENGTH } from './constants.js';

const ExportFormat = z.enum(EXPORT_FORMATS);
const CreatePresetBody = z.object({
  name: z.string().min(1).max(EXPORT_NAME_MAX_LENGTH),
  format: ExportFormat,
});
const ExportQuery = z.object({ format: ExportFormat.default('json') });

/**
 * Run-export module.
 *   GET  /exports/reviews?format=json|csv   → export past reviews
 *   POST /exports/presets                   → save a named export preset
 */
export default async function runExportRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RunExportService(app.container);

  app.get('/exports/reviews', { schema: { querystring: ExportQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.exportReviews(workspaceId, req.query.format);
  });

  app.post('/exports/presets', async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = CreatePresetBody.parse(req.body);
    const preset = await service.createPreset(workspaceId, body.name, body.format);
    return reply.code(201).send(preset);
  });
}
