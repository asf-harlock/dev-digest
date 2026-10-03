/**
 * SPEC-07 PR Context against a real Postgres: the new columns
 * (`pull_requests.context_paths`, `pr_intent.context_fingerprint`,
 * `pr_files.status`) and the workspace-scoped GET/PUT /pulls/:id/context.
 * Gated on Docker like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const HEAD = 'a'.repeat(40);

let seq = 0;
async function makePr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `ctx-${seq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 7,
      title: 'Implements SPEC-07',
      author: 'a',
      branch: 'feat/x',
      base: 'main',
      headSha: HEAD,
      additions: 1,
      deletions: 0,
      filesCount: 2,
      status: 'open',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

d('PR context (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const app = () =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), llm: { openai: new MockLLMProvider('openai') } },
    });

  it('AC-5: a new pull request defaults to an empty ordered list; pr_files.status defaults to modified', async () => {
    const { pr } = await makePr(pg.handle.db, workspaceId);
    expect(pr.contextPaths).toEqual([]);
    const [f] = await pg.handle.db
      .insert(t.prFiles)
      .values({ prId: pr.id, path: 'specs/x.md', additions: 1, deletions: 0 })
      .returning();
    expect(f!.status).toBe('modified');
  });

  it('AC-4 / AC-5 / AC-6: PUT stores the ordered path list, GET returns it in saved order', async () => {
    const a = await app();
    const { pr } = await makePr(pg.handle.db, workspaceId);
    const put = await a.inject({
      method: 'PUT',
      url: `/pulls/${pr.id}/context`,
      payload: { paths: ['specs/b.md', 'docs/a.md'] },
    });
    expect(put.statusCode).toBe(200);
    const [row] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr.id));
    expect(row!.contextPaths).toEqual(['specs/b.md', 'docs/a.md']);
    const got = (await a.inject({ method: 'GET', url: `/pulls/${pr.id}/context` })).json();
    expect(got.entries.map((e: { path: string }) => e.path)).toEqual(['specs/b.md', 'docs/a.md']);
    expect(got.fingerprint).toEqual(expect.any(String));
    await a.close();
  });

  it('AC-41 / NFR-1: saving writes only context_paths — no brief, intent or agent run, other columns untouched', async () => {
    const a = await app();
    const { pr } = await makePr(pg.handle.db, workspaceId);
    await a.inject({ method: 'PUT', url: `/pulls/${pr.id}/context`, payload: { paths: ['docs/a.md'] } });
    const [row] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr.id));
    expect({ ...row!, contextPaths: [] }).toEqual({ ...pr, contextPaths: [] });
    expect(await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id))).toHaveLength(0);
    expect(await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id))).toHaveLength(0);
    expect(await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id))).toHaveLength(0);
    await a.close();
  });

  it('EC-16: the last completed save wins', async () => {
    const a = await app();
    const { pr } = await makePr(pg.handle.db, workspaceId);
    await a.inject({ method: 'PUT', url: `/pulls/${pr.id}/context`, payload: { paths: ['docs/a.md'] } });
    await a.inject({ method: 'PUT', url: `/pulls/${pr.id}/context`, payload: { paths: ['docs/b.md'] } });
    const got = (await a.inject({ method: 'GET', url: `/pulls/${pr.id}/context` })).json();
    expect(got.entries.map((e: { path: string }) => e.path)).toEqual(['docs/b.md']);
    await a.close();
  });

  it('EC-22 / NFR-4: a PR of another workspace is 404 on GET, PUT and preview, and is not modified', async () => {
    const a = await app();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
    const { pr } = await makePr(pg.handle.db, other!.id);
    expect((await a.inject({ method: 'GET', url: `/pulls/${pr.id}/context` })).statusCode).toBe(404);
    expect(
      (await a.inject({ method: 'PUT', url: `/pulls/${pr.id}/context`, payload: { paths: ['docs/a.md'] } })).statusCode,
    ).toBe(404);
    expect(
      (await a.inject({ method: 'GET', url: `/pulls/${pr.id}/context/preview?path=docs/a.md` })).statusCode,
    ).toBe(404);
    const [row] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr.id));
    expect(row!.contextPaths).toEqual([]);
    await a.close();
  });

  it('EC-23 / NFR-5: 422 validation_error for 21 paths and for a traversal path, nothing stored', async () => {
    const a = await app();
    const { pr } = await makePr(pg.handle.db, workspaceId);
    const many = await a.inject({
      method: 'PUT',
      url: `/pulls/${pr.id}/context`,
      payload: { paths: Array.from({ length: 21 }, (_, i) => `docs/${i}.md`) },
    });
    expect(many.statusCode).toBe(422);
    expect(many.json().error.code).toBe('validation_error');
    const bad = await a.inject({ method: 'PUT', url: `/pulls/${pr.id}/context`, payload: { paths: ['../x.md'] } });
    expect(bad.statusCode).toBe(422);
    const [row] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr.id));
    expect(row!.contextPaths).toEqual([]);
    await a.close();
  });

  it('AC-2 / AC-3 / EC-1: origin badges and the attachable list come from pr_files.status; an uncloned repo answers cloned:false', async () => {
    const a = await app();
    const { pr } = await makePr(pg.handle.db, workspaceId);
    await pg.handle.db.insert(t.prFiles).values([
      { prId: pr.id, path: 'specs/07-new.md', status: 'added', additions: 3, deletions: 0 },
      { prId: pr.id, path: 'docs/guide.md', status: 'modified', additions: 1, deletions: 1 },
      { prId: pr.id, path: 'docs/old.md', status: 'removed', additions: 0, deletions: 5 },
      { prId: pr.id, path: 'src/a.ts', status: 'modified', additions: 1, deletions: 0 },
    ]);
    await a.inject({ method: 'PUT', url: `/pulls/${pr.id}/context`, payload: { paths: ['specs/07-new.md', 'docs/guide.md'] } });
    const got = (await a.inject({ method: 'GET', url: `/pulls/${pr.id}/context` })).json();
    expect(got.cloned).toBe(false);
    expect(got.entries.map((e: { path: string; origin: string; status: string }) => [e.path, e.origin, e.status])).toEqual([
      ['specs/07-new.md', 'added', 'unreadable'],
      ['docs/guide.md', 'modified', 'unreadable'],
    ]);
    const paths = got.attachable.map((x: { path: string }) => x.path);
    expect(paths).toEqual(expect.arrayContaining(['specs/07-new.md', 'docs/guide.md']));
    expect(paths).not.toContain('src/a.ts');
    expect(paths).not.toContain('docs/old.md');
    await a.close();
  });

  it('AC-36 / EC-21: pr_intent stores and returns the context fingerprint; absent reads as null', async () => {
    const { pr } = await makePr(pg.handle.db, workspaceId);
    const repo = new ReviewRepository(pg.handle.db);
    const intent = { intent: 'i', in_scope: [], out_of_scope: [], confidence: 'high' as const, sources: [] };
    await repo.upsertIntent(pr.id, intent);
    expect((await repo.getIntent(pr.id))!.contextFingerprint).toBeNull();
    await repo.upsertIntent(pr.id, intent, { contextFingerprint: 'fp-1' });
    expect((await repo.getIntent(pr.id))!.contextFingerprint).toBe('fp-1');
    await repo.upsertIntent(pr.id, intent, { contextFingerprint: null });
    expect((await repo.getIntent(pr.id))!.contextFingerprint).toBeNull();
  });
  it('AC-28 / AC-40 / EC-21: the run summary carries the trace fingerprint; a trace without one (or no trace) reads as null', async () => {
    const { pr } = await makePr(pg.handle.db, workspaceId);
    const repo = new ReviewRepository(pg.handle.db);
    const mk = () =>
      repo.createAgentRun({ workspaceId, agentId: null, prId: pr.id, provider: 'openai', model: 'gpt-4.1' });
    const [withFp, legacy, noTrace] = [await mk(), await mk(), await mk()];
    const base = {
      config: { agent: 'a', version: '1', provider: 'openai', model: 'm', pr: 7, source: 'local' as const },
      stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: 0, findings: 0, grounding: '0/0 passed' },
      prompt_assembly: [],
      tool_calls: [],
      raw_output: {},
      memory_pulled: [],
      specs_read: [],
      log: [],
    };
    await repo.saveRunTrace(withFp, { ...base, context_fingerprint: 'fp-run' } as never);
    await repo.saveRunTrace(legacy, base as never);
    const byId = new Map((await repo.listRunsForPull(workspaceId, pr.id)).map((r) => [r.run_id, r.context_fingerprint]));
    expect(byId.get(withFp)).toBe('fp-run');
    expect(byId.get(legacy)).toBeNull();
    expect(byId.get(noTrace)).toBeNull();
    expect((await repo.getRunSummary(workspaceId, withFp))!.context_fingerprint).toBe('fp-run');
  });
});
