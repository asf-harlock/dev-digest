import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * Route-level coverage for `GET /pulls/:id/smart-diff` (specs/lessons/L03 ·
 * plan `objective-files-federated-gosling.md`). The pure classify/build
 * pieces are unit-tested in `reviews-smart-diff.test.ts`; this covers the
 * one thing those can't — the tenancy guard (404 via `getPull`) and the
 * actual HTTP response shape against the seeded PR.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        llm: { openai: new MockLLMProvider('openai', { structured: {} }) },
      },
    });
  }

  it('404s for an unknown PR id', async () => {
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/smart-diff` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('200s for the seeded PR with the SmartDiff shape: 5 groups, seeded finding line in the wiring group', async () => {
    const app = await appWith();

    const [repo] = await pg.handle.db.select().from(t.repos).where(eq(t.repos.fullName, 'acme/payments-api'));
    expect(repo).toBeDefined();
    const [pr] = await pg.handle.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repo!.id), eq(t.pullRequests.number, 482)));
    expect(pr).toBeDefined();

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Seed data (server/src/db/seed.ts) covers all five roles: core, tests,
    // wiring, docs, boilerplate — one file per role, in SMART_DIFF_ROLE_ORDER.
    expect(body.groups.map((g: { role: string }) => g.role)).toEqual([
      'core',
      'tests',
      'wiring',
      'docs',
      'boilerplate',
    ]);

    const wiring = body.groups.find((g: { role: string }) => g.role === 'wiring');
    const configFile = wiring.files.find((f: { path: string }) => f.path === 'src/config.ts');
    // The seeded review's CRITICAL finding lands on src/config.ts:12 (helpers
    // above), so the wiring group's src/config.ts entry must carry it.
    expect(configFile.finding_lines).toContain(12);

    expect(body.split_suggestion).toEqual(
      expect.objectContaining({ too_big: false, proposed_splits: [] }),
    );
    expect(typeof body.split_suggestion.total_lines).toBe('number');

    await app.close();
  });
});
