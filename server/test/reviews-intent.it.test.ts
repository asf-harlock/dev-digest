import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

/**
 * Intent Layer (specs/03-intent-layer.md) integration coverage:
 *   - POST /pulls/:id/intent classifies + persists an Intent (confidence +
 *     sources computed deterministically, never trusted from the model).
 *   - GET /pulls/:id folds the persisted Intent into PrDetail.
 *   - run-executor.ts's deterministic scope filter: a grounded finding that
 *     matches `out_of_scope` is dropped below the agent's `ciFailOn` gate and
 *     kept (tagged `scope: 'out_of_scope'`) at/above it.
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

/** Two GROUNDED findings on src/config.ts (lines 10 and 11 are both real diff
 *  lines) — one below, one at, the default 'critical' ciFailOn gate. */
const SCOPED_REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'One real issue, one style nit in an out-of-scope file.',
  score: 55,
  findings: [
    {
      id: 'f-crit',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-warn',
      severity: 'WARNING',
      category: 'style',
      title: 'Minor formatting nit',
      file: 'src/config.ts',
      start_line: 10,
      end_line: 10,
      rationale: 'Inconsistent spacing.',
      confidence: 0.6,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  body: string | null,
) {
  const name = `intent-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 471,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body,
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

/** Poll `pr_intent` until the classify call finishes (fire-and-forget route). */
async function waitForIntent(
  db: PgFixture['handle']['db'],
  prId: string,
  timeoutMs = 10_000,
): Promise<typeof t.prIntent.$inferSelect | undefined> {
  const start = Date.now();
  for (;;) {
    const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    if (row?.classifiedAt) return row;
    if (Date.now() - start > timeoutMs) return row;
    await new Promise((r) => setTimeout(r, 25));
  }
}

d('Intent Layer (Testcontainers pg)', () => {
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

  function appWith(opts: { intentFixture?: unknown; reviewFixture?: unknown }) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: {
          // review_intent has no workspace override in these tests, so the
          // classifier falls back to the registry default: openrouter (D2).
          openrouter: new MockLLMProvider('openai', { structured: opts.intentFixture }),
          openai: new MockLLMProvider('openai', { structured: opts.reviewFixture }),
        },
      },
    });
  }

  it('classifies a PR with a description + linked issue: high confidence, all sources used', async () => {
    const app = await appWith({
      intentFixture: {
        intent: 'Adds rate limiting to the public API.',
        in_scope: ['src/config.ts'],
        out_of_scope: [],
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'Add rate limiting. Closes #471.');

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'running' });

    const row = await waitForIntent(pg.handle.db, pr.id);
    expect(row).toBeDefined();
    expect(row!.intent).toBe('Adds rate limiting to the public API.');
    expect(row!.confidence).toBe('high');
    expect(row!.classifiedForSha).toBe('a1b2c3d4');
    const sources = row!.sources as { kind: string; status: string }[];
    expect(sources).toContainEqual({ kind: 'title', status: 'used' });
    expect(sources).toContainEqual({ kind: 'description', status: 'used' });
    expect(sources).toContainEqual({ kind: 'linked_issue', status: 'used' });
    expect(sources.find((s) => s.kind === 'hunk_headers')?.status).toBe('used');

    // Folded into GET /pulls/:id (PrDetail.intent) — no extra round trip.
    const detail = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}` })).json();
    expect(detail.intent.intent).toBe('Adds rate limiting to the public API.');
    expect(detail.intent.confidence).toBe('high');
    expect(detail.intent.pr_id).toBe(pr.id);

    await app.close();
  });

  it('classifies a PR with an empty description: low confidence, description marked missing, never fabricated', async () => {
    const app = await appWith({
      intentFixture: {
        intent: 'Cannot determine intent from title and diff shape alone.',
        in_scope: [],
        out_of_scope: [],
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, null);

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    const row = await waitForIntent(pg.handle.db, pr.id);
    expect(row).toBeDefined();
    expect(row!.confidence).toBe('low');
    const sources = row!.sources as { kind: string; status: string; note?: string }[];
    expect(sources).toContainEqual({
      kind: 'description',
      status: 'missing',
      note: 'PR description is empty',
    });
    // No #N reference in the (empty) body → 'missing', never fabricated content.
    expect(sources.find((s) => s.kind === 'linked_issue')?.status).toBe('missing');

    await app.close();
  });

  it('scope filter: drops a below-gate out-of-scope finding, keeps + tags an above-gate one', async () => {
    const app = await appWith({ reviewFixture: SCOPED_REVIEW_FIXTURE });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'Add rate limiting.');

    // Persist an intent directly (bypassing the classifier call) whose
    // out_of_scope names the file both findings land on.
    await app.container.reviewRepo.upsertIntent(pr.id, {
      intent: 'Adds rate limiting.',
      in_scope: ['server/src/middleware/'],
      out_of_scope: ['unrelated changes in src/config.ts'],
      confidence: 'high',
      sources: [],
    });

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ScopeAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // ciFailOn defaults to 'critical' — the WARNING finding is below the gate.
    expect(agent.ci_fail_on).toBe('critical');

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    expect(reviews).toHaveLength(1);
    // f-warn (WARNING, below gate) was dropped entirely — never persisted.
    // Persisted findings get a fresh DB row id, so assert on the fixture's
    // other fields rather than `id` (the model's own 'f-crit'/'f-warn').
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].findings[0].title).toBe('Hardcoded Stripe secret key');
    expect(reviews[0].findings[0].severity).toBe('CRITICAL');
    // f-crit matched out_of_scope AND met the gate — kept, tagged.
    expect(reviews[0].findings[0].scope).toBe('out_of_scope');

    await app.close();
  });

  it('a PR with no classified intent produces an unfiltered findings set (no behavior change)', async () => {
    const app = await appWith({ reviewFixture: SCOPED_REVIEW_FIXTURE });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, 'Add rate limiting.');

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'NoIntentAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const reviews = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })).json();
    // Both grounded findings survive — no intent means the scope filter is a no-op.
    expect(reviews[0].findings).toHaveLength(2);
    expect(reviews[0].findings.every((f: { scope: string | null }) => f.scope == null)).toBe(true);

    await app.close();
  });
});
