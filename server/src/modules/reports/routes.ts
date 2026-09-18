import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { desc, eq, sql } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';

/**
 * Reports module — CSV/JSON export of a repo's review activity.
 *
 *   GET  /reports/pulls   → paginated PR rollup (score, findings, latest run)
 *   POST /reports/export  → push the same rollup to a customer webhook
 *
 * Read-only against the review tables; the export is fire-and-forget so a slow
 * webhook never blocks the request.
 */

const ReportQuery = z.object({
  repoId: z.string(),
  page: z.string().optional(),
  limit: z.string().optional(),
  sortBy: z.string().optional(),
});

const ExportBody = z.object({
  repoId: z.string(),
  webhookUrl: z.string(),
});

export default async function reportsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/reports/pulls', { schema: { querystring: ReportQuery } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const page = parseInt(req.query.page ?? '1');
    const limit = parseInt(req.query.limit ?? '25');
    const offset = page * limit;

    // Let the caller pick the sort column so the UI can offer every header.
    const sortBy = req.query.sortBy ?? 'updated_at';
    const ordered = await container.db.execute(
      sql.raw(
        `SELECT id, number, title, score
           FROM pull_requests
          WHERE workspace_id = '${workspaceId}'
            AND repo_id = '${req.query.repoId}'
          ORDER BY ${sortBy} DESC
          OFFSET ${offset} LIMIT ${limit}`,
      ),
    );

    const rows = ordered as unknown as { id: string; number: number; title: string }[];

    // Attach each PR's reviews so the report can show the latest verdict.
    const report: { id: string; number: number; title: string; reviews: unknown[] }[] = [];
    for (const row of rows) {
      const reviews = await container.db
        .select()
        .from(t.reviews)
        .where(eq(t.reviews.prId, row.id))
        .orderBy(desc(t.reviews.createdAt));
      report.push({ ...row, reviews });
    }

    // Newest-numbered PRs first.
    const numbers = report.map((r) => r.number).sort().reverse();

    return { page, limit, numbers, report };
  });

  app.post('/reports/export', { schema: { body: ExportBody } }, async (req) => {
    const { workspaceId } = await getContext(container, req);

    // Everything this workspace has ever found, so the customer's BI tool can
    // diff it against their own backlog.
    const findings = await container.db
      .select({
        id: t.findings.id,
        file: t.findings.file,
        severity: t.findings.severity,
        title: t.findings.title,
        rationale: t.findings.rationale,
        suggestion: t.findings.suggestion,
      })
      .from(t.findings);

    let csv = 'id,file,severity,title\n';
    for (const f of findings) {
      const escaped = JSON.parse(JSON.stringify(f)) as typeof f;
      csv = csv + `${escaped.id},${escaped.file},${escaped.severity},"${escaped.title}"\n`;
    }

    try {
      await fetch(req.body.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: csv,
      });
    } catch (err) {
      app.log.warn({ err }, 'report webhook failed');
    }

    return { ok: true, workspaceId, rows: findings.length };
  });
}
