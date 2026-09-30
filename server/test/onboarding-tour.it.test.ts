import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import type { RepoIntel, IndexState } from '../src/modules/repo-intel/types.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[onboarding-tour] Docker not available — skipping integration tests.');

/** Mutable RepoIntel stub: the test controls the index SHA and can gate the ranking read. */
function makeIntel() {
  const ctl = {
    sha: 'sha1',
    degraded: false,
    gate: null as Promise<void> | null,
    rankCalls: 0,
  };
  const intel = {
    getIndexState: async (repoId: string): Promise<IndexState> => ({
      repoId,
      status: ctl.degraded ? 'degraded' : 'full',
      filesIndexed: 3,
      filesSkipped: 0,
      durationMs: 1,
      lastIndexedSha: ctl.degraded ? '' : ctl.sha,
      indexerVersion: 1,
      updatedAt: new Date(0),
      degraded: ctl.degraded,
      degradedReason: ctl.degraded ? 'no_data' : undefined,
    }),
    getTopFilesByRank: async () => {
      ctl.rankCalls++;
      if (ctl.gate) await ctl.gate;
      return ['src/core/engine.ts', 'src/api/routes.ts', 'src/util/log.ts'];
    },
    getFileRank: async (_id: string, paths: string[]) =>
      paths.map((path, i) => ({ path, percentile: 1 - i * 0.1 })),
    getCriticalPaths: async () => [['src/api/routes.ts', 'src/core/engine.ts']],
  } as unknown as RepoIntel;
  return { ctl, intel };
}

d('SPEC-05 onboarding tour (routes + persistence)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let base: string;
  let repoId: string;
  let otherRepoId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const { ctl, intel } = makeIntel();

  const makeApp = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), repoIntel: intel },
    });
  const get = (id = repoId) => app.inject({ method: 'GET', url: `/repos/${id}/onboarding-tour` });
  const post = (payload?: unknown, id = repoId) =>
    app.inject({ method: 'POST', url: `/repos/${id}/onboarding-tour/generate`, payload: payload as object });
  async function settled(id = repoId) {
    for (let i = 0; i < 100; i++) {
      const body = (await get(id)).json();
      if (!body.generating) return body;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('generation did not settle');
  }

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select({ id: t.workspaces.id }).from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
    base = await mkdtemp(join(tmpdir(), 'devdigest-tour-it-'));
    await mkdir(join(base, 'clone'), { recursive: true });
    await writeFile(join(base, 'clone', 'package.json'), JSON.stringify({ scripts: { dev: 'x', test: 'y' } }));
    await writeFile(join(base, 'clone', '.env.example'), 'API_KEY=hunter2\n');
    await writeFile(join(base, 'clone', 'README.md'), '# hi');
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'tour', fullName: 'acme/tour', clonePath: join(base, 'clone') })
      .returning();
    repoId = repo!.id;
    const [ws2] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-tour-ws' }).returning();
    const [other] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws2!.id, owner: 'zed', name: 'secret', fullName: 'zed/secret' })
      .returning();
    otherRepoId = other!.id;
    await pg.handle.db.insert(t.onboarding).values({ repoId: otherRepoId, json: { sections: [], meta: {} } });
    app = await makeApp();
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  it('GET builds a live skeleton (stored:false) without writing', async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ stored: false, generating: false, stale: false, can_use_activity: true, file_count: 3 });
    expect(body.tour.sections.map((s: { kind: string }) => s.kind)).toEqual([
      'architecture',
      'critical_paths',
      'run_locally',
      'reading_path',
      'first_tasks',
    ]);
    expect(body.tour.meta.source).toBe('skeleton');
    expect(body.model_hint.model).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('hunter2');
    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(rows).toHaveLength(0);
  });

  it('scopes by workspace: another workspace repo is 404 for GET and POST', async () => {
    expect((await get(otherRepoId)).statusCode).toBe(404);
    expect((await post({}, otherRepoId)).statusCode).toBe(404);
    expect((await get(randomUUID())).statusCode).toBe(404);
    expect((await get('not-a-uuid')).statusCode).toBe(422);
  });

  it('EC-1: a repo with no clone and no index still returns 200 with a reason', async () => {
    const [r] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'noclone', fullName: 'acme/noclone' })
      .returning();
    ctl.degraded = true;
    try {
      const res = await get(r!.id);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.tour.meta.degraded_reason).toBe('Repository is not cloned');
      expect(body.can_use_activity).toBe(false);
    } finally {
      ctl.degraded = false;
    }
  });

  it('POST validates window_days (422 at 6 and 731, non-integer)', async () => {
    for (const window_days of [6, 731, 7.5]) {
      const res = await post({ mode: 'activity', window_days });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('validation_error');
    }
  });

  it('POST persists the skeleton: 202 running, then stored:true with generated_at', async () => {
    const res = await post({});
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: 'running' });
    const body = await settled();
    expect(body.stored).toBe(true);
    expect(body.tour.meta.source).toBe('skeleton');
    expect(body.tour.meta.generated_at).toBeTruthy();
    expect(body.tour.meta.index_sha).toBe('sha1');
    expect(body.stale).toBe(false);
    const rows = await pg.handle.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    expect(rows).toHaveLength(1);
  });

  it('stale is computed on read from the index SHA', async () => {
    ctl.sha = 'sha2';
    try {
      expect((await get()).json().stale).toBe(true);
    } finally {
      ctl.sha = 'sha1';
    }
    expect((await get()).json().stale).toBe(false);
  });

  it('a stored tour survives an app restart, and nothing is left "generating"', async () => {
    await app.close();
    app = await makeApp();
    const body = (await get()).json();
    expect(body.stored).toBe(true);
    expect(body.generating).toBe(false);
  });

  it('409 while a run holds the lock; the lock is released afterwards', async () => {
    let release!: () => void;
    ctl.gate = new Promise<void>((r) => (release = r));
    try {
      const first = await post({});
      expect(first.statusCode).toBe(202);
      const second = await post({});
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe('conflict');
      expect((await get()).json().generating).toBe(true);
    } finally {
      ctl.gate = null;
      release();
    }
    const done = await settled();
    expect(done.generating).toBe(false);
    expect((await post({})).statusCode).toBe(202);
    await settled();
  });
});
