import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import {
  CI_SHA,
  CiMockGitHub,
  defaultWorkspaceId,
  insertAgent,
  insertRepo,
  makeRunnerDist,
  resultZip,
  workflowRun,
} from './helpers/ci.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, type MockGitHubOptions } from '../src/adapters/mocks.js';
import { CiRepository } from '../src/modules/ci/repository.js';
import { WORKFLOW_VERSION } from '../src/modules/ci/constants.js';

/**
 * SPEC-11 AC-65 / NFR-16 — a CI run is not a pull-request run. The three readers a
 * PR user looks at (the PR list rows, the PR timeline, the PR cost) are snapshotted
 * through the HTTP routes, CI data is written — both directly through the
 * repository and by a real refresh — and the snapshots must be byte-identical.
 * The CI rows deliberately reuse the PR's number, repository and agent, and an
 * `agent_runs(source='ci', pr_id NULL)` row carries a large cost, so a reader that
 * filtered on number/agent/cost instead of `pr_id` would visibly change.
 * Self-skips without Docker.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[ci-pr-isolation] Docker not available — skipping integration tests.');

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('AC-65 / NFR-16: CI runs never reach the PR readers (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const dist = makeRunnerDist();
  const opts: MockGitHubOptions = { pulls: [], workflowRuns: [], artifacts: {}, artifactBytes: {} };
  let app: Awaited<ReturnType<typeof buildApp>>;

  let repo: Awaited<ReturnType<typeof insertRepo>>;
  let agent: Awaited<ReturnType<typeof insertAgent>>;
  const prIds: string[] = [];
  let installationId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = await defaultWorkspaceId(pg.handle.db);
    app = await buildApp({
      config: { ...config(), agentRunnerDist: dist.dir },
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new CiMockGitHub(opts),
        secrets: { get: async (k) => (k === 'GITHUB_TOKEN' ? 'ghp_integration_test_token_value_000000' : undefined) },
      },
    });

    const db = pg.handle.db;
    repo = await insertRepo(db, workspaceId);
    agent = await insertAgent(db, workspaceId, { name: 'Local And CI Agent' });

    // Two PRs; #7 is the number the CI runs will also carry.
    for (const number of [7, 8]) {
      const [pr] = await db
        .insert(t.pullRequests)
        .values({
          workspaceId, repoId: repo.id, number, title: `PR ${number}`, author: 'tester', branch: `feat-${number}`,
          base: 'main', headSha: CI_SHA, status: 'open', additions: 5, deletions: 1, filesCount: 2,
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        })
        .returning();
      prIds.push(pr!.id);
    }
    // Local history on PR #7: two done runs (cost), one failed, plus a review with a finding.
    const [run1] = await db.insert(t.agentRuns).values({ workspaceId, agentId: agent.id, prId: prIds[0]!, status: 'done', costUsd: 0.5, durationMs: 1000, source: 'local', findingsCount: 1 }).returning();
    await db.insert(t.agentRuns).values([
      { workspaceId, agentId: agent.id, prId: prIds[0]!, status: 'done', costUsd: 0.25, durationMs: 900, source: 'local' },
      { workspaceId, agentId: agent.id, prId: prIds[0]!, status: 'failed', costUsd: null, source: 'local', error: 'boom' },
    ]);
    const [review] = await db.insert(t.reviews).values({ workspaceId, prId: prIds[0]!, agentId: agent.id, runId: run1!.id, kind: 'review', score: 80 }).returning();
    await db.insert(t.findings).values({
      reviewId: review!.id, file: 'a.ts', startLine: 1, endLine: 2, severity: 'warning', category: 'style', title: 'F', rationale: 'r', confidence: 0.9,
    });

    // The installation the CI rows belong to.
    const [inst] = await db
      .insert(t.ciInstallations)
      .values({
        workspaceId, agentId: agent.id, repo: repo.fullName, targetType: 'gha', status: 'active', workflowVersion: WORKFLOW_VERSION,
        agentVersion: 1, postAs: 'none', triggers: ['opened'], ciFailOn: 'critical', manifestSlug: 'a',
      })
      .returning();
    installationId = inst!.id;
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    dist.cleanup();
  });

  /** The three readers, through the routes a PR user hits. */
  async function snapshot() {
    const list = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(list.statusCode).toBe(200);
    const timelines: unknown[] = [];
    for (const id of prIds) {
      const res = await app.inject({ method: 'GET', url: `/pulls/${id}/runs` });
      expect(res.statusCode).toBe(200);
      timelines.push(res.json());
    }
    const reviews = await Promise.all(prIds.map(async (id) => (await app.inject({ method: 'GET', url: `/pulls/${id}/reviews` })).json()));
    const rows = list.json() as { number: number; cost_usd: number | null }[];
    return {
      list: rows,
      cost: Object.fromEntries(rows.map((r) => [r.number, r.cost_usd])),
      timelines,
      reviews,
    };
  }

  it('AC-65: the baseline is meaningful — PR #7 shows its local cost and runs', async () => {
    const snap = await snapshot();

    expect(snap.cost[7]).toBeCloseTo(0.75, 10); // the two done runs; the failed one adds nothing
    expect(snap.cost[8]).toBeNull();
    expect((snap.timelines[0] as unknown[]).length).toBe(3);
    expect((snap.timelines[1] as unknown[]).length).toBe(0);
  });

  it('NFR-16: PR list rows, timeline and cost are identical before and after CI rows are written', async () => {
    const before = await snapshot();

    const r = new CiRepository(pg.handle.db);
    const base = {
      workspaceId, ciInstallationId: installationId, repo: repo.fullName, agentName: agent.name, prNumber: 7, ranAt: new Date(),
      runAttempt: 1, headSha: CI_SHA, verdict: 'request_changes' as const, failureReason: null, findingsCount: 3, critical: 1, warning: 1,
      suggestion: 1, costUsd: 5, durationMs: 60_000, githubUrl: `https://github.com/${repo.fullName}/actions/runs/1`,
    };
    await r.saveCompletedRunWithAgentRun(
      { ...base, githubRunId: 770_001, status: 'succeeded' },
      { workspaceId, agentId: agent.id, status: 'done', ranAt: new Date(), costUsd: 5, durationMs: 60_000, findingsCount: 3, blockers: 1, error: null },
    );
    await r.saveCompletedRunWithAgentRun(
      { ...base, githubRunId: 770_002, status: 'failed', failureReason: 'no_artifact', verdict: null, findingsCount: null, critical: null, warning: null, suggestion: null, costUsd: null, durationMs: null },
      { workspaceId, agentId: agent.id, status: 'failed', ranAt: new Date(), costUsd: null, durationMs: null, findingsCount: null, blockers: null, error: 'no_artifact' },
    );
    await r.upsertRunning({ ...base, githubRunId: 770_003, status: 'running', verdict: null, findingsCount: null, critical: null, warning: null, suggestion: null, costUsd: null, durationMs: null });

    // the CI data really is there ...
    const ciAgentRuns = await pg.handle.db.select().from(t.agentRuns);
    const ours = ciAgentRuns.filter((x) => x.source === 'ci' && x.agentId === agent.id);
    expect(ours).toHaveLength(2);
    expect(ours.every((x) => x.prId === null)).toBe(true);
    expect((await pg.handle.db.select().from(t.ciRuns)).length).toBeGreaterThanOrEqual(3);

    // ... and the PR readers did not notice
    const after = await snapshot();
    expect(after.list).toEqual(before.list);
    expect(after.cost).toEqual(before.cost);
    expect(after.timelines).toEqual(before.timelines);
    expect(after.reviews).toEqual(before.reviews);
  });

  it('NFR-16: the same holds after a real refresh ingests runs of the PR\'s own number', async () => {
    const before = await snapshot();
    opts.workflowRuns!.length = 0;
    for (const [id, over] of [
      [880_001, {}],
      [880_002, { conclusion: 'failure' }],
      [880_003, { status: 'in_progress', conclusion: null }],
    ] as const) {
      opts.workflowRuns!.push(workflowRun(repo.fullName, id, { ...over, pull_requests: [7] }));
      opts.artifacts![id] = [{ id: id + 1000, name: 'devdigest-result', size_in_bytes: 10, expired: false }];
      opts.artifactBytes![id + 1000] = resultZip(repo.fullName, { result: { cost_usd: 9 } });
    }

    const res = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { installation_id: installationId, force: true } });

    expect(res.statusCode).toBe(200);
    expect((res.json() as { added: number }[])[0]!.added).toBe(3);
    const after = await snapshot();
    expect(after.list).toEqual(before.list);
    expect(after.cost).toEqual(before.cost);
    expect(after.timelines).toEqual(before.timelines);
    expect(after.reviews).toEqual(before.reviews);
  });
});
