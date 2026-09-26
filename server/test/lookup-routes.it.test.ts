/**
 * The two MCP-facing lookup routes (used by `mcp/src/resolvers.ts`):
 *   GET /repos/lookup?full_name=owner/name
 *   GET /repos/:id/pulls/lookup?number=N
 * Both need Postgres for `getContext()` (system user/workspace) and the seed
 * data, so they're integration tests — same shape as `pulls-comments.it.test.ts`.
 * Runs against the seeded demo repo/PR (`acme/payments-api`, PR #482,
 * `src/db/seed.ts`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { RepoRef, PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Counts calls so the pulls-lookup route can be proven to never sync from GitHub. */
class CountingGitHubClient extends MockGitHubClient {
  public listPullRequestsCalls = 0;
  override async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    this.listPullRequestsCalls++;
    return super.listPullRequests(repo);
  }
}

d('lookup routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repoId: string;
  let prId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repoId));
    prId = pr!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  describe('GET /repos/lookup', () => {
    it('resolves the seeded repo by full_name', async () => {
      const app = await buildApp({ config: config(), db: pg.handle.db });
      const res = await app.inject({
        method: 'GET',
        url: '/repos/lookup?full_name=acme%2Fpayments-api',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ id: repoId, full_name: 'acme/payments-api', name: 'payments-api' });
    });

    it('422s when full_name is missing', async () => {
      const app = await buildApp({ config: config(), db: pg.handle.db });
      const res = await app.inject({ method: 'GET', url: '/repos/lookup' });
      expect(res.statusCode).toBe(422);
    });

    it('404s via NotFoundError when no repo matches', async () => {
      const app = await buildApp({ config: config(), db: pg.handle.db });
      const res = await app.inject({
        method: 'GET',
        url: '/repos/lookup?full_name=acme%2Fdoes-not-exist',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    });
  });

  describe('GET /repos/:id/pulls/lookup', () => {
    it('resolves the seeded PR #482 by number', async () => {
      const app = await buildApp({ config: config(), db: pg.handle.db });
      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/pulls/lookup?number=482`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        id: prId,
        repo_id: repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
      });
    });

    it('never triggers the GitHub sync that GET /repos/:id/pulls does', async () => {
      const gh = new CountingGitHubClient();
      const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: gh } });
      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/pulls/lookup?number=482`,
      });
      expect(res.statusCode).toBe(200);
      expect(gh.listPullRequestsCalls).toBe(0);
    });

    it('422s when number is missing', async () => {
      const app = await buildApp({ config: config(), db: pg.handle.db });
      const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls/lookup` });
      expect(res.statusCode).toBe(422);
    });

    it('422s when number is not a positive int', async () => {
      const app = await buildApp({ config: config(), db: pg.handle.db });
      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/pulls/lookup?number=-1`,
      });
      expect(res.statusCode).toBe(422);
    });

    it('404s when the repo is not found', async () => {
      const app = await buildApp({ config: config(), db: pg.handle.db });
      const res = await app.inject({
        method: 'GET',
        // A well-formed but non-existent uuid.
        url: '/repos/00000000-0000-0000-0000-000000000000/pulls/lookup?number=482',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    });

    it('404s when no PR with that number exists on the repo', async () => {
      const app = await buildApp({ config: config(), db: pg.handle.db });
      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/pulls/lookup?number=999999`,
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    });
  });
});
