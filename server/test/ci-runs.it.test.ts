import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { ListWorkflowRunsOptions, RepoRef, WorkflowRun } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import {
  CiMockGitHub,
  CI_SHA,
  defaultWorkspaceId,
  insertAgent,
  insertRepo,
  insertWorkspace,
  makeRunnerDist,
  resultZip,
  suffix,
  workflowRun,
} from './helpers/ci.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, type MockGitHubOptions } from '../src/adapters/mocks.js';
import { CiRepository, type InsertAgentRunInput, type UpsertRunInput } from '../src/modules/ci/repository.js';
import { WORKFLOW_VERSION } from '../src/modules/ci/constants.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';

/**
 * SPEC-11 CI runs against a real Postgres: the atomic "completed run + its
 * `agent_runs` row" write (AC-60), idempotent re-ingest (AC-61) and its unique key,
 * `agent_runs(source='ci')` staying out of Skill Stats (AC-64), the 24 h stale rule
 * (EC-28), the run listing, and a refresh driven through the HTTP routes with a
 * `MockGitHubClient`. Self-skips without Docker.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[ci-runs.it] Docker not available — skipping integration tests.');

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A GitHub mock that counts what a refresh asks for. */
class CountingGitHub extends CiMockGitHub {
  lists: ListWorkflowRunsOptions[] = [];
  artifactListings = 0;
  downloads = 0;
  constructor(private o: MockGitHubOptions) {
    super(o);
  }
  override async listWorkflowRuns(repo: RepoRef, opts: ListWorkflowRunsOptions): Promise<WorkflowRun[]> {
    this.lists.push(opts);
    return super.listWorkflowRuns(repo, opts);
  }
  override async listRunArtifacts(repo: RepoRef, runId: number) {
    this.artifactListings += 1;
    return super.listRunArtifacts(repo, runId);
  }
  override async downloadArtifact(repo: RepoRef, id: number) {
    this.downloads += 1;
    return super.downloadArtifact(repo, id);
  }
  get state(): MockGitHubOptions {
    return this.o;
  }
}

