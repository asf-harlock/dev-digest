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
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — extract candidate coding conventions from a repo,
 * review/accept/reject/edit them, and merge the accepted ones into one or
 * more skill drafts (saved via the existing `POST /skills`).
 *
 *   POST  /repos/:id/conventions/extract        {mode?} → ConventionsSnapshot (sync; replaces all rows for the repo)
 *   GET   /repos/:id/conventions                → ConventionsSnapshot
 *   PATCH /conventions/:id                      → ConventionCandidate (accept/reject/edit)
 *   POST  /repos/:id/conventions/draft-skills   → SkillDraft[] (pure; no DB write)
 */

// Body stays a tolerant manual parse (mode optional; empty body is OK) —
// matches reviews/routes.ts's `POST /pulls/:id/review`.
const ExtractConventionsBody = z.object({
  mode: ConventionExtractionMode.default('both'),
});

const PatchConventionBody = z.object({
  category: ConventionCategory.optional(),
  rule: z.string().min(1).optional(),
  evidence: ConventionEvidence.partial().optional(),
  status: ConventionStatus.optional(),
});

const DraftSkillsBody = z.object({
  candidate_ids: z.array(z.string().uuid()).min(1),
  grouping: ConventionDraftGrouping,
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = ExtractConventionsBody.parse(req.body ?? {});
    return service.extract(workspaceId, req.params.id, body.mode);
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: PatchConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const row = await service.patch(workspaceId, req.params.id, req.body);
      if (!row) throw new NotFoundError('Convention not found');
      return row;
    },
  );

  app.post(
    '/repos/:id/conventions/draft-skills',
    { schema: { params: IdParams, body: DraftSkillsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.draftSkills(workspaceId, req.params.id, req.body.candidate_ids, req.body.grouping);
    },
  );
}
