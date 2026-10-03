import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { OnboardingTourGenerateRequest, OnboardingTourResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { GENERATE_STATUS_RUNNING } from './constants.js';
import { OnboardingTourService } from './service.js';

/**
 * Onboarding tour module (SPEC-05).
 *   GET  /repos/:repoId/onboarding-tour           → OnboardingTourResponse (200)
 *   POST /repos/:repoId/onboarding-tour/generate  → { status: "running" } (202),
 *        409 `conflict` while a run holds the per-repo lock,
 *        422 `validation_error` for `window_days` outside 7..730.
 * Generation continues in the background; clients poll the GET.
 */

const Params = z.object({ repoId: z.string().uuid() });
const GenerateAccepted = z.object({ status: z.literal(GENERATE_STATUS_RUNNING) });

export default async function onboardingTourRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new OnboardingTourService(app.container);

  app.get(
    '/repos/:repoId/onboarding-tour',
    { schema: { params: Params, response: { 200: OnboardingTourResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.repoId);
    },
  );

  app.post(
    '/repos/:repoId/onboarding-tour/generate',
    {
      schema: {
        params: Params,
        body: OnboardingTourGenerateRequest.optional(),
        response: { 202: GenerateAccepted },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      await service.startGenerate(
        workspaceId,
        req.params.repoId,
        req.body ?? { mode: 'import_graph' },
        req.log,
      );
      return reply.code(202).send({ status: GENERATE_STATUS_RUNNING });
    },
  );
}
