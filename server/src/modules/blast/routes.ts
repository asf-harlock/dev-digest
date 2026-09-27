import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * blast module — impact map for a PR: the symbols it changes, their callers,
 * and any HTTP endpoints/cron jobs reachable from those callers. Best-effort
 * over `repo-intel`'s `getBlastRadius`, which never throws (degrades via
 * `BlastRadius.degraded`/`reason` instead).
 *
 *   GET /pulls/:id/blast → BlastRadius
 *
 * `schema.response` makes the serializer validate every reply against the
 * contract, so a mapping bug is a 500 here instead of a malformed map in the
 * UI or MCP. The log line records where the map came from: `index`
 * (repo-intel's persistent tables, no re-parse) or `fallback` (degraded).
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadius } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const blast = await service.getBlastRadius(workspaceId, req.params.id);
      req.log.info(
        {
          prId: req.params.id,
          source: blast.degraded ? 'fallback' : 'index',
          reason: blast.reason,
          symbols: blast.changed_symbols.length,
          callers: blast.downstream.reduce((n, d) => n + d.callers.length, 0),
        },
        'blast radius served',
      );
      return blast;
    },
  );
}
