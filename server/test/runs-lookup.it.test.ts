import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

/**
 * Route-level coverage for `GET /runs/:id` and `GET /runs/:id/findings`
 * (specs/lessons/L04 — added so the local MCP server's `run_agent_on_pr` /
 * `get_findings` tools have something to poll). Both routes are workspace-
 * scoped via `getContext()`; `findings` has no `workspace_id` of its own
 * (server/INSIGHTS.md), so that route is scoped through `reviews` instead.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('GET /runs/:id and GET /runs/:id/findings (Testcontainers pg)', () => {
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

  function appWith() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  async function runOnce(app: Awaited<ReturnType<typeof appWith>>) {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const started = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = started.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    return { pr, runId };
  }

  it('GET /runs/:id returns the RunSummary for a completed run', async () => {
    const app = await appWith();
    const { runId } = await runOnce(app);

    const res = await app.inject({ method: 'GET', url: `/runs/${runId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.run_id).toBe(runId);
    expect(body.status).toBe('done');
    expect(body.agent_name).toBe('Sec');
    expect(body.findings_count).toBe(1);
    expect(body.score).toBe(65); // 100 - 35 for one CRITICAL, same grounding math as reviews.it.test.ts

    await app.close();
  });

  it('GET /runs/:id 404s for an unknown run id', async () => {
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: `/runs/${randomUUID()}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('GET /runs/:id/findings returns the ReviewDto for the run', async () => {
    const app = await appWith();
    const { runId } = await runOnce(app);

    const res = await app.inject({ method: 'GET', url: `/runs/${runId}/findings` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.run_id).toBe(runId);
    expect(body.verdict).toBe('request_changes');
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0].file).toBe('src/config.ts');
    expect(body.findings[0].start_line).toBe(11);

    await app.close();
  });

  it('GET /runs/:id/findings 404s when the run has no review yet (still running)', async () => {
    const app = await appWith();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId, prId: pr.id, agentId: null, provider: null, model: null, status: 'running' })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/runs/${run!.id}/findings` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('GET /runs/:id/findings 404s for an unknown run id', async () => {
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: `/runs/${randomUUID()}/findings` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('both routes are workspace-scoped: a run in another tenant is invisible to the default workspace', async () => {
    const app = await appWith();
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-runs-lookup' }).returning();
    const { pr } = await setupRepoAndPr(pg.handle.db, otherWs!.id);
    const [run] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId: otherWs!.id,
        prId: pr.id,
        agentId: null,
        provider: null,
        model: null,
        status: 'done',
      })
      .returning();
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId: otherWs!.id,
        prId: pr.id,
        agentId: null,
        runId: run!.id,
        kind: 'review',
        verdict: 'approve',
        summary: 'foreign tenant review',
        score: 100,
        model: 'seed',
      })
      .returning();
    expect(review).toBeDefined();

    const runRes = await app.inject({ method: 'GET', url: `/runs/${run!.id}` });
    expect(runRes.statusCode).toBe(404);
    const findingsRes = await app.inject({ method: 'GET', url: `/runs/${run!.id}/findings` });
    expect(findingsRes.statusCode).toBe(404);

    await app.close();
  });
});
