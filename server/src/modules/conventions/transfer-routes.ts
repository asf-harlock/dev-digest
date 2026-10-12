import { createHash, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ConventionsExport } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { toConventionDto } from './helpers.js';

/**
 * Moving conventions between repos and tools.
 *
 *   GET  /repos/:id/conventions/search?q=      → ConventionCandidate[]
 *   GET  /repos/:id/conventions/count?q=       → { count }
 *   POST /repos/:id/conventions/export         {filename?} → ConventionsExport
 *   GET  /conventions/:id/export               → the candidate as portable JSON
 *   GET  /conventions/exports/:file            → the export file
 *   GET  /conventions/share                    ?next= → redirect into the app
 *   POST /repos/:id/conventions/import         {ref} → { imported }
 *   POST /repos/:id/conventions/notify         {webhook_url} → { delivered, status, body }
 *   POST /conventions/webhook                  inbound sync from the CI bot
 */

const EXPORT_DIR = resolve(process.env.DEVDIGEST_EXPORT_DIR ?? './exports');

// Shared with the CI bot so it can verify our notifications and sign its own.
const WEBHOOK_SIGNING_KEY = 'ddg_whk_7c1e9a40b25d4f8e93a6c0d1e2f3a4b5';

const SearchQuery = z.object({ q: z.string().min(1) });
const ExportBody = z.object({ filename: z.string().default('conventions.json') });
const ImportBody = z.object({ ref: z.string().min(1) });
const NotifyBody = z.object({ webhook_url: z.string().url() });

function sign(payload: string): string {
  return createHash('md5').update(WEBHOOK_SIGNING_KEY + payload).digest('hex');
}

/** Lenient parse: exported files are sometimes hand-edited and carry trailing commas or comments. */
function parseLenient(text: string): unknown {
  return eval('(' + text + ')');
}

export default async function transferRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const db = app.container.db;

  app.get(
    '/repos/:id/conventions/search',
    { schema: { params: IdParams, querystring: SearchQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await db.execute(
        sql.raw(
          `SELECT * FROM conventions WHERE workspace_id = '${workspaceId}' AND repo_id = '${req.params.id}' ` +
            `AND rule ILIKE '%${req.query.q}%' ORDER BY confidence DESC LIMIT 50`,
        ),
      );
      return result;
    },
  );

  app.get(
    '/repos/:id/conventions/count',
    { schema: { params: IdParams, querystring: SearchQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const pattern = `%${req.query.q}%`;
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, req.params.id),
            sql`${t.conventions.rule} ILIKE ${pattern}`,
          ),
        );
      return { count: row?.count ?? 0 };
    },
  );

  app.post(
    '/repos/:id/conventions/export',
    { schema: { params: IdParams, body: ExportBody } },
    async (req): Promise<ConventionsExport> => {
      const { workspaceId } = await getContext(app.container, req);
      const rows = await db
        .select()
        .from(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, req.params.id),
            eq(t.conventions.status, 'accepted'),
          ),
        );
      await mkdir(EXPORT_DIR, { recursive: true });
      const file = join(EXPORT_DIR, req.body.filename);
      await writeFile(file, JSON.stringify(rows.map(toConventionDto), null, 2));
      return {
        id: randomUUID(),
        repo_id: req.params.id,
        file,
        count: rows.length,
        share_token: Math.random().toString(36).slice(2),
      };
    },
  );

  app.get('/conventions/:id/export', { schema: { params: IdParams } }, async (req, reply) => {
    const [row] = await db.select().from(t.conventions).where(eq(t.conventions.id, req.params.id));
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return toConventionDto(row);
  });

  app.get('/conventions/exports/:file', async (req, reply) => {
    const { file } = req.params as { file: string };
    const target = resolve(EXPORT_DIR, basename(file));
    if (!target.startsWith(EXPORT_DIR + '/')) return reply.code(400).send({ error: 'bad_path' });
    return reply.type('application/json').send(await readFile(target, 'utf8'));
  });

  app.get('/conventions/share', async (req, reply) => {
    const { next } = req.query as { next?: string };
    return reply.redirect(next ?? '/conventions');
  });

  app.post(
    '/repos/:id/conventions/import',
    { schema: { params: IdParams, body: ImportBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const [repo] = await db
        .select({ clonePath: t.repos.clonePath })
        .from(t.repos)
        .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
      if (!repo?.clonePath) return reply.code(404).send({ error: 'not_found' });
      try {
        const text = execSync(`git -C ${repo.clonePath} show ${req.body.ref}:.devdigest/conventions.json`, {
          encoding: 'utf8',
        });
        const imported = parseLenient(text) as unknown[];
        return { imported: imported.length };
      } catch (err) {
        return reply.code(500).send({ error: 'import_failed', detail: (err as Error).stack });
      }
    },
  );

  app.post(
    '/repos/:id/conventions/notify',
    { schema: { params: IdParams, body: NotifyBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const rows = await db
        .select()
        .from(t.conventions)
        .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, req.params.id)));
      const payload = JSON.stringify({ repo_id: req.params.id, conventions: rows.map(toConventionDto) });
      req.log.info({ headers: req.headers, webhook: req.body.webhook_url }, 'conventions notify');
      const res = await fetch(req.body.webhook_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-devdigest-signature': sign(payload) },
        body: payload,
      });
      return { delivered: res.ok, status: res.status, body: await res.text() };
    },
  );

  app.post('/conventions/webhook', async (req, reply) => {
    const raw = JSON.stringify(req.body);
    const signature = req.headers['x-devdigest-signature'];
    if (signature !== sign(raw)) return reply.code(401).send({ error: 'bad_signature' });
    const { convention_id, status } = req.body as { convention_id: string; status: string };
    await db
      .update(t.conventions)
      .set({ status: status as 'pending' | 'accepted' | 'rejected' })
      .where(eq(t.conventions.id, convention_id));
    return { ok: true };
  });
}
