import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

class FailingSyncGit extends MockGitClient {
  async sync(): Promise<{ head: string }> {
    throw new Error('fatal: could not read from https://user:s3cr3t@github.com/acme/x.git');
  }
}

/**
 * SPEC-04 Project Context routes + attachment persistence, against a real
 * Postgres and a real temp-dir "clone" behind the mock git adapter.
 */
d('SPEC-04 project context (routes + persistence)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let base: string;
  let cloneDir: string;
  let repoId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let git: MockGitClient;

  async function put(rel: string, content: string | Buffer) {
    const full = join(cloneDir, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  const makeApp = (g: MockGitClient) =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: g, github: new MockGitHubClient() },
    });
  let seq = 0;
  async function newAgent(a = app): Promise<string> {
    const res = await a.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `Ctx Agent ${seq++}`, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
    });
    return res.json().id;
  }
  async function newSkill(enabled = true): Promise<string> {
    const [s] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name: `ctx-skill-${seq++}`, description: 'd', type: 'convention', source: 'manual', body: 'Prefer small functions.', enabled })
      .returning();
    return s!.id;
  }

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select({ id: t.workspaces.id }).from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
    base = await mkdtemp(join(tmpdir(), 'devdigest-ctx-it-'));
    cloneDir = join(base, 'clone');
    await mkdir(cloneDir, { recursive: true });
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'ctx', fullName: 'acme/ctx', clonePath: cloneDir })
      .returning();
    repoId = repo!.id;
    await put('docs/architecture-invariants.md', '# Invariants\nmodule `api/` does not import `db/` directly');
    await put('specs/feature.md', '# Feature');
    await put('docs/big.md', 'x'.repeat(40 * 1024));
    await put('docs/bin.md', Buffer.from([0xff, 0xfe, 0x00]));
    await put('README.md', 'not listed');
    await put('node_modules/p/docs/x.md', 'excluded');
    git = new MockGitClient();
    app = await makeApp(git);
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  describe('listing / preview / rescan', () => {
    it('AC-1/EC-4/EC-5: lists matching docs without content; oversize + non-UTF-8 are unattachable', async () => {
      const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.state).toBe('ok');
      expect(body.total).toBe(4);
      const byPath = Object.fromEntries(body.files.map((f: { path: string }) => [f.path, f]));
      expect(Object.keys(byPath).sort()).toEqual([
        'docs/architecture-invariants.md',
        'docs/big.md',
        'docs/bin.md',
        'specs/feature.md',
      ]);
      expect(byPath['docs/architecture-invariants.md']).toMatchObject({ kind: 'docs', attachable: true, used_by: 0 });
      expect(byPath['docs/architecture-invariants.md'].tokens).toBeGreaterThan(0);
      expect(byPath['docs/architecture-invariants.md'].content).toBeUndefined();
      expect(byPath['specs/feature.md'].kind).toBe('specs');
      expect(byPath['docs/big.md']).toMatchObject({ attachable: false, unattachable_reason: 'too_large' });
      expect(byPath['docs/bin.md']).toMatchObject({ attachable: false, unattachable_reason: 'not_utf8' });
    });

    it('EC-1: a repo without a clone lists as not_cloned (200, empty), rescan does not sync', async () => {
      const [r] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name: 'noclone', fullName: 'acme/noclone' })
        .returning();
      const res = await app.inject({ method: 'GET', url: `/repos/${r!.id}/context` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ files: [], total: 0, state: 'not_cloned' });
      const before = git.syncs.length;
      const rescan = await app.inject({ method: 'POST', url: `/repos/${r!.id}/context/rescan` });
      expect(rescan.json().state).toBe('not_cloned');
      expect(git.syncs.length).toBe(before);
    });

    it('EC-1: a recorded clonePath that no longer exists on disk is not_cloned too', async () => {
      const [r] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name: 'gone', fullName: 'acme/gone', clonePath: join(base, 'deleted') })
        .returning();
      const res = await app.inject({ method: 'GET', url: `/repos/${r!.id}/context` });
      expect(res.json().state).toBe('not_cloned');
      const file = await app.inject({ method: 'GET', url: `/repos/${r!.id}/context/file?path=docs/a.md` });
      expect(file.statusCode).toBe(404);
    });

    it('preview returns content; invalid/absent paths are rejected', async () => {
      const ok = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/file?path=docs/architecture-invariants.md` });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().content).toContain('does not import');
      for (const p of ['../etc/passwd.md', '/etc/x.md', 'docs%5Ca.md', 'src/a.md', 'docs/a.txt']) {
        const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/file?path=${p}` });
        expect(res.statusCode, p).toBe(422);
        expect(res.json().error?.code ?? res.json().code).toBe('validation_error');
      }
      const missing = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/file?path=docs/none.md` });
      expect(missing.statusCode).toBe(404);
    });

    it('AC-1: rescan syncs through the git port (default branch) and returns the fresh listing', async () => {
      await put('docs/new-after-sync.md', 'fresh');
      const before = git.syncs.length;
      const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/context/rescan` });
      expect(res.statusCode).toBe(200);
      expect(git.syncs.length).toBe(before + 1);
      expect(res.json().warning).toBeUndefined();
      expect(res.json().files.map((f: { path: string }) => f.path)).toContain('docs/new-after-sync.md');
    });

    it('EC-26: a failed sync still serves the on-disk listing with warning=fetch_failed and leaks no credentials', async () => {
      const failing = await makeApp(new FailingSyncGit());
      const res = await failing.inject({ method: 'POST', url: `/repos/${repoId}/context/rescan` });
      await failing.close();
      expect(res.statusCode).toBe(200);
      expect(res.json().warning).toBe('fetch_failed');
      expect(res.json().files.length).toBeGreaterThan(0);
      expect(res.body).not.toContain('s3cr3t');
    });

    it('unknown repo id is 404', async () => {
      const res = await app.inject({ method: 'GET', url: '/repos/00000000-0000-0000-0000-000000000000/context' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /agents/:id/context', () => {
    it('AC-17: a changed list bumps version and snapshots it in agent_versions; order and dedupe kept', async () => {
      const id = await newAgent();
      const res = await app.inject({
        method: 'PUT',
        url: `/agents/${id}/context`,
        payload: { paths: ['specs/feature.md', 'docs/architecture-invariants.md', 'specs/feature.md'] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().context_paths).toEqual(['specs/feature.md', 'docs/architecture-invariants.md']);
      expect(res.json().version).toBe(2);
      const [v2] = await pg.handle.db
        .select()
        .from(t.agentVersions)
        .where(and(eq(t.agentVersions.agentId, id), eq(t.agentVersions.version, 2)));
      expect((v2!.configJson as { context_paths: string[] }).context_paths).toEqual([
        'specs/feature.md',
        'docs/architecture-invariants.md',
      ]);
    });

    it('AC-17: an identical list is a no-op (no bump, no new snapshot); a reorder is a change', async () => {
      const id = await newAgent();
      const url = `/agents/${id}/context`;
      const paths = ['docs/architecture-invariants.md', 'specs/feature.md'];
      await app.inject({ method: 'PUT', url, payload: { paths } });
      const again = await app.inject({ method: 'PUT', url, payload: { paths } });
      expect(again.json().version).toBe(2);
      const snaps = await pg.handle.db.select().from(t.agentVersions).where(eq(t.agentVersions.agentId, id));
      expect(snaps).toHaveLength(2);
      const reordered = await app.inject({ method: 'PUT', url, payload: { paths: [...paths].reverse() } });
      expect(reordered.json().version).toBe(3);
      const cleared = await app.inject({ method: 'PUT', url, payload: { paths: [] } });
      expect(cleared.json()).toMatchObject({ version: 4, context_paths: [] });
    });

    it('NFR-5/UI-1: an invalid path is a 422 validation_error and nothing is saved', async () => {
      const id = await newAgent();
      for (const bad of ['../secret.md', '/abs/docs/a.md', 'docs\\a.md', 'src/a.md', 'docs/a.txt', 'node_modules/docs/a.md', 'docs/a\nb.md']) {
        const res = await app.inject({ method: 'PUT', url: `/agents/${id}/context`, payload: { paths: ['docs/ok.md', bad] } });
        expect(res.statusCode, bad).toBe(422);
        expect(res.json().error?.code ?? res.json().code, bad).toBe('validation_error');
      }
      const agent = (await app.inject({ method: 'GET', url: `/agents/${id}` })).json();
      expect(agent.context_paths).toEqual([]);
      expect(agent.version).toBe(1);
      const wrongShape = await app.inject({ method: 'PUT', url: `/agents/${id}/context`, payload: { paths: 'docs/a.md' } });
      expect(wrongShape.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('NFR-4: an agent of another workspace is 404 and untouched', async () => {
      const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: 'ctx-other-ws' }).returning();
      const [foreign] = await pg.handle.db
        .insert(t.agents)
        .values({ workspaceId: ws2!.id, name: 'foreign', provider: 'openai', model: 'm', systemPrompt: 's' })
        .returning();
      const res = await app.inject({ method: 'PUT', url: `/agents/${foreign!.id}/context`, payload: { paths: ['docs/a.md'] } });
      expect(res.statusCode).toBe(404);
      const [row] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, foreign!.id));
      expect(row!.contextPaths).toEqual([]);
    });
  });

  describe('PUT /skills/:id/context', () => {
    it('AC-18: saves the list but leaves skill.version and skill_versions untouched', async () => {
      const id = await newSkill();
      const [before] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, id));
      const versionsBefore = await pg.handle.db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, id));
      const res = await app.inject({
        method: 'PUT',
        url: `/skills/${id}/context`,
        payload: { paths: ['docs/architecture-invariants.md', 'docs/architecture-invariants.md'] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().context_paths).toEqual(['docs/architecture-invariants.md']);
      expect(res.json().version).toBe(before!.version);
      const [after] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, id));
      expect(after!.version).toBe(before!.version);
      expect(after!.body).toBe(before!.body);
      const versionsAfter = await pg.handle.db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, id));
      expect(versionsAfter).toHaveLength(versionsBefore.length);
    });

    it('NFR-5/UI-1: invalid path is a 422 validation_error; unknown skill is 404', async () => {
      const id = await newSkill();
      const bad = await app.inject({ method: 'PUT', url: `/skills/${id}/context`, payload: { paths: ['../x.md'] } });
      expect(bad.statusCode).toBe(422);
      expect(bad.json().error?.code ?? bad.json().code).toBe('validation_error');
      const nf = await app.inject({
        method: 'PUT',
        url: '/skills/00000000-0000-0000-0000-000000000000/context',
        payload: { paths: [] },
      });
      expect(nf.statusCode).toBe(404);
    });
  });

  describe('used_by', () => {
    it('AC-6: counts distinct agents in the workspace, incl. via an enabled skill on an enabled link; not disabled ones, not other workspaces', async () => {
      const P = 'specs/feature.md';
      const a1 = await newAgent();
      const a2 = await newAgent();
      const a3 = await newAgent();
      await app.inject({ method: 'PUT', url: `/agents/${a1}/context`, payload: { paths: [P] } });
      // a2 gets it through an enabled skill; a1 also links the same skill (still one agent)
      const skillOn = await newSkill(true);
      await app.inject({ method: 'PUT', url: `/skills/${skillOn}/context`, payload: { paths: [P] } });
      await pg.handle.db.insert(t.agentSkills).values([
        { agentId: a2, skillId: skillOn, order: 0, enabled: true },
        { agentId: a1, skillId: skillOn, order: 0, enabled: true },
      ]);
      // a3: link disabled -> not counted
      await pg.handle.db.insert(t.agentSkills).values({ agentId: a3, skillId: skillOn, order: 0, enabled: false });
      // a skill that is itself disabled -> not counted for anyone
      const skillOff = await newSkill(false);
      await app.inject({ method: 'PUT', url: `/skills/${skillOff}/context`, payload: { paths: [P] } });
      await pg.handle.db.insert(t.agentSkills).values({ agentId: a3, skillId: skillOff, order: 1, enabled: true });
      // another workspace attaches the same path -> not counted
      const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: `used-by-other-${seq++}` }).returning();
      await pg.handle.db
        .insert(t.agents)
        .values({ workspaceId: ws2!.id, name: 'other', provider: 'openai', model: 'm', systemPrompt: 's', contextPaths: [P] });

      const listing = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context` })).json();
      const file = listing.files.find((f: { path: string }) => f.path === P);
      // agents attached earlier in this file (if any) also count, so assert relative to a baseline
      const preview = (await app.inject({ method: 'GET', url: `/repos/${repoId}/context/file?path=${P}` })).json();
      expect(preview.used_by).toBe(file.used_by);
      const users = new Set([a1, a2]);
      const all = await pg.handle.db.select({ id: t.agents.id, cp: t.agents.contextPaths }).from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
      for (const a of all) if ((a.cp as string[]).includes(P)) users.add(a.id);
      expect(file.used_by).toBe(users.size);
      expect(users.has(a3)).toBe(false);
    });

    it('NFR-4: a repo of another workspace is 404 through every context route', async () => {
      const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: `ctx-repo-other-${seq++}` }).returning();
      const [foreign] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId: ws2!.id, owner: 'x', name: 'y', fullName: 'x/y', clonePath: cloneDir })
        .returning();
      for (const [method, url] of [
        ['GET', `/repos/${foreign!.id}/context`],
        ['GET', `/repos/${foreign!.id}/context/file?path=docs/architecture-invariants.md`],
        ['POST', `/repos/${foreign!.id}/context/rescan`],
      ] as const) {
        const res = await app.inject({ method, url });
        expect(res.statusCode, url).toBe(404);
      }
    });
  });
});
