import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CiExport,
  CiExportInput,
  CiInstallation,
  CiPreview,
  CiPreviewFileContent,
  CiRefreshInput,
  CiRefreshResult,
  CiRun,
  CiRunsQuery,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiService } from './service.js';

/**
 * SPEC-11 — Export to CI. None of these routes makes an LLM call.
 *   POST /agents/:id/ci/preview            → CiPreview (DB + runner dist only; no GitHub call)
 *   GET  /agents/:id/ci/preview/file       → CiPreviewFileContent (a runner file, read on demand)
 *   POST /agents/:id/export-ci             → 201 CiExport (new installation) | 200 (re-publish)
 *   POST /agents/:id/export-ci/archive     → application/zip (installation recorded as `manual`)
 *   GET  /agents/:id/ci/installations      → CiInstallation[]
 *   GET  /ci/installations                 → CiInstallation[] (whole workspace)
 *   POST /ci/refresh                       → CiRefreshResult[]
 *   GET  /ci/runs                          → CiRun[] (stored rows only)
 * Errors carry `error.code` (see `CiErrorCode`) and ids in `details`.
 */

const ZIP_CONTENT_TYPE = 'application/zip';
const TRIGGER_SEPARATOR = ',';

/** `?triggers=opened,synchronize` → the enum array of `CiExportInput`; absent → its default. */
const TriggersQuery = z
  .string()
  .optional()
  .transform((v) =>
    v === undefined
      ? undefined
      : v
          .split(TRIGGER_SEPARATOR)
          .map((t) => t.trim())
          .filter((t) => t !== ''),
  )
  .pipe(CiExportInput.shape.triggers);

const PreviewFileQuery = z.object({
  repo: CiExportInput.shape.repo,
  target: CiExportInput.shape.target,
  post_as: CiExportInput.shape.post_as,
  triggers: TriggersQuery,
  path: z.string().min(1),
});

export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container);

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiExportInput, response: { 200: CiPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/agents/:id/ci/preview/file',
    { schema: { params: IdParams, querystring: PreviewFileQuery, response: { 200: CiPreviewFileContent } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.previewFile(workspaceId, req.params.id, req.query);
    },
  );

  app.post(
    '/agents/:id/export-ci',
    { schema: { params: IdParams, body: CiExportInput, response: { 200: CiExport, 201: CiExport } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const { created, body } = await service.exportToPr(workspaceId, req.params.id, req.body);
      reply.status(created ? 201 : 200);
      return body;
    },
  );

  app.post(
    '/agents/:id/export-ci/archive',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const { filename, bytes } = await service.exportArchive(workspaceId, req.params.id, req.body);
      return reply
        .type(ZIP_CONTENT_TYPE)
        .header('content-disposition', `attachment; filename="${filename}"`)
        .header('cache-control', 'no-store')
        .send(Buffer.from(bytes));
    },
  );

  app.get(
    '/agents/:id/ci/installations',
    { schema: { params: IdParams, response: { 200: z.array(CiInstallation) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listInstallations(workspaceId, req.params.id);
    },
  );

  app.get(
    '/ci/installations',
    { schema: { response: { 200: z.array(CiInstallation) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listInstallations(workspaceId);
    },
  );

  app.post(
    '/ci/refresh',
    { schema: { body: CiRefreshInput, response: { 200: z.array(CiRefreshResult) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.refresh(workspaceId, req.body);
    },
  );

  app.get(
    '/ci/runs',
    { schema: { querystring: CiRunsQuery, response: { 200: z.array(CiRun) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listRuns(workspaceId, req.query);
    },
  );
}
