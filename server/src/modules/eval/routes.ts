import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  EvalCase,
  EvalCaseDetail,
  EvalCaseInput,
  EvalCaseLinks,
  EvalCaseListItem,
  EvalCaseUpdate,
  EvalCompare,
  EvalCompareQuery,
  EvalDashboard,
  EvalFindingSkills,
  EvalOverview,
  EvalRunDetail,
  EvalRunStart,
  EvalSkillCaseListItem,
  EvalSkillOverview,
  SkillEvalCaseRequest,
  SkillEvalRunRequest,
} from '@devdigest/shared';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalService } from './service.js';

/**
 * SPEC-08 — eval module.
 *   POST   /findings/:id/eval-case        → 201 EvalCase (turn a decided finding into a case)
 *   GET    /pulls/:id/eval-case-links     → EvalCaseLinks (findings of a PR that already have a case)
 *   GET    /agents/:id/eval-cases         → EvalCaseListItem[]
 *   GET    /eval-cases/:id                → EvalCaseDetail
 *   PATCH  /eval-cases/:id                → EvalCase (rename; edit rule B, SPEC-09)
 *   DELETE /eval-cases/:id                → 204
 *   POST   /agents/:id/eval-runs          → 202 EvalRunStart (runs in the background)
 *   GET    /agents/:id/eval-overview      → EvalOverview
 *   GET    /eval-runs/compare?a&b         → EvalCompare (registered before /eval-runs/:id)
 *   GET    /eval-runs/:id                 → EvalRunDetail
 *   GET    /eval-dashboard                → EvalDashboard
 *
 * SPEC-09 — Case Editor and finding → skill case:
 *   POST   /agents/:id/eval-cases         → 201 EvalCase (manual case)
 *   POST   /skills/:id/eval-cases         → 201 EvalCase (manual case)
 *   GET    /skills/:id/eval-cases         → EvalSkillCaseListItem[]
 *   GET    /findings/:id/eval-skills      → EvalFindingSkills
 *   POST   /findings/:id/skill-eval-case  → 201 EvalCase, or 200 when the skill already has one
 *   POST   /skills/:id/eval-runs          → 202 EvalRunStart (carrier agent, two arms per case)
 *   GET    /skills/:id/eval-overview      → EvalSkillOverview
 *   GET    /eval-runs/:id                 → EvalRunDetail (discriminated by owner_kind)
 *
 * 404 for an id outside the caller's workspace; 409/422 carry `error.code` and ids in `details`.
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService(app.container);

  app.post(
    '/findings/:id/eval-case',
    { schema: { params: IdParams, response: { 201: EvalCase } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createFromFinding(workspaceId, req.params.id);
      reply.status(201);
      return created;
    },
  );

  app.get(
    '/findings/:id/eval-skills',
    { schema: { params: IdParams, response: { 200: EvalFindingSkills } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listFindingSkills(workspaceId, req.params.id);
    },
  );

  app.post(
    '/findings/:id/skill-eval-case',
    {
      schema: {
        params: IdParams,
        body: SkillEvalCaseRequest,
        response: { 200: EvalCase, 201: EvalCase },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const { case: evalCase, created } = await service.createFromFindingForSkill(
        workspaceId,
        req.params.id,
        req.body.skill_id,
      );
      reply.status(created ? 201 : 200);
      return evalCase;
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseInput, response: { 201: EvalCase } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createManualCase(
        workspaceId,
        { kind: 'agent', id: req.params.id },
        req.body,
      );
      reply.status(201);
      return created;
    },
  );

  app.post(
    '/skills/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseInput, response: { 201: EvalCase } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createManualCase(
        workspaceId,
        { kind: 'skill', id: req.params.id },
        req.body,
      );
      reply.status(201);
      return created;
    },
  );

  app.get(
    '/skills/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalSkillCaseListItem) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listSkillCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/skills/:id/eval-runs',
    { schema: { params: IdParams, body: SkillEvalRunRequest, response: { 202: EvalRunStart } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const started = await service.startSkillRun(
        workspaceId,
        req.params.id,
        req.body.carrier_agent_id,
        req.log,
      );
      reply.status(202);
      return started;
    },
  );

  app.get(
    '/skills/:id/eval-overview',
    { schema: { params: IdParams, response: { 200: EvalSkillOverview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.skillOverview(workspaceId, req.params.id);
    },
  );

  app.get(
    '/pulls/:id/eval-case-links',
    { schema: { params: IdParams, response: { 200: EvalCaseLinks } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.caseLinks(workspaceId, req.params.id);
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCaseListItem) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listCases(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: EvalCaseDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getCase(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: EvalCaseUpdate, response: { 200: EvalCase } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.deleteCase(workspaceId, req.params.id);
    return reply.status(204).send();
  });

  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 202: EvalRunStart } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const started = await service.startRun(workspaceId, req.params.id, req.log);
      reply.status(202);
      return started;
    },
  );

  app.get(
    '/agents/:id/eval-overview',
    { schema: { params: IdParams, response: { 200: EvalOverview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.overview(workspaceId, req.params.id);
    },
  );

  // Static path wins over `/eval-runs/:id` in find-my-way; registered first for readability.
  app.get(
    '/eval-runs/compare',
    { schema: { querystring: EvalCompareQuery, response: { 200: EvalCompare } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.compare(workspaceId, req.query.a, req.query.b);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalRunDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getRun(workspaceId, req.params.id);
    },
  );

  app.get('/eval-dashboard', { schema: { response: { 200: EvalDashboard } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dashboard(workspaceId);
  });
}
