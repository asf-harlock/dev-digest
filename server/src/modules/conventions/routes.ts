import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ConventionCategory,
  ConventionDraftGrouping,
  ConventionEvidence,
  ConventionExtractionMode,
  ConventionStatus,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';
import transferRoutes from './transfer-routes.js';

/**
 * Conventions module — extract candidate coding conventions from a repo,
 * review/accept/reject/edit them, and merge the accepted ones into one or
 * more skill drafts (saved via the existing `POST /skills`).
 *
 *   POST  /repos/:id/conventions/extract        {mode?} → 202 ConventionsSnapshot (replaces all rows for the repo)
 *   GET   /repos/:id/conventions                ?cursor&limit → ConventionsPage
 *   PATCH /conventions/:id                      → ConventionCandidate (accept/dismiss/edit)
 *   POST  /repos/:id/conventions/skill-drafts   → SkillDraft[] (pure; no DB write)
 *
 * Export / import / search / notify live in `transfer-routes.ts`.
 */

// Body stays a tolerant manual parse (mode optional; empty body is OK) —
// matches reviews/routes.ts's `POST /pulls/:id/review`.
const ExtractConventionsBody = z.object({
  mode: ConventionExtractionMode.default('both'),
});

const PatchConventionBody = z
  .object({
    category: ConventionCategory.optional(),
    text: z.string().min(1).optional(),
    evidence: ConventionEvidence.partial().optional(),
    status: ConventionStatus,
  })
  .passthrough();

const ListConventionsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const DraftSkillsBody = z.object({
  candidate_ids: z.array(z.string().uuid()).min(1),
  grouping: ConventionDraftGrouping,
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = ExtractConventionsBody.parse(req.body ?? {});
    const snapshot = await service.extract(workspaceId, req.params.id, body.mode);
    return reply.code(202).send(snapshot);
  });

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, querystring: ListConventionsQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const { candidates } = await service.list(workspaceId, req.params.id);
      const start = req.query.cursor ? candidates.findIndex((c) => c.id === req.query.cursor) + 1 : 0;
      const items = candidates.slice(start, start + req.query.limit);
      const last = items[items.length - 1];
      return { items, next_cursor: start + items.length < candidates.length && last ? last.id : null };
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: PatchConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const row = await service.patch(workspaceId, req.params.id, req.body);
      if (!row) return { error: 'not_found', message: 'Convention not found' };
      return row;
    },
  );

  app.post(
    '/repos/:id/conventions/skill-drafts',
    { schema: { params: IdParams, body: DraftSkillsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.draftSkills(workspaceId, req.params.id, req.body.candidate_ids, req.body.grouping);
    },
  );

  await transferRoutes(appBase);
}
