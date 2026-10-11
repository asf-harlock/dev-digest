import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { EvalRepository } from '../src/modules/eval/repository.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * SPEC-09 review B3: a replacing PATCH of an eval case is delete-old + insert-new in one
 * transaction, and the delete must find its row. Two racing replaces leave one case (the
 * loser gets 404, not a duplicate), and a DELETE that lands first is never undone.
 * Self-skips without Docker. The LLM mock must never be called (NFR-1).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[eval-cases-race] Docker not available — skipping integration tests.');

const CONFIG_PATCH = [
  '@@ -10,3 +10,4 @@',
  '   port: 3000,',
  '+  stripeKey: "sk_live_xxx",',
  '   redisUrl: x,',
].join('\n');

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('SPEC-09 eval case replace races (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const llm = new MockLLMProvider('openai', { structured: {} });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const db = () => pg.handle.db;
  const makeApp = () =>
    buildApp({
      config: config(),
      db: db(),
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), llm: { openai: llm } },
    });
  type App = Awaited<ReturnType<typeof makeApp>>;

  const caseRows = (ownerId: string) =>
    db().select().from(t.evalCases).where(eq(t.evalCases.ownerId, ownerId));

  async function makeCase(app: App) {
    const sk = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: `race-skill-${randomUUID().slice(0, 8)}`,
        description: 'A test skill',
        type: 'convention',
        body: 'Always check for null.',
      },
    });
    expect(sk.statusCode).toBe(201);
    const owner = sk.json() as { id: string };
    const res = await app.inject({
      method: 'POST',
      url: `/skills/${owner.id}/eval-cases`,
      payload: {
        name: 'racy',
        notes: null,
        input_diff: CONFIG_PATCH,
        input_meta: { title: 'Add the key', body: null },
        expectation: {
          type: 'must_find',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          severity: 'CRITICAL',
          category: 'security',
        },
      },
    });
    expect(res.statusCode).toBe(201);
    return { ownerId: owner.id, caseId: (res.json() as { id: string }).id };
  }

  /** A body that changes the expectation's lines: always a replace (AC-15). */
  const replaceBody = (endLine: number) => ({
    expectation: { type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: endLine, severity: 'CRITICAL', category: 'security' },
  });

  it('B3: two concurrent replacing PATCHes on one case leave exactly one case; the loser gets 404', async () => {
    const app = await makeApp();
    const { ownerId, caseId } = await makeCase(app);

    const [a, b] = await Promise.all([
      app.inject({ method: 'PATCH', url: `/eval-cases/${caseId}`, payload: replaceBody(12) }),
      app.inject({ method: 'PATCH', url: `/eval-cases/${caseId}`, payload: replaceBody(13) }),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 404]);
    const winner = [a, b].find((r) => r.statusCode === 200)!.json() as { id: string; replaced_from_id: string };
    expect(winner.replaced_from_id).toBe(caseId);
    const rows = await caseRows(ownerId);
    expect(rows.map((r) => r.id)).toEqual([winner.id]);
    await app.close();
  });

  it('B3: a DELETE that lands between the PATCH reading the case and replacing it is not resurrected', async () => {
    const app = await makeApp();
    const { ownerId, caseId } = await makeCase(app);
    const repo = new EvalRepository(db());
    const [old] = await caseRows(ownerId);

    // The state updateCase saw before the DELETE: it holds the old row and now replaces it.
    expect(await repo.deleteCase(workspaceId, caseId)).toBe(true);
    await expect(
      repo.replaceCase(workspaceId, caseId, {
        workspaceId,
        owner: { kind: 'skill', id: ownerId },
        name: old!.name,
        inputDiff: old!.inputDiff,
        inputFiles: old!.inputFiles,
        inputMeta: old!.inputMeta,
        expectation: old!.expectedOutput,
        sourceFindingId: null,
        notes: null,
        createdAt: old!.createdAt,
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'not_found' });

    expect(await caseRows(ownerId)).toEqual([]);
    await app.close();
  });

  it('B3: a PATCH and a DELETE racing on one case never end with both succeeding', async () => {
    const app = await makeApp();
    const { ownerId, caseId } = await makeCase(app);

    const [patch, del] = await Promise.all([
      app.inject({ method: 'PATCH', url: `/eval-cases/${caseId}`, payload: replaceBody(12) }),
      app.inject({ method: 'DELETE', url: `/eval-cases/${caseId}` }),
    ]);

    const rows = await caseRows(ownerId);
    if (del.statusCode === 204) {
      // the DELETE won: the replacement must not exist
      expect(patch.statusCode).toBe(404);
      expect(rows).toEqual([]);
    } else {
      // the replace won first: the DELETE targeted an id that is gone
      expect(del.statusCode).toBe(404);
      expect(patch.statusCode).toBe(200);
      expect(rows).toHaveLength(1);
    }
    await app.close();
  });
});