d('SPEC-11 CI runs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let otherWorkspaceId: string;
  const dist = makeRunnerDist();

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = await defaultWorkspaceId(pg.handle.db);
    otherWorkspaceId = await insertWorkspace(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
    dist.cleanup();
  });

  const db = () => pg.handle.db;
  const repoLayer = () => new CiRepository(db());

  let runSeq = 9_000_000;
  const nextRunId = () => (runSeq += 1);

  async function setup(ws = workspaceId) {
    const agent = await insertAgent(db(), ws);
    const repoName = `acme/runs-${suffix()}`;
    const [inst] = await db()
      .insert(t.ciInstallations)
      .values({
        workspaceId: ws, agentId: agent.id, repo: repoName, targetType: 'gha', status: 'pending_pr',
        workflowVersion: WORKFLOW_VERSION, agentVersion: 1, postAs: 'none', triggers: ['opened'],
        ciFailOn: 'critical', manifestSlug: 'a',
      })
      .returning();
    return { agent, repo: repoName, installation: inst! };
  }

  const runInput = (
    s: { agent: { id: string; name: string }; repo: string; installation: { id: string } },
    over: Partial<UpsertRunInput> = {},
  ): UpsertRunInput => ({
    workspaceId,
    ciInstallationId: s.installation.id,
    repo: s.repo,
    agentName: s.agent.name,
    prNumber: 7,
    ranAt: new Date(),
    githubRunId: nextRunId(),
    runAttempt: 1,
    headSha: CI_SHA,
    status: 'succeeded',
    verdict: 'comment',
    failureReason: null,
    findingsCount: 3,
    critical: 1,
    warning: 1,
    suggestion: 1,
    costUsd: 0.02,
    durationMs: 1234,
    githubUrl: `https://github.com/${s.repo}/actions/runs/1`,
    ...over,
  });

  const agentRunInput = (agentId: string, over: Partial<Omit<InsertAgentRunInput, 'ciRunId'>> = {}): Omit<InsertAgentRunInput, 'ciRunId'> => ({
    workspaceId, agentId, status: 'done', ranAt: new Date(), costUsd: 0.02, durationMs: 1234, findingsCount: 3, blockers: 1, error: null, ...over,
  });

  const ciRunsOf = (githubRunId: number) =>
    db().select().from(t.ciRuns).where(eq(t.ciRuns.githubRunId, githubRunId));
  const ciAgentRuns = (agentId: string) =>
    db().select().from(t.agentRuns).where(and(eq(t.agentRuns.agentId, agentId), eq(t.agentRuns.source, 'ci')));

  // ============================================================ AC-60 / AC-61

  describe('saveCompletedRunWithAgentRun (AC-60, AC-61)', () => {
    it('AC-60: writes one ci_runs row and one agent_runs row (source ci, pr_id NULL, the run\'s numbers) linked from the CI run', async () => {
      const s = await setup();
      const run = runInput(s);

      const saved = await repoLayer().saveCompletedRunWithAgentRun(run, agentRunInput(s.agent.id));

      expect(saved).toBeDefined();
      const [ci] = await ciRunsOf(run.githubRunId);
      const agentRuns = await ciAgentRuns(s.agent.id);
      expect(agentRuns).toHaveLength(1);
      expect(agentRuns[0]).toMatchObject({
        workspaceId, agentId: s.agent.id, prId: null, source: 'ci', status: 'done',
        costUsd: 0.02, durationMs: 1234, findingsCount: 3, blockers: 1, error: null,
      });
      expect(ci).toMatchObject({ status: 'succeeded', workspaceId, runAttempt: 1, agentRunId: agentRuns[0]!.id, source: 'github_actions' });
    });

    it('AC-60: a run that failed verification writes a FAILED agent run carrying the reason', async () => {
      const s = await setup();
      const run = runInput(s, { status: 'failed', failureReason: 'no_artifact', verdict: null, findingsCount: null, critical: null, warning: null, suggestion: null, costUsd: null, durationMs: null });

      await repoLayer().saveCompletedRunWithAgentRun(run, agentRunInput(s.agent.id, { status: 'failed', error: 'no_artifact', costUsd: null, durationMs: null, findingsCount: null, blockers: null }));

      const [agentRun] = await ciAgentRuns(s.agent.id);
      expect(agentRun).toMatchObject({ status: 'failed', error: 'no_artifact', costUsd: null, prId: null });
    });

    it('AC-61: saving the same (workspace, run id, attempt) twice yields one ci_runs row and one agent_runs row', async () => {
      const s = await setup();
      const run = runInput(s);
      const r = repoLayer();

      const first = await r.saveCompletedRunWithAgentRun(run, agentRunInput(s.agent.id));
      const second = await r.saveCompletedRunWithAgentRun({ ...run, status: 'failed' }, agentRunInput(s.agent.id));

      expect(first).toBeDefined();
      expect(second).toBeUndefined();
      const rows = await ciRunsOf(run.githubRunId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe('succeeded'); // the stored completed row was not overwritten
      expect(await ciAgentRuns(s.agent.id)).toHaveLength(1);
    });

    it('AC-61: two concurrent saves of one key leave exactly one agent_runs row', async () => {
      const s = await setup();
      const run = runInput(s);
      const r = repoLayer();

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => r.saveCompletedRunWithAgentRun(run, agentRunInput(s.agent.id))),
      );

      expect(results.every((x) => x.status === 'fulfilled')).toBe(true);
      expect(await ciRunsOf(run.githubRunId)).toHaveLength(1);
      expect(await ciAgentRuns(s.agent.id)).toHaveLength(1);
    });

    it('AC-56 / AC-60: a running row is replaced in place by the completed run, with exactly one agent run', async () => {
      const s = await setup();
      const r = repoLayer();
      const id = nextRunId();
      const running = await r.upsertRunning(runInput(s, { githubRunId: id, status: 'running', verdict: null, findingsCount: null, critical: null, warning: null, suggestion: null, costUsd: null, durationMs: null }));
      expect(await ciAgentRuns(s.agent.id)).toEqual([]); // no agent run while running

      const done = await r.saveCompletedRunWithAgentRun(runInput(s, { githubRunId: id }), agentRunInput(s.agent.id));

      expect(done!.id).toBe(running!.id); // same row, replaced
      const rows = await ciRunsOf(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'succeeded', findingsCount: 3 });
      const agentRuns = await ciAgentRuns(s.agent.id);
      expect(agentRuns).toHaveLength(1);
      expect(rows[0]!.agentRunId).toBe(agentRuns[0]!.id);
    });

    it('AC-56: a running row that is seen running again is refreshed; a completed one is untouched', async () => {
      const s = await setup();
      const r = repoLayer();
      const id = nextRunId();
      await r.upsertRunning(runInput(s, { githubRunId: id, status: 'running', prNumber: null }));
      await r.upsertRunning(runInput(s, { githubRunId: id, status: 'running', prNumber: 8 }));
      expect((await ciRunsOf(id))[0]!.prNumber).toBe(8);

      await r.saveCompletedRunWithAgentRun(runInput(s, { githubRunId: id }), agentRunInput(s.agent.id));
      const again = await r.upsertRunning(runInput(s, { githubRunId: id, status: 'running' }));

      expect(again).toBeUndefined();
      expect((await ciRunsOf(id))[0]!.status).toBe('succeeded');
    });

    it('AC-57: the unique key is (workspace, run id, attempt) — a rerun and another workspace each get their own row', async () => {
      const s = await setup();
      const other = await setup(otherWorkspaceId);
      const r = repoLayer();
      const id = nextRunId();

      await r.saveCompletedRunWithAgentRun(runInput(s, { githubRunId: id, runAttempt: 1 }), agentRunInput(s.agent.id));
      const attempt2 = await r.saveCompletedRunWithAgentRun(runInput(s, { githubRunId: id, runAttempt: 2 }), agentRunInput(s.agent.id));
      const otherWs = await r.saveCompletedRunWithAgentRun(
        runInput(other, { workspaceId: otherWorkspaceId, githubRunId: id }),
        agentRunInput(other.agent.id, { workspaceId: otherWorkspaceId }),
      );

      expect(attempt2).toBeDefined();
      expect(otherWs).toBeDefined();
      expect(await ciRunsOf(id)).toHaveLength(3);
      // and the raw index itself refuses a duplicate key
      await expect(
        db().insert(t.ciRuns).values({ workspaceId, repo: s.repo, agentName: 'x', githubRunId: id, runAttempt: 1, status: 'failed' }),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('AC-60: atomic — a failing agent_runs insert rolls the ci_runs write back (new row)', async () => {
      const s = await setup();
      const run = runInput(s);

      await expect(
        repoLayer().saveCompletedRunWithAgentRun(run, agentRunInput(randomUUID())), // agent_id FK violation
      ).rejects.toThrow();

      expect(await ciRunsOf(run.githubRunId)).toEqual([]);
      expect(await ciAgentRuns(s.agent.id)).toEqual([]);
    });

    it('AC-60: atomic — a failing agent_runs insert leaves a running row running, unlinked', async () => {
      const s = await setup();
      const r = repoLayer();
      const id = nextRunId();
      await r.upsertRunning(runInput(s, { githubRunId: id, status: 'running', findingsCount: null }));

      await expect(
        r.saveCompletedRunWithAgentRun(runInput(s, { githubRunId: id }), agentRunInput(randomUUID())),
      ).rejects.toThrow();

      const [row] = await ciRunsOf(id);
      expect(row).toMatchObject({ status: 'running', findingsCount: null, agentRunId: null });
      // and a retry with a valid agent completes it
      await r.saveCompletedRunWithAgentRun(runInput(s, { githubRunId: id }), agentRunInput(s.agent.id));
      expect((await ciRunsOf(id))[0]!.status).toBe('succeeded');
    });

    it('AC-60: deleting the agent run leaves the CI run (agent_run_id set null)', async () => {
      const s = await setup();
      const run = runInput(s);
      await repoLayer().saveCompletedRunWithAgentRun(run, agentRunInput(s.agent.id));
      const [agentRun] = await ciAgentRuns(s.agent.id);

      await db().delete(t.agentRuns).where(eq(t.agentRuns.id, agentRun!.id));

      expect((await ciRunsOf(run.githubRunId))[0]!.agentRunId).toBeNull();
    });
  });

  // ============================================================ AC-64

  describe('Skill Stats denominator (AC-64)', () => {
    it('AC-64: countRunsByAgents counts local runs only — agent_runs with source ci are excluded', async () => {
      const agent = await insertAgent(db(), workspaceId);
      const since = new Date(Date.now() - 3_600_000);
      const [repo, pr] = await (async () => {
        const rp = await insertRepo(db(), workspaceId);
        const [p] = await db().insert(t.pullRequests).values({ workspaceId, repoId: rp.id, number: 1, title: 't', author: 'a', branch: 'b', base: 'main', headSha: 'x' }).returning();
        return [rp, p!] as const;
      })();
      void repo;
      await db().insert(t.agentRuns).values([
        { workspaceId, agentId: agent.id, prId: pr.id, status: 'done', source: 'local' },
        { workspaceId, agentId: agent.id, prId: pr.id, status: 'done', source: 'local' },
        { workspaceId, agentId: agent.id, prId: null, status: 'done', source: 'ci' },
        { workspaceId, agentId: agent.id, prId: null, status: 'done', source: 'ci' },
        { workspaceId, agentId: agent.id, prId: null, status: 'failed', source: 'ci' },
      ]);

      const count = await new SkillsRepository(db()).countRunsByAgents(workspaceId, [agent.id], since);

      expect(count).toBe(2);
    });

    it('AC-64: an agent that only ever ran in CI has a denominator of 0', async () => {
      const agent = await insertAgent(db(), workspaceId);
      await db().insert(t.agentRuns).values({ workspaceId, agentId: agent.id, prId: null, status: 'done', source: 'ci' });

      expect(await new SkillsRepository(db()).countRunsByAgents(workspaceId, [agent.id], new Date(Date.now() - 3_600_000))).toBe(0);
    });
  });

  // ============================================================ EC-28 / listing

  describe('stale runs and listing', () => {
    it('EC-28: running rows older than 24 h become failed / stale; fresh rows and other workspaces are untouched', async () => {
      const s = await setup();
      const other = await setup(otherWorkspaceId);
      const r = repoLayer();
      const old = nextRunId();
      const fresh = nextRunId();
      const otherOld = nextRunId();
      const hours = (h: number) => new Date(Date.now() - h * 3_600_000);
      const running = { status: 'running' as const, verdict: null, findingsCount: null, critical: null, warning: null, suggestion: null, costUsd: null, durationMs: null };
      await r.upsertRunning(runInput(s, { githubRunId: old, ranAt: hours(25), ...running }));
      await r.upsertRunning(runInput(s, { githubRunId: fresh, ranAt: hours(1), ...running }));
      await r.upsertRunning(runInput(other, { workspaceId: otherWorkspaceId, githubRunId: otherOld, ranAt: hours(30), ...running }));

      const changed = await r.failStaleRunning(workspaceId, hours(24));

      expect(changed).toBeGreaterThanOrEqual(1);
      expect((await ciRunsOf(old))[0]).toMatchObject({ status: 'failed', failureReason: 'stale' });
      expect((await ciRunsOf(fresh))[0]!.status).toBe('running');
      expect((await ciRunsOf(otherOld))[0]!.status).toBe('running'); // NFR-1
    });

    it('EC-28: a running row without a start time is judged by when it was ingested', async () => {
      const s = await setup();
      const r = repoLayer();
      const id = nextRunId();
      await r.upsertRunning(runInput(s, { githubRunId: id, ranAt: null, status: 'running', verdict: null, findingsCount: null, critical: null, warning: null, suggestion: null, costUsd: null, durationMs: null }));
      await db().update(t.ciRuns).set({ ingestedAt: new Date(Date.now() - 48 * 3_600_000) }).where(eq(t.ciRuns.githubRunId, id));

      await r.failStaleRunning(workspaceId, new Date(Date.now() - 24 * 3_600_000));

      expect((await ciRunsOf(id))[0]).toMatchObject({ status: 'failed', failureReason: 'stale' });
    });

    it('AC-46 / AC-50: listRuns is newest first, filters by repo (any case), agent, status and installation, and clamps the limit to 200', async () => {
      const a = await setup();
      const b = await setup();
      const r = repoLayer();
      const t0 = Date.now();
      const ids = [nextRunId(), nextRunId(), nextRunId()];
      await r.saveCompletedRunWithAgentRun(runInput(a, { githubRunId: ids[0]!, ranAt: new Date(t0 - 3000) }), agentRunInput(a.agent.id));
      await r.saveCompletedRunWithAgentRun(runInput(a, { githubRunId: ids[1]!, ranAt: new Date(t0 - 1000), status: 'failed', failureReason: 'no_artifact' }), agentRunInput(a.agent.id, { status: 'failed' }));
      await r.upsertRunning(runInput(b, { githubRunId: ids[2]!, ranAt: null, status: 'running' }));

      const forA = await r.listRuns(workspaceId, { repo: a.repo.toUpperCase() });
      expect(forA.map((x) => x.githubRunId)).toEqual([ids[1], ids[0]]); // newest first
      expect((await r.listRuns(workspaceId, { agentId: a.agent.id })).map((x) => x.githubRunId)).toEqual([ids[1], ids[0]]);
      expect((await r.listRuns(workspaceId, { installationId: b.installation.id, status: 'running' })).map((x) => x.githubRunId)).toEqual([ids[2]]);
      expect(await r.listRuns(workspaceId, { agentId: a.agent.id, status: 'running' })).toEqual([]);
      expect(await r.listRuns(workspaceId, { agentId: a.agent.id, limit: 1 })).toHaveLength(1);
      expect((await r.listRuns(workspaceId, { limit: 10_000 })).length).toBeLessThanOrEqual(200);
    });

    it('AC-39: lastRunPerInstallation reports the newest run of each installation and omits those without runs', async () => {
      const a = await setup();
      const empty = await setup();
      const r = repoLayer();
      await r.saveCompletedRunWithAgentRun(runInput(a, { ranAt: new Date(Date.now() - 5000), status: 'failed' }), agentRunInput(a.agent.id));
      await r.saveCompletedRunWithAgentRun(runInput(a, { ranAt: new Date(), status: 'succeeded' }), agentRunInput(a.agent.id));

      const last = await r.lastRunPerInstallation(workspaceId, [a.installation.id, empty.installation.id]);

      expect(last).toHaveLength(1);
      expect(last[0]).toMatchObject({ installationId: a.installation.id, status: 'succeeded' });
    });
  });

  // ============================================================ refresh through the routes

  describe('refresh through the HTTP routes (AC-54..AC-63)', () => {
    const opts: MockGitHubOptions = { workflowRuns: [], artifacts: {}, artifactBytes: {} };
    const gh = new CountingGitHub(opts);
    let app: Awaited<ReturnType<typeof buildApp>>;

    beforeAll(async () => {
      app = await buildApp({
        config: { ...config(), agentRunnerDist: dist.dir },
        db: db(),
        overrides: { git: new MockGitClient(), github: gh, secrets: { get: async (k) => (k === 'GITHUB_TOKEN' ? 'ghp_integration_test_token_value_000000' : undefined) } },
      });
    });
    afterAll(async () => {
      await app?.close();
    });

    const addRun = (repo: string, id: number, over: Partial<WorkflowRun> = {}, zip: Uint8Array | null = resultZip(repo)) => {
      opts.workflowRuns!.push(workflowRun(repo, id, over));
      opts.artifacts![id] = [{ id: id + 1000, name: 'devdigest-result', size_in_bytes: 100, expired: false }];
      if (zip) opts.artifactBytes![id + 1000] = zip;
    };

    it('AC-55..AC-62 / AC-63: one refresh ingests the runs, a second adds nothing, and GET /ci/runs never calls GitHub', async () => {
      const s = await setup();
      opts.workflowRuns!.length = 0;
      const [running, ok, cancelled, noArtifact, rejected] = [nextRunId(), nextRunId(), nextRunId(), nextRunId(), nextRunId()];
      addRun(s.repo, running, { status: 'in_progress', conclusion: null });
      addRun(s.repo, ok);
      addRun(s.repo, cancelled, { conclusion: 'cancelled' });
      addRun(s.repo, noArtifact, {}, null);
      opts.artifacts![noArtifact] = []; // nothing attached to this run
      addRun(s.repo, rejected, {}, resultZip(s.repo, { meta: { commit_sha: 'd'.repeat(40) } }));
      addRun(s.repo, nextRunId(), { conclusion: 'skipped' });
      addRun(s.repo, nextRunId(), { head_repository_full_name: 'fork/elsewhere' });

      const first = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { installation_id: s.installation.id, force: true } });

      expect(first.statusCode).toBe(200);
      const [result] = first.json() as { installation_id: string; status: string; added: number; updated: number; skipped: number; failure: unknown }[];
      expect(result).toMatchObject({ installation_id: s.installation.id, status: 'refreshed', added: 5, updated: 0, failure: null });
      expect(result!.skipped).toBe(2);
      expect(gh.lists.at(-1)).toEqual({ workflowPath: '.github/workflows/devdigest-review.yml', event: 'pull_request', perPage: 30 });

      const runs = await db().select().from(t.ciRuns).where(eq(t.ciRuns.ciInstallationId, s.installation.id));
      const by = Object.fromEntries(runs.map((x) => [x.githubRunId, x]));
      expect(Object.keys(by)).toHaveLength(5);
      expect(by[running]).toMatchObject({ status: 'running', agentRunId: null });
      expect(by[ok]).toMatchObject({ status: 'succeeded', verdict: 'request_changes', findingsCount: 3, critical: 1, costUsd: 0.02, durationMs: 1234, agentName: s.agent.name });
      expect(by[cancelled]).toMatchObject({ status: 'failed', failureReason: 'cancelled' });
      expect(by[noArtifact]).toMatchObject({ status: 'failed', failureReason: 'no_artifact', findingsCount: null, costUsd: null });
      expect(by[rejected]).toMatchObject({ status: 'failed', failureReason: 'artifact_rejected' });

      // AC-60: one agent run per COMPLETED run (4), none for the running one; source ci, no PR
      const agentRuns = await ciAgentRuns(s.agent.id);
      expect(agentRuns).toHaveLength(4);
      expect(agentRuns.every((x) => x.prId === null && x.source === 'ci')).toBe(true);
      expect(agentRuns.map((x) => x.status).sort()).toEqual(['done', 'failed', 'failed', 'failed']);
      expect(by[running]!.agentRunId).toBeNull();

      // the installation went live on its first completed run
      const [inst] = await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.id, s.installation.id));
      expect(inst).toMatchObject({ status: 'active' });
      expect(inst!.lastRefreshedAt).toBeInstanceOf(Date);

      // AC-61: refreshing again re-stores nothing and creates no second agent run
      const downloadsBefore = gh.downloads;
      const second = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { installation_id: s.installation.id, force: true } });
      const [again] = second.json() as { added: number; updated: number; skipped: number }[];
      expect(again!.added).toBe(0);
      expect(again!.updated).toBe(1); // only the still-running one is re-read
      expect(await ciAgentRuns(s.agent.id)).toHaveLength(4);
      expect((await db().select().from(t.ciRuns).where(eq(t.ciRuns.ciInstallationId, s.installation.id)))).toHaveLength(5);
      expect(gh.downloads).toBe(downloadsBefore);

      // AC-63: the list answers from the database alone
      const callsBefore = gh.lists.length + gh.artifactListings + gh.downloads;
      const listed = await app.inject({ method: 'GET', url: `/ci/runs?installation_id=${s.installation.id}&limit=50` });
      expect(listed.statusCode).toBe(200);
      expect((listed.json() as unknown[]).length).toBe(5);
      expect(gh.lists.length + gh.artifactListings + gh.downloads).toBe(callsBefore);
    });

    it('AC-54: a non-forced refresh right after a refresh is skipped without calling GitHub', async () => {
      const s = await setup();
      opts.workflowRuns!.length = 0;
      await app.inject({ method: 'POST', url: '/ci/refresh', payload: { installation_id: s.installation.id, force: true } });
      const listsBefore = gh.lists.length;

      const res = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { installation_id: s.installation.id } });

      expect((res.json() as { status: string }[])[0]!.status).toBe('skipped');
      expect(gh.lists.length).toBe(listsBefore);
    });

    it('NFR-1: a refresh for an installation id that does not exist in the workspace is a 404', async () => {
      const other = await setup(otherWorkspaceId);

      const res = await app.inject({ method: 'POST', url: '/ci/refresh', payload: { installation_id: other.installation.id, force: true } });

      expect(res.statusCode).toBe(404);
    });

    it('EC-33: a never-run installation reports last_run null, and its status after a run is active', async () => {
      const s = await setup();
      opts.workflowRuns!.length = 0;
      const before = await app.inject({ method: 'GET', url: `/agents/${s.agent.id}/ci/installations` });
      expect((before.json() as { status: string; last_run: unknown }[])[0]).toMatchObject({ status: 'pending_pr', last_run: null });

      addRun(s.repo, nextRunId());
      await app.inject({ method: 'POST', url: '/ci/refresh', payload: { installation_id: s.installation.id, force: true } });

      const after = await app.inject({ method: 'GET', url: `/agents/${s.agent.id}/ci/installations` });
      expect((after.json() as { status: string; last_run: { status: string } }[])[0]).toMatchObject({ status: 'active', last_run: { status: 'succeeded' } });
    });
  });
});
