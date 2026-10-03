import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { BriefRepository } from '../src/modules/brief/repository.js';
import { resetBriefLocks } from '../src/modules/brief/service.js';
import * as t from '../src/db/schema.js';
import type { BriefModelOutput } from '@devdigest/shared';

/**
 * PR Brief (specs/06-pr-brief.md) DB-backed coverage: the atomic jsonb merge
 * + upsert, last-good-brief survival, error-only / invalid envelopes, and
 * workspace tenancy (pr_brief has no workspace_id of its own).
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const OUTPUT: BriefModelOutput = {
  summary: 'Adds rate limiting.',
  risks: [{ kind: 'logic', title: 'Edge', explanation: 'e', severity: 'high', file_refs: ['src/config.ts:11'] }],
  review_focus: [{ file: 'src/config.ts', line: 11, reason: 'New key' }],
};

d('PR brief (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let repo: BriefRepository;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    otherWorkspaceId = other!.id;
    repo = new BriefRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makePr(wsId: string, headSha = 'sha-head') {
    const name = `brief-${seq++}`;
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: wsId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: wsId,
        repoId: r!.id,
        number: 1,
        title: 'Add rate limiting',
        author: 'a',
        branch: 'f',
        base: 'main',
        headSha,
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Adds rate limiting.',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "x",\n   redisUrl: x,',
    });
    return pr!;
  }

  const rowOf = async (prId: string) =>
    (await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId)))[0];

  function appWith(llm: MockLLMProvider) {
    resetBriefLocks();
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), llm: { openai: llm } },
    });
  }

  async function waitIdle(app: Awaited<ReturnType<typeof appWith>>, prId: string) {
    const start = Date.now();
    for (;;) {
      const body = (await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` })).json();
      if (!body.generating) return body;
      if (Date.now() - start > 10_000) throw new Error('generation did not finish');
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  it('F8: mergeEnvelope upserts the row when absent and merges into it when present', async () => {
    const pr = await makePr(workspaceId);
    expect(await rowOf(pr.id)).toBeUndefined();

    expect(await repo.mergeEnvelope(workspaceId, pr.id, { generated_for_sha: 'a', brief: OUTPUT })).toBe(true);
    expect((await rowOf(pr.id))!.json).toMatchObject({ generated_for_sha: 'a', brief: OUTPUT });

    expect(await repo.mergeEnvelope(workspaceId, pr.id, { last_error: 'x', last_error_at: 'now' })).toBe(true);
    expect((await rowOf(pr.id))!.json).toMatchObject({
      generated_for_sha: 'a',
      brief: OUTPUT,
      last_error: 'x',
      last_error_at: 'now',
    });
    expect(await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id))).toHaveLength(1);
  });

  it('F8: a failure write racing a success write loses nothing (atomic merge)', async () => {
    for (let i = 0; i < 10; i++) {
      const pr = await makePr(workspaceId);
      await Promise.all([
        repo.mergeEnvelope(workspaceId, pr.id, { brief: OUTPUT, generated_for_sha: 's', last_error: null, last_error_at: null }),
        repo.mergeEnvelope(workspaceId, pr.id, { last_error: 'boom', last_error_at: 'then' }),
      ]);
      const json = (await rowOf(pr.id))!.json as Record<string, unknown>;
      expect(json.brief).toEqual(OUTPUT);
      expect(json.generated_for_sha).toBe('s');
      expect(Object.keys(json)).toEqual(expect.arrayContaining(['last_error', 'last_error_at']));
    }
  });

  it('EC-4: a failed regeneration keeps the last good brief and the GET serves both', async () => {
    const pr = await makePr(workspaceId);
    const llm = new MockLLMProvider('openai', { structured: OUTPUT });
    const app = await appWith(llm);

    expect((await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).statusCode).toBe(202);
    const first = await waitIdle(app, pr.id);
    expect(first.brief.summary).toBe('Adds rate limiting.');
    expect(first.meta.last_error).toBeNull();
    expect(first.meta.generated_for_sha).toBe('sha-head');

    // Now make the provider return an invalid payload -> MockLLM throws.
    const bad = new MockLLMProvider('openai', { structured: { nope: true } });
    const app2 = await appWith(bad);
    expect((await app2.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` })).statusCode).toBe(202);
    const second = await waitIdle(app2, pr.id);
    expect(second.brief.summary).toBe('Adds rate limiting.');
    expect(second.meta.last_error).toBe('Model call failed or returned invalid output');
    expect(second.meta.last_error_at).toBeTruthy();
    await app.close();
    await app2.close();
  });

  it('EC-5: an error-only envelope validates and is served with brief null', async () => {
    const pr = await makePr(workspaceId);
    await repo.mergeEnvelope(workspaceId, pr.id, { last_error: 'Model call timed out', last_error_at: '2026-01-01T00:00:00.000Z' });
    const app = await appWith(new MockLLMProvider('openai', { structured: OUTPUT }));
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ brief: null, stale: false, meta: { last_error: 'Model call timed out' } });
    await app.close();
  });

  it('EC-21: an invalid stored envelope is treated as no brief', async () => {
    const pr = await makePr(workspaceId);
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: { brief: { summary: 42 }, generated_at: 7 } });
    const app = await appWith(new MockLLMProvider('openai', { structured: OUTPUT }));
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ brief: null, meta: null, stale: false, missing_inputs: [] });
    await app.close();
  });

  it('AC-24 / Q-G: stale follows the stored SHA against the PR head; a null SHA is not stale', async () => {
    const pr = await makePr(workspaceId, 'sha-new');
    await repo.mergeEnvelope(workspaceId, pr.id, { brief: OUTPUT, generated_for_sha: 'sha-old' });
    const app = await appWith(new MockLLMProvider('openai', { structured: OUTPUT }));
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json().stale).toBe(true);
    await repo.mergeEnvelope(workspaceId, pr.id, { generated_for_sha: null });
    expect((await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` })).json().stale).toBe(false);
    await app.close();
  });

  it('AC-30: the workspace override stored in settings selects provider and model', async () => {
    const pr = await makePr(workspaceId);
    await pg.handle.db.insert(t.settings).values({
      workspaceId,
      key: 'feature_models',
      value: { risk_brief: { provider: 'openai', model: 'gpt-override-test' } },
    });
    const llm = new MockLLMProvider('openai', { structured: OUTPUT });
    const app = await appWith(llm);
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    await waitIdle(app, pr.id);
    expect((llm.calls[0]!.req as { model: string }).model).toBe('gpt-override-test');
    await app.close();
    await pg.handle.db.delete(t.settings).where(eq(t.settings.key, 'feature_models'));
  });

  it('NFR-4 / EC-23: another workspace cannot read or write a PR brief', async () => {
    const foreign = await makePr(otherWorkspaceId);
    await pg.handle.db.insert(t.prBrief).values({ prId: foreign.id, json: { brief: OUTPUT, generated_for_sha: 'sha-head' } });

    // Repository level: reads are scoped, writes insert/update nothing.
    expect(await repo.getPull(workspaceId, foreign.id)).toBeUndefined();
    expect(await repo.getStored(workspaceId, foreign.id)).toBeUndefined();
    expect(await repo.getFiles(workspaceId, foreign.id)).toEqual([]);
    expect(await repo.mergeEnvelope(workspaceId, foreign.id, { last_error: 'hijack', last_error_at: 'x' })).toBe(false);
    expect((await rowOf(foreign.id))!.json).not.toHaveProperty('last_error');

    // A foreign PR without a row: the write must not create one.
    const foreignBare = await makePr(otherWorkspaceId);
    expect(await repo.mergeEnvelope(workspaceId, foreignBare.id, { brief: OUTPUT })).toBe(false);
    expect(await rowOf(foreignBare.id)).toBeUndefined();

    // Route level (the default workspace is the caller).
    const llm = new MockLLMProvider('openai', { structured: OUTPUT });
    const app = await appWith(llm);
    expect((await app.inject({ method: 'GET', url: `/pulls/${foreign.id}/brief` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/pulls/${foreign.id}/brief` })).statusCode).toBe(404);
    expect(llm.calls).toHaveLength(0);
    await app.close();
  });
});
