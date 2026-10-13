import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { unzipSync } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import {
  CiMockGitHub,
  defaultWorkspaceId,
  insertAgent,
  insertRepo,
  insertWorkspace,
  makeRunnerDist,
  suffix,
} from './helpers/ci.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { runMigrations } from '../src/db/migrate.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import { CiRepository, type UpsertInstallationInput } from '../src/modules/ci/repository.js';
import { CI_BRANCH, WORKFLOW_PATH, WORKFLOW_VERSION } from '../src/modules/ci/constants.js';

/**
 * SPEC-11 Export to CI against a real Postgres: the migration on a database that
 * already holds rows (EC-34, NFR-3), the unique index and its races (NFR-2),
 * workspace scoping of every repository read/write (NFR-1), agent deletion (EC-18)
 * and the export routes end to end. Refresh and the `agent_runs` rows are in
 * `ci-runs.it.test.ts`. Self-skips without Docker.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[ci.it] Docker not available — skipping integration tests.');

const MIGRATIONS = fileURLToPath(new URL('../src/db/migrations', import.meta.url));
const MIGRATION_0026 = '0026_reflective_secret_warriors';
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('SPEC-11 export to CI (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const dist = makeRunnerDist();

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = await defaultWorkspaceId(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
    dist.cleanup();
  });

  const db = () => pg.handle.db;
  const repoLayer = () => new CiRepository(db());

  const installationInput = (over: Partial<UpsertInstallationInput> = {}): UpsertInstallationInput => ({
    workspaceId,
    agentId: 'set-me',
    repo: `acme/ci-${suffix()}`,
    targetType: 'gha',
    status: 'pending_pr',
    prUrl: null,
    workflowVersion: WORKFLOW_VERSION,
    agentVersion: 1,
    postAs: 'github_review',
    triggers: ['opened', 'synchronize'],
    ciFailOn: 'critical',
    manifestSlug: 'agent',
    ...over,
  });

  // ============================================================ migration (EC-34, NFR-3)

  describe('migration 0026 on a database with existing rows', () => {
    const base = `legacy_${suffix()}`;
    let admin: ReturnType<typeof postgres>;
    let preDir: string;

    const urlFor = (name: string) => {
      const u = new URL(pg.url);
      u.pathname = `/${name}`;
      return u.toString();
    };

    /** A copy of the migrations folder whose journal stops BEFORE 0026. */
    function migrationsBefore0026(): string {
      const dir = mkdtempSync(join(tmpdir(), 'ci-mig-'));
      cpSync(MIGRATIONS, dir, { recursive: true });
      const journalPath = join(dir, 'meta', '_journal.json');
      const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] };
      journal.entries = journal.entries.filter((e) => e.tag !== MIGRATION_0026);
      writeFileSync(journalPath, JSON.stringify(journal));
      return dir;
    }

    async function withClient<T>(url: string, fn: (sql: ReturnType<typeof postgres>) => Promise<T>): Promise<T> {
      const sql = postgres(url, { max: 1 });
      try {
        return await fn(sql);
      } finally {
        await sql.end({ timeout: 5 });
      }
    }

    beforeAll(async () => {
      admin = postgres(pg.url, { max: 1 });
      preDir = migrationsBefore0026();
      await admin.unsafe(`CREATE DATABASE ${base}`);
      await withClient(urlFor(base), async (sql) => {
        await sql`CREATE EXTENSION IF NOT EXISTS vector`;
        await migrate(drizzle(sql), { migrationsFolder: preDir });
      });
    });
    afterAll(async () => {
      await admin?.end({ timeout: 5 });
      rmSync(preDir, { recursive: true, force: true });
    });

    /** A fresh database cloned from the pre-0026 state. */
    async function legacyDb(): Promise<string> {
      const name = `legacy_${suffix()}`;
      await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE ${base}`);
      return name;
    }

    it('EC-34 / NFR-3: keeps pre-existing installations, backfilling workspace from the agent and status active', async () => {
      const name = await legacyDb();
      const url = urlFor(name);
      const ids = await withClient(url, async (sql) => {
        const [ws] = await sql`insert into workspaces (name) values ('legacy') returning id`;
        const [agent] = await sql`
          insert into agents (workspace_id, name, provider, model, system_prompt, version, ci_fail_on)
          values (${ws!.id}, 'Legacy  Reviewer!', 'openai', 'gpt-4o', 'p', 4, 'warning') returning id`;
        const [inst] = await sql`
          insert into ci_installations (agent_id, repo, target_type) values (${agent!.id}, 'acme/legacy', 'gha') returning id`;
        return { ws: ws!.id as string, agent: agent!.id as string, inst: inst!.id as string };
      });

      await runMigrations(url); // applies ONLY 0026

      await withClient(url, async (sql) => {
        const rows = await sql`select * from ci_installations`;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          id: ids.inst,
          agent_id: ids.agent,
          repo: 'acme/legacy',
          workspace_id: ids.ws,
          status: 'active',
          workflow_version: 0, // not produced by this generator -> "update available"
          agent_version: 4,
          ci_fail_on: 'warning',
          post_as: 'github_review',
          manifest_slug: 'legacy-reviewer',
          pr_url: null,
          last_refreshed_at: null,
        });
        expect(rows[0]!.triggers).toEqual(['opened', 'synchronize', 'reopened']);
      });
    });

    it('EC-34 / NFR-3: keeps legacy runs of an installation (workspace, repo, agent name, unique synthetic run id) and drops orphans', async () => {
      const name = await legacyDb();
      const url = urlFor(name);
      const ids = await withClient(url, async (sql) => {
        const [ws] = await sql`insert into workspaces (name) values ('legacy') returning id`;
        const [agent] = await sql`
          insert into agents (workspace_id, name, provider, model, system_prompt)
          values (${ws!.id}, 'Reviewer', 'openai', 'gpt-4o', 'p') returning id`;
        const [inst] = await sql`
          insert into ci_installations (agent_id, repo, target_type) values (${agent!.id}, 'acme/legacy', 'gha') returning id`;
        await sql`insert into ci_runs (ci_installation_id, pr_number, status, findings_count, cost_usd, source)
                  values (${inst!.id}, 1, 'success', 3, 0.5, 'ci'),
                         (${inst!.id}, 2, 'success', 0, 0.1, 'ci'),
                         (${inst!.id}, 3, 'failure', null, null, 'ci'),
                         (${inst!.id}, 4, 'running', null, null, 'ci'),
                         (null, 5, 'success', 1, 0.1, 'ci')`;
        return { ws: ws!.id as string };
      });

      await runMigrations(url);

      await withClient(url, async (sql) => {
        const runs = await sql`select * from ci_runs order by pr_number`;
        expect(runs.map((r) => r.pr_number)).toEqual([1, 2, 3, 4]); // the orphan (pr 5) is gone
        for (const r of runs) {
          expect(r).toMatchObject({ workspace_id: ids.ws, repo: 'acme/legacy', agent_name: 'Reviewer', run_attempt: 1 });
          expect(Number(r.github_run_id)).toBeLessThan(0); // a real GitHub run id is positive
        }
        expect(new Set(runs.map((r) => String(r.github_run_id))).size).toBe(4);
        // a legacy free-text status is normalised into the new enum
        expect(runs.map((r) => r.status)).toEqual(['succeeded', 'no_findings', 'failed', 'running']);
      });
    });

    it('NFR-3: duplicate repositories (case-insensitive) stop the migration with a message instead of deleting rows', async () => {
      const name = await legacyDb();
      const url = urlFor(name);
      await withClient(url, async (sql) => {
        const [ws] = await sql`insert into workspaces (name) values ('legacy') returning id`;
        const [a1] = await sql`insert into agents (workspace_id, name, provider, model, system_prompt)
                               values (${ws!.id}, 'A1', 'openai', 'm', 'p') returning id`;
        const [a2] = await sql`insert into agents (workspace_id, name, provider, model, system_prompt)
                               values (${ws!.id}, 'A2', 'openai', 'm', 'p') returning id`;
        await sql`insert into ci_installations (agent_id, repo, target_type)
                  values (${a1!.id}, 'Acme/Dup', 'gha'), (${a2!.id}, 'acme/dup', 'gha')`;
      });

      await expect(runMigrations(url)).rejects.toThrow(/duplicate repositories/i);

      // nothing was lost: the transaction rolled back and both rows are still there
      await withClient(url, async (sql) => {
        const rows = await sql`select repo from ci_installations order by repo`;
        expect(rows.map((r) => r.repo as string).sort()).toEqual(['Acme/Dup', 'acme/dup'].sort());
      });
    });
  });

  // ============================================================ schema invariants

  describe('schema after the migration', () => {
    it('NFR-2 / AC-61: the unique indexes and NOT NULL columns exist', async () => {
      const sql = postgres(pg.url, { max: 1 });
      try {
        const idx = await sql`select indexname, indexdef from pg_indexes where tablename in ('ci_installations','ci_runs')`;
        const defs = Object.fromEntries(idx.map((r) => [r.indexname as string, r.indexdef as string]));
        expect(defs['ci_installations_workspace_repo_uq']).toMatch(/UNIQUE.*\(workspace_id, lower\(repo\)\)/);
        expect(defs['ci_runs_workspace_run_attempt_uq']).toMatch(/UNIQUE.*\(workspace_id, github_run_id, run_attempt\)/);

        const cols = await sql`
          select table_name, column_name from information_schema.columns
          where table_name in ('ci_installations','ci_runs') and is_nullable = 'NO'`;
        const notNull = new Set(cols.map((c) => `${c.table_name}.${c.column_name}`));
        for (const c of [
          'ci_installations.workspace_id', 'ci_installations.status', 'ci_installations.manifest_slug',
          'ci_runs.workspace_id', 'ci_runs.github_run_id', 'ci_runs.run_attempt', 'ci_runs.status', 'ci_runs.repo', 'ci_runs.agent_name',
        ]) {
          expect(notNull.has(c), c).toBe(true);
        }
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  });

  // ============================================================ NFR-2 uniqueness and races

  describe('one agent per repository (NFR-2, AC-32, AC-34)', () => {
    it('NFR-2: the database refuses a second installation of the same repository, case-insensitively', async () => {
      const a1 = await insertAgent(db(), workspaceId);
      const a2 = await insertAgent(db(), workspaceId);
      const repo = `Acme/Case-${suffix()}`;
      const row = (agentId: string, name: string) => ({
        workspaceId, agentId, repo: name, targetType: 'gha' as const, status: 'manual' as const,
        workflowVersion: 1, agentVersion: 1, postAs: 'none' as const, triggers: ['opened'], ciFailOn: 'critical' as const, manifestSlug: 'a',
      });
      await db().insert(t.ciInstallations).values(row(a1.id, repo));

      await expect(db().insert(t.ciInstallations).values(row(a2.id, repo.toLowerCase()))).rejects.toMatchObject({
        code: '23505',
      });
    });

    it('NFR-2: the same repository name is free in another workspace', async () => {
      const other = await insertWorkspace(db());
      const a1 = await insertAgent(db(), workspaceId);
      const a2 = await insertAgent(db(), other);
      const repo = `acme/shared-${suffix()}`;
      const r = repoLayer();

      const first = await r.upsertInstallation(installationInput({ agentId: a1.id, repo }));
      const second = await r.upsertInstallation(installationInput({ workspaceId: other, agentId: a2.id, repo }));

      expect(first.kind).toBe('saved');
      expect(second.kind).toBe('saved');
    });

    it('AC-33 / NFR-2: of concurrent installs of one repository by different agents exactly one wins; the rest get repo_taken (23505 race)', async () => {
      const agents = await Promise.all(Array.from({ length: 6 }, () => insertAgent(db(), workspaceId)));
      const repo = `acme/race-${suffix()}`;
      const r = repoLayer();

      const results = await Promise.all(
        agents.map((a, i) => r.upsertInstallation(installationInput({ agentId: a.id, repo: i % 2 ? repo.toUpperCase() : repo }))),
      );

      const saved = results.filter((x) => x.kind === 'saved');
      const taken = results.filter((x) => x.kind === 'repo_taken');
      expect(saved).toHaveLength(1);
      expect(taken).toHaveLength(5);
      const rows = await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.workspaceId, workspaceId));
      const mine = rows.filter((x) => x.repo.toLowerCase() === repo.toLowerCase());
      expect(mine).toHaveLength(1);
      // every loser is told who owns it
      const winner = saved[0]!;
      for (const x of taken) {
        if (x.kind === 'repo_taken') expect(x.installation.id).toBe((winner as { installation: { id: string } }).installation.id);
      }
    });

    it('AC-34: concurrent re-exports by the SAME agent all succeed and leave one installation', async () => {
      const agent = await insertAgent(db(), workspaceId);
      const repo = `acme/same-${suffix()}`;
      const r = repoLayer();

      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) => r.upsertInstallation(installationInput({ agentId: agent.id, repo, triggers: i % 2 ? ['opened'] : ['reopened'] }))),
      );

      expect(results.every((x) => x.kind === 'saved')).toBe(true);
      const rows = await db().select().from(t.ciInstallations).where(and(eq(t.ciInstallations.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agent.id)));
      expect(rows).toHaveLength(1);
    });

    it('AC-34: an active installation is never demoted by an Update', async () => {
      const agent = await insertAgent(db(), workspaceId);
      const repo = `acme/active-${suffix()}`;
      const r = repoLayer();
      const first = await r.upsertInstallation(installationInput({ agentId: agent.id, repo, status: 'active' }));
      expect(first.kind).toBe('saved');

      const again = await r.upsertInstallation(installationInput({ agentId: agent.id, repo, status: 'pending_pr', prUrl: 'https://github.com/x/y/pull/1' }));

      expect(again.kind === 'saved' && again.installation.status).toBe('active');
      expect(again.kind === 'saved' && again.installation.prUrl).toBe('https://github.com/x/y/pull/1');
    });
  });

  // ============================================================ NFR-1 tenancy

  describe('workspace scoping (NFR-1)', () => {
    it('NFR-1: a second workspace cannot read or modify the first one\'s installations and runs', async () => {
      const other = await insertWorkspace(db());
      const agent = await insertAgent(db(), workspaceId);
      const repo = `acme/tenant-${suffix()}`;
      const r = repoLayer();
      const saved = await r.upsertInstallation(installationInput({ agentId: agent.id, repo }));
      if (saved.kind !== 'saved') throw new Error('setup');
      const inst = saved.installation;
      const stale = new Date(Date.now() - 48 * 3_600_000);
      await r.upsertRunning({
        workspaceId, ciInstallationId: inst.id, repo, agentName: agent.name, prNumber: 1, ranAt: stale,
        githubRunId: 424242, runAttempt: 1, headSha: null, status: 'running', verdict: null, failureReason: null,
        findingsCount: null, critical: null, warning: null, suggestion: null, costUsd: null, durationMs: null, githubUrl: null,
      });

      // reads
      expect(await r.listInstallations(other)).toEqual([]);
      expect(await r.getInstallation(other, inst.id)).toBeUndefined();
      expect(await r.findInstallationByRepo(other, repo)).toBeUndefined();
      expect(await r.listInstallationsByAgent(other, agent.id)).toEqual([]);
      expect(await r.getAgent(other, agent.id)).toBeUndefined();
      expect(await r.findRepoByFullName(other, repo)).toBeUndefined();
      expect(await r.listRuns(other)).toEqual([]);
      expect(await r.findRunByGithubId(other, 424242, 1)).toBeUndefined();
      expect(await r.lastRunPerInstallation(other, [inst.id])).toEqual([]);
      expect(await r.enabledSkillsInLinkOrder(other, agent.id)).toEqual([]);

      // writes
      await r.touchLastRefreshed(other, inst.id, new Date());
      await r.markActiveOnFirstRun(other, inst.id);
      const after = await r.getInstallation(workspaceId, inst.id);
      expect(after!.installation.status).toBe('pending_pr');
      expect(after!.installation.lastRefreshedAt).toBeNull();
      expect((await r.findRunByGithubId(workspaceId, 424242, 1))!.status).toBe('running');

      // the unique key includes the workspace: the same GitHub run id is a different run there
      const otherAgent = await insertAgent(db(), other);
      const otherInst = await r.upsertInstallation(installationInput({ workspaceId: other, agentId: otherAgent.id, repo }));
      expect(otherInst.kind).toBe('saved');
      const mirror = await r.upsertRunning({
        workspaceId: other, ciInstallationId: otherInst.kind === 'saved' ? otherInst.installation.id : null, repo,
        agentName: otherAgent.name, prNumber: 1, ranAt: stale, githubRunId: 424242, runAttempt: 1, headSha: null,
        status: 'running', verdict: null, failureReason: null, findingsCount: null, critical: null, warning: null,
        suggestion: null, costUsd: null, durationMs: null, githubUrl: null,
      });
      expect(mirror).toBeDefined();
    });
  });

  // ============================================================ EC-18

  describe('agent deletion (EC-18)', () => {
    it('EC-18: deleting an agent deletes its installations and keeps their CI runs with repo and agent name', async () => {
      const agent = await insertAgent(db(), workspaceId, { name: 'Doomed Reviewer' });
      const repo = `acme/doomed-${suffix()}`;
      const r = repoLayer();
      const saved = await r.upsertInstallation(installationInput({ agentId: agent.id, repo }));
      if (saved.kind !== 'saved') throw new Error('setup');
      await r.saveCompletedRunWithAgentRun(
        {
          workspaceId, ciInstallationId: saved.installation.id, repo, agentName: agent.name, prNumber: 3, ranAt: new Date(),
          githubRunId: 515151, runAttempt: 1, headSha: null, status: 'succeeded', verdict: 'comment', failureReason: null,
          findingsCount: 1, critical: 0, warning: 1, suggestion: 0, costUsd: 0.1, durationMs: 10, githubUrl: null,
        },
        { workspaceId, agentId: agent.id, status: 'done', ranAt: new Date(), costUsd: 0.1, durationMs: 10, findingsCount: 1, blockers: 0, error: null },
      );

      await db().delete(t.agents).where(eq(t.agents.id, agent.id));

      expect(await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.id, saved.installation.id))).toEqual([]);
      const [run] = await db().select().from(t.ciRuns).where(eq(t.ciRuns.githubRunId, 515151));
      expect(run).toMatchObject({ ciInstallationId: null, repo, agentName: 'Doomed Reviewer', status: 'succeeded' });
      const [agentRun] = await db().select().from(t.agentRuns).where(eq(t.agentRuns.id, run!.agentRunId!));
      expect(agentRun).toMatchObject({ agentId: null, source: 'ci', prId: null });
    });
  });

  // ============================================================ routes

  describe('export routes', () => {
    const secrets: Record<string, string | undefined> = { GITHUB_TOKEN: 'ghp_integration_test_token_value_000000', OPENROUTER_API_KEY: 'sk-or-v1-integrationtestkey00000' };
    const gh = new CiMockGitHub();

    const makeApp = () =>
      buildApp({
        config: { ...config(), agentRunnerDist: dist.dir },
        db: db(),
        overrides: { git: new MockGitClient(), github: gh, secrets: { get: async (k) => secrets[k] } },
      });
    type App = Awaited<ReturnType<typeof makeApp>>;
    let app: App;
    beforeAll(async () => {
      app = await makeApp();
    });
    afterAll(async () => {
      await app?.close();
    });

    const body = (repo: string, over: Record<string, unknown> = {}) => ({
      repo,
      target: 'gha',
      action: 'open_pr',
      post_as: 'github_review',
      triggers: ['opened', 'synchronize'],
      ...over,
    });

    it('AC-12 / AC-13 / AC-15 / AC-34: exports to devdigest/ci, opens the PR, stores pending_pr; a re-export is 200 and keeps one row', async () => {
      const agent = await insertAgent(db(), workspaceId, { name: 'Route Reviewer' });
      const repo = await insertRepo(db(), workspaceId);

      const first = await app.inject({ method: 'POST', url: `/agents/${agent.id}/export-ci`, payload: body(repo.fullName) });

      expect(first.statusCode).toBe(201);
      const created = first.json() as { installation: { id: string; status: string; repo: string; agent_name: string; pr_url: string }; pr_url: string; file_count: number };
      expect(created.installation).toMatchObject({ status: 'pending_pr', repo: repo.fullName, agent_name: 'Route Reviewer', pr_url: `https://github.com/${repo.fullName}/pull/9` });
      expect(created.pr_url).toBe(`https://github.com/${repo.fullName}/pull/9`);
      const commit = gh.committed.at(-1)!;
      expect(commit).toMatchObject({ branch: CI_BRANCH, base: 'trunk' });
      expect(commit.files.map((f) => f.path)).toContain(WORKFLOW_PATH);
      expect(created.file_count).toBe(commit.files.length);

      const second = await app.inject({ method: 'POST', url: `/agents/${agent.id}/export-ci`, payload: body(repo.fullName, { post_as: 'none' }) });
      expect(second.statusCode).toBe(200);
      const list = await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci/installations` });
      const items = list.json() as { id: string; post_as: string }[];
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ id: created.installation.id, post_as: 'none' });
    });

    it('AC-33: another agent exporting to the same repository (any letter case) gets 409 ci_repo_taken with the owner in details', async () => {
      const owner = await insertAgent(db(), workspaceId, { name: 'Owner Agent' });
      const rival = await insertAgent(db(), workspaceId, { name: 'Rival Agent' });
      const repo = await insertRepo(db(), workspaceId, `Acme/Mixed-${suffix()}`);
      const ok = await app.inject({ method: 'POST', url: `/agents/${owner.id}/export-ci`, payload: body(repo.fullName) });
      expect(ok.statusCode).toBe(201);
      const commitsBefore = gh.committed.length;

      const res = await app.inject({ method: 'POST', url: `/agents/${rival.id}/export-ci`, payload: body(repo.fullName.toLowerCase()) });

      expect(res.statusCode).toBe(409);
      const err = (res.json() as { error: { code: string; details: { agent_id: string; agent_name: string; installation_id: string } } }).error;
      expect(err.code).toBe('ci_repo_taken');
      expect(err.details).toMatchObject({ agent_id: owner.id, agent_name: 'Owner Agent', installation_id: (ok.json() as { installation: { id: string } }).installation.id });
      expect(gh.committed.length).toBe(commitsBefore); // nothing was committed
      const rows = await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.agentId, rival.id));
      expect(rows).toEqual([]);
    });

    it('AC-18 / AC-19: the zip route answers application/zip named devdigest-ci-<repo>.zip and records the installation as manual', async () => {
      const agent = await insertAgent(db(), workspaceId);
      const repo = await insertRepo(db(), workspaceId, `acme/zip-${suffix()}`);
      const preview = await app.inject({ method: 'POST', url: `/agents/${agent.id}/ci/preview`, payload: body(repo.fullName, { action: 'files' }) });
      const previewPaths = (preview.json() as { files: { path: string }[] }).files.map((f) => f.path).sort();

      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/export-ci/archive`, payload: body(repo.fullName, { action: 'files' }) });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/zip');
      expect(res.headers['content-disposition']).toContain(`devdigest-ci-${repo.name}.zip`);
      expect(Object.keys(unzipSync(new Uint8Array(res.rawPayload))).sort()).toEqual(previewPaths);
      const [row] = await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.agentId, agent.id));
      expect(row).toMatchObject({ status: 'manual', repo: repo.fullName });
    });

    it('EC-1: without a stored GitHub token the export answers 409 github_token_missing', async () => {
      const agent = await insertAgent(db(), workspaceId);
      const repo = await insertRepo(db(), workspaceId);
      const saved = secrets.GITHUB_TOKEN;
      secrets.GITHUB_TOKEN = undefined;
      try {
        const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/export-ci`, payload: body(repo.fullName) });
        expect(res.statusCode).toBe(409);
        expect((res.json() as { error: { code: string } }).error.code).toBe('github_token_missing');
        expect(await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.agentId, agent.id))).toEqual([]);
      } finally {
        secrets.GITHUB_TOKEN = saved;
      }
    });

    it('EC-4 / EC-6 / UI-6: an unsupported target, no trigger, or an unknown post mode is a 422', async () => {
      const agent = await insertAgent(db(), workspaceId);
      const repo = await insertRepo(db(), workspaceId);
      const call = (payload: unknown) => app.inject({ method: 'POST', url: `/agents/${agent.id}/ci/preview`, payload: payload as object });

      const jenkins = await call(body(repo.fullName, { target: 'jenkins' }));
      expect(jenkins.statusCode).toBe(422);
      expect((jenkins.json() as { error: { code: string } }).error.code).toBe('unsupported_target');
      expect((await call(body(repo.fullName, { triggers: [] }))).statusCode).toBe(422);
      expect((await call(body(repo.fullName, { triggers: ['push'] }))).statusCode).toBe(422);
      expect((await call(body(repo.fullName, { post_as: 'slack' }))).statusCode).toBe(422);
    });

    it('UI-4: a repository that is not connected in the workspace is a 404 and nothing reaches GitHub', async () => {
      const agent = await insertAgent(db(), workspaceId);
      const commitsBefore = gh.committed.length;

      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/export-ci`, payload: body('evil/not-connected') });

      expect(res.statusCode).toBe(404);
      expect(gh.committed.length).toBe(commitsBefore);
    });

    it('NFR-8: preview of an agent with 10 skills answers within 2 s and leaves runner contents out', async () => {
      const agent = await insertAgent(db(), workspaceId);
      const repo = await insertRepo(db(), workspaceId);
      for (let i = 0; i < 10; i++) {
        const [skill] = await db().insert(t.skills).values({
          workspaceId, name: `Perf Skill ${i} ${suffix()}`, description: 'd', type: 'convention', source: 'manual', body: `# skill ${i}\n`.repeat(50),
        }).returning();
        await db().insert(t.agentSkills).values({ agentId: agent.id, skillId: skill!.id, order: i });
      }

      const started = Date.now();
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/ci/preview`, payload: body(repo.fullName) });
      const elapsed = Date.now() - started;

      expect(res.statusCode).toBe(200);
      expect(elapsed).toBeLessThan(2000);
      const files = (res.json() as { files: { path: string; kind: string; contents: string | null }[] }).files;
      expect(files.filter((f) => f.kind === 'skill')).toHaveLength(10);
      for (const f of files.filter((x) => x.kind === 'runner')) expect(f.contents).toBeNull();
    });

    it('NFR-12: the token and the OpenRouter key are in no preview, export or archive response', async () => {
      const agent = await insertAgent(db(), workspaceId);
      const repo = await insertRepo(db(), workspaceId);
      const responses = [
        await app.inject({ method: 'POST', url: `/agents/${agent.id}/ci/preview`, payload: body(repo.fullName) }),
        await app.inject({ method: 'POST', url: `/agents/${agent.id}/export-ci`, payload: body(repo.fullName) }),
      ];
      const text = responses.map((r) => r.body).join('\n') + gh.committed.at(-1)!.files.map((f) => f.contents).join('\n') + (gh.openedPrs.at(-1)?.body ?? '');

      expect(text).not.toContain(secrets.GITHUB_TOKEN!);
      expect(text).not.toContain(secrets.OPENROUTER_API_KEY!);
    });
  });
});
