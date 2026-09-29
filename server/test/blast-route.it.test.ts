import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { BlastRadius } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import type { BlastFacadeResult } from '../src/modules/blast/helpers.js';
import { BlastRepository } from '../src/modules/blast/repository.js';

/**
 * Route-level coverage for `GET /pulls/:id/blast` (specs/lessons/L04). The
 * pure mapping is unit-tested in `blast-helpers.test.ts` and orchestration in
 * `blast-service.test.ts` (fake Container) — this covers the one thing those
 * can't: the actual HTTP wiring (404/422/200) against the seeded PR, plus
 * that the route hands `repoIntel.getBlastRadius` the PR's real changed
 * files, via a typed `RepoIntel` stub (pattern: `test/conventions.it.test.ts`).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[blast] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A degraded-but-typed RepoIntel stub — the blast route only reads `getBlastRadius`. */
function stubRepoIntel(result: BlastFacadeResult, calls: { repoId: string; files: string[] }[]): RepoIntel {
  const notImplemented = () => {
    throw new Error('not implemented in this stub');
  };
  return {
    indexRepo: notImplemented,
    refreshIndex: notImplemented,
    getIndexState: notImplemented,
    getBlastRadius: async (repoId: string, changedFiles: string[]) => {
      calls.push({ repoId, files: changedFiles });
      return result;
    },
    getRepoMap: notImplemented,
    getFileRank: async () => [],
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async () => [],
    getTopFilesByRank: async () => [],
    getCriticalPaths: async () => [],
  } as unknown as RepoIntel;
}

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(result: BlastFacadeResult, calls: { repoId: string; files: string[] }[]) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { repoIntel: stubRepoIntel(result, calls) },
    });
  }

  it('404s for an unknown PR id', async () => {
    const calls: { repoId: string; files: string[] }[] = [];
    const app = await appWith({ changedSymbols: [], callers: [], impactedEndpoints: [] }, calls);
    const res = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/blast` });
    expect(res.statusCode).toBe(404);
    expect(calls).toHaveLength(0);
    await app.close();
  });

  it('422s with a structured validation_error for a non-uuid id', async () => {
    const calls: { repoId: string; files: string[] }[] = [];
    const app = await appWith({ changedSymbols: [], callers: [], impactedEndpoints: [] }, calls);
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/blast' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('200s for the seeded PR: BlastRadius.parse succeeds, and repoIntel is called with the PR\'s changed file paths', async () => {
    const [repo] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.fullName, 'acme/payments-api'));
    expect(repo).toBeDefined();
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo!.id), eq(t.pullRequests.number, 482)));
    expect(pr).toBeDefined();

    const seededFiles = await pg.handle.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, pr!.id));
    expect(seededFiles.length).toBeGreaterThan(0);

    const calls: { repoId: string; files: string[] }[] = [];
    const fixture: BlastFacadeResult = {
      changedSymbols: [{ file: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function' }],
      callers: [{ file: 'src/api/public/webhooks.ts', symbol: 'handleWebhook', viaSymbol: 'rateLimit', line: 5, rank: 1 }],
      impactedEndpoints: ['POST /webhooks'],
      factsByFile: { 'src/api/public/webhooks.ts': { endpoints: ['POST /webhooks'], crons: [] } },
    };
    const app = await appWith(fixture, calls);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(BlastRadius.parse(body)).toBeTruthy();
    expect(body.summary).toContain('1 changed symbol');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.repoId).toBe(repo!.id);
    expect(new Set(calls[0]?.files)).toEqual(new Set(seededFiles.map((f) => f.path)));

    await app.close();
  });

  it("404s for a PR that exists but belongs to another workspace, and never calls repoIntel", async () => {
    const [seeded] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    expect(seeded).toBeDefined();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-tenant' }).returning();
    const { id: _id, ...rest } = seeded!;
    const [foreign] = await pg.handle.db
      .insert(t.pullRequests)
      .values({ ...rest, workspaceId: other!.id, number: 90482 })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({ prId: foreign!.id, path: 'secret/other-tenant.ts', additions: 1, deletions: 0 });

    const calls: { repoId: string; files: string[] }[] = [];
    const app = await appWith({ changedSymbols: [], callers: [], impactedEndpoints: [] }, calls);
    const res = await app.inject({ method: 'GET', url: `/pulls/${foreign!.id}/blast` });
    expect(res.statusCode).toBe(404);
    expect(calls).toHaveLength(0);
    await app.close();

    // The repository scopes pr_files itself, not only via getPull's call order.
    const blastRepo = new BlastRepository(pg.handle.db);
    expect(await blastRepo.getChangedFiles(seeded!.workspaceId, foreign!.id)).toEqual([]);
    expect(await blastRepo.getChangedFiles(other!.id, foreign!.id)).toEqual(['secret/other-tenant.ts']);
  });
});
