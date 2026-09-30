import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import type { LLMProvider, StructuredRequest, StructuredResult, CompletionResult, ModelInfo } from '@devdigest/shared';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';
import { OnboardingTourService } from '../src/modules/onboarding-tour/service.js';
import type { RepoIntel, IndexState } from '../src/modules/repo-intel/types.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[onboarding-tour] Docker not available — skipping integration tests.');

/** Scripted structured-output LLM: ok fixture, schema-invalid, throwing, or never answering. */
class ScriptedLLM implements LLMProvider {
  readonly id = 'openrouter' as unknown as LLMProvider['id'];
  mode: 'ok' | 'invalid' | 'throw' | 'hang' = 'ok';
  fixture: unknown = {};
  calls: StructuredRequest<unknown>[] = [];
  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async complete(): Promise<CompletionResult> {
    throw new Error('not used');
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(req as StructuredRequest<unknown>);
    if (this.mode === 'hang') return new Promise(() => undefined);
    if (this.mode === 'throw') throw new Error('provider exploded PROMPT-LEAK');
    const data = this.mode === 'invalid' ? { nonsense: true } : this.fixture;
    const parsed = (req.schema as { safeParse(v: unknown): { success: boolean; data?: T } }).safeParse(data);
    if (!parsed.success) throw new Error('schema validation failed');
    return { data: parsed.data as T, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '', attempts: 1 };
  }
  async embed(): Promise<number[][]> {
    return [];
  }
}

const GOOD_FIXTURE = {
  architecture: {
    body: 'Engine behind the API.',
    nodes: [
      { id: 'api', label: 'API', path: 'src/api' },
      { id: 'ghost', label: 'Ghost', path: 'src/ghost' },
    ],
    edges: [{ from: 'api', to: 'ghost' }],
  },
  critical_paths: [
    { path: 'src/core/engine.ts', reason: 'The engine.' },
    { path: 'src/ghost.ts', reason: 'Invented.' },
  ],
  run_locally: [
    { command: 'npm run dev', description: 'Start it' },
    { command: 'rm -rf /', description: 'Invented' },
  ],
  reading_path: [{ path: 'README.md', why: 'Overview' }],
  first_tasks: [{ title: 'Harden engine', description: 'Do it.', paths: ['src/core/engine.ts'], complexity: 'high' }],
};

/** Mock git whose history is scripted: counts, an error, or never answering. */
class HistoryGit extends MockGitClient {
  counts: Record<string, number> = {};
  mode: 'ok' | 'throw' | 'hang' = 'ok';
  calls: { days: number }[] = [];
  async historyCounts(_repo: unknown, sinceDays: number): Promise<Record<string, number>> {
    this.calls.push({ days: sinceDays });
    if (this.mode === 'hang') return new Promise(() => undefined);
    if (this.mode === 'throw') throw new Error('git history exploded');
    return this.counts;
  }
}

/** Mutable RepoIntel stub: the test controls the index SHA and can gate the ranking read. */
function makeIntel() {
  const ctl = {
    sha: 'sha1',
    degraded: false,
    gate: null as Promise<void> | null,
    rankCalls: 0,
    paths: ['src/core/engine.ts', 'src/api/routes.ts', 'src/util/log.ts'],
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
      return ctl.paths;
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
  const llm = new ScriptedLLM();
  const git = new HistoryGit();

  const makeApp = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git,
        github: new MockGitHubClient(),
        repoIntel: intel,
        llm: { openrouter: llm },
      },
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
    await pg.handle.db.insert(t.fileRank).values(
      [
        ['src/core/engine.ts', 1.0],
        ['src/api/routes.ts', 0.9],
        ['src/util/log.ts', 0.8],
      ].map(([filePath, rank]) => ({ repoId, filePath: filePath as string, pagerank: rank as number, hotness: 0, rank: rank as number, percentile: 99 })),
    );
    llm.fixture = GOOD_FIXTURE;
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

  it('POST persists a model tour: 202 running, then stored:true with generated_at', async () => {
    const res = await post({});
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: 'running' });
    const body = await settled();
    expect(body.stored).toBe(true);
    expect(body.tour.meta.source).toBe('llm');
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

  describe('model enrichment (slice 3)', () => {
    const reset = () => pg.handle.db.delete(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    const run = async (payload: unknown = {}) => {
      expect((await post(payload)).statusCode).toBe(202);
      return settled();
    };

    it('one model call per generation; grounding drops unknown paths/commands/nodes; meta populated', async () => {
      await reset();
      llm.mode = 'ok';
      llm.calls = [];
      const body = await run();
      expect(llm.calls).toHaveLength(1);
      expect(llm.calls[0]!.model).toBe('deepseek/deepseek-v4-flash');
      const prompt = llm.calls[0]!.messages.map((m) => m.content).join('\n');
      expect(prompt).toContain('<untrusted source="repository-facts">');
      expect(prompt).toContain('API_KEY');
      expect(prompt).not.toContain('hunter2');
      const tour = body.tour;
      expect(tour.meta).toMatchObject({
        source: 'llm',
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4-flash',
        truncated: false,
        last_error: null,
        dropped_count: 4, // ghost node, dangling edge, ghost path, invented command
      });
      const json = JSON.stringify(tour);
      expect(json).not.toContain('ghost');
      expect(json).not.toContain('rm -rf');
      expect(tour.sections[4].items[0].complexity).toBe('high');
    });

    it('EC-3: a failing regeneration keeps the stored model tour and records last_error with time', async () => {
      const before = (await get()).json().tour;
      expect(before.meta.source).toBe('llm');
      llm.mode = 'throw';
      const after = (await run()).tour;
      expect(after.meta.source).toBe('llm');
      expect(after.meta.generated_at).toBe(before.meta.generated_at);
      expect(after.sections).toEqual(before.sections);
      expect(after.meta.last_error).toBe('Model call failed or returned invalid output');
      expect(after.meta.last_error_at).toMatch(/^\d{4}-\d\d-\d\dT/);
      expect(after.meta.last_error).not.toContain('PROMPT-LEAK');
      llm.mode = 'ok';
      const healed = (await run()).tour;
      expect(healed.meta.last_error).toBeNull();
      expect(healed.meta.last_error_at).toBeNull();
    });

    it('EC-2: no stored model tour + failure stores the skeleton with last_error', async () => {
      await reset();
      llm.mode = 'throw';
      const body = await run();
      expect(body.stored).toBe(true);
      expect(body.tour.meta.source).toBe('skeleton');
      expect(body.tour.meta.last_error).toBe('Model call failed or returned invalid output');
    });

    it('schema-invalid output is discarded (skeleton kept)', async () => {
      await reset();
      llm.mode = 'invalid';
      const body = await run();
      expect(body.tour.meta.source).toBe('skeleton');
      expect(body.tour.meta.last_error).toBe('Model call failed or returned invalid output');
    });

    it('a model call that never answers times out', async () => {
      await reset();
      llm.mode = 'hang';
      const svc = new OnboardingTourService(app.container, { llmTimeoutMs: 50 });
      await svc.startGenerate(workspaceId, repoId, { mode: 'import_graph' });
      const body = await settled();
      expect(body.tour.meta.source).toBe('skeleton');
      expect(body.tour.meta.last_error).toBe('Model call timed out');
      expect(body.tour.meta.last_error_at).toMatch(/^\d{4}-/);
      llm.mode = 'ok';
    });

    it('EC-1: a degraded index skips the model entirely and stores a skeleton', async () => {
      await reset();
      llm.mode = 'ok';
      llm.calls = [];
      ctl.degraded = true;
      try {
        const body = await run();
        expect(llm.calls).toHaveLength(0);
        expect(body.tour.meta.source).toBe('skeleton');
        expect(body.tour.meta.degraded_reason).toBe('No index yet');
      } finally {
        ctl.degraded = false;
      }
    });

    it('EC-7: no provider key gives a skeleton with reason "Model not configured"', async () => {
      await reset();
      const noKey = await buildApp({
        config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient(),
          github: new MockGitHubClient(),
          repoIntel: intel,
          secrets: new MockSecretsProvider({}),
        },
      });
      try {
        const res = await noKey.inject({ method: 'POST', url: `/repos/${repoId}/onboarding-tour/generate`, payload: {} });
        expect(res.statusCode).toBe(202);
        let body = (await noKey.inject({ method: 'GET', url: `/repos/${repoId}/onboarding-tour` })).json();
        for (let i = 0; i < 100 && body.generating; i++) {
          await new Promise((r) => setTimeout(r, 25));
          body = (await noKey.inject({ method: 'GET', url: `/repos/${repoId}/onboarding-tour` })).json();
        }
        expect(body.stored).toBe(true);
        expect(body.tour.meta.source).toBe('skeleton');
        expect(body.tour.meta.degraded_reason).toBe('Model not configured');
      } finally {
        await noKey.close();
      }
    });
  });

  describe('activity ranking (slice 4)', () => {
    const reset = () => pg.handle.db.delete(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    const run = async (payload: unknown) => {
      expect((await post(payload)).statusCode).toBe(202);
      return settled();
    };
    const critical = (tour: { sections: { kind: string; items?: { path: string; hotness?: number | null }[] }[] }) =>
      tour.sections.find((s) => s.kind === 'critical_paths')!.items!;

    it('AC-26: ranks by rank x (1 + hotness); persists mode, window and per-file hotness; file_rank untouched', async () => {
      await reset();
      const before = await pg.handle.db.select().from(t.fileRank).where(eq(t.fileRank.repoId, repoId));
      llm.mode = 'throw'; // keep the deterministic skeleton ordering visible
      git.mode = 'ok';
      git.calls = [];
      git.counts = { 'src/util/log.ts': 10, 'src/api/routes.ts': 5, 'elsewhere/not-indexed.ts': 500 };
      try {
        const body = await run({ mode: 'activity', window_days: 30 });
        expect(git.calls).toEqual([{ days: 30 }]);
        expect(body.tour.meta).toMatchObject({ ranking_mode: 'activity', window_days: 30, ranking_fallback: null });
        const items = critical(body.tour);
        expect(items.map((i) => i.path)).toEqual(['src/util/log.ts', 'src/api/routes.ts', 'src/core/engine.ts']);
        expect(items.map((i) => i.hotness)).toEqual([1, 0.5, 0]);
        const reading = body.tour.sections.find((x: { kind: string }) => x.kind === 'reading_path').items;
        const hot = Object.fromEntries(reading.map((i: { path: string; hotness: number }) => [i.path, i.hotness]));
        expect(hot['src/util/log.ts']).toBe(1);
        expect(hot['src/api/routes.ts']).toBe(0.5);
        const after = await pg.handle.db.select().from(t.fileRank).where(eq(t.fileRank.repoId, repoId));
        expect(after).toEqual(before);
      } finally {
        llm.mode = 'ok';
      }
    });

    it('defaults the window to 180 days when omitted', async () => {
      await reset();
      llm.mode = 'throw';
      git.calls = [];
      try {
        const body = await run({ mode: 'activity' });
        expect(git.calls).toEqual([{ days: 180 }]);
        expect(body.tour.meta.window_days).toBe(180);
      } finally {
        llm.mode = 'ok';
      }
    });

    it('EC-9: a failing history read falls back to import graph with the exact status line', async () => {
      await reset();
      llm.mode = 'throw';
      git.mode = 'throw';
      try {
        const body = await run({ mode: 'activity', window_days: 30 });
        expect(body.tour.meta).toMatchObject({
          ranking_mode: 'import_graph',
          window_days: null,
          ranking_fallback: 'Activity ranking unavailable — ranked by import graph',
        });
        expect(critical(body.tour).map((i) => i.path)[0]).toBe('src/core/engine.ts');
        expect(critical(body.tour).every((i) => !i.hotness)).toBe(true);
      } finally {
        git.mode = 'ok';
        llm.mode = 'ok';
      }
    });

    it('EC-9: history that exceeds its budget also falls back', async () => {
      await reset();
      llm.mode = 'throw';
      git.mode = 'hang';
      try {
        const svc = new OnboardingTourService(app.container, { historyTimeoutMs: 50 });
        await svc.startGenerate(workspaceId, repoId, { mode: 'activity', window_days: 30 });
        const body = await settled();
        expect(body.tour.meta.ranking_mode).toBe('import_graph');
        expect(body.tour.meta.ranking_fallback).toBe('Activity ranking unavailable — ranked by import graph');
      } finally {
        git.mode = 'ok';
        llm.mode = 'ok';
      }
    });

    it('import_graph requests never read history', async () => {
      await reset();
      git.calls = [];
      await run({});
      expect(git.calls).toEqual([]);
    });

    it('EC-8: activity on a repo without a clone is refused (422) and can_use_activity is false', async () => {
      const [r] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId, owner: 'acme', name: 'noclone-act', fullName: 'acme/noclone-act' })
        .returning();
      git.calls = [];
      const res = await post({ mode: 'activity' }, r!.id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('validation_error');
      expect(res.json().error.message).toBe('No local clone — activity ranking unavailable');
      expect(git.calls).toEqual([]);
      expect((await get(r!.id)).json().can_use_activity).toBe(false);
      // import-graph generation on the same repo is still accepted
      expect((await post({}, r!.id)).statusCode).toBe(202);
      await settled(r!.id);
    });
  });
});

d('SPEC-05 verification fixes (ranking source, budget, logging)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let base: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const { ctl, intel } = makeIntel();
  const llm = new ScriptedLLM();
  const git = new HistoryGit();
  const logs: { ctx: Record<string, unknown>; msg?: string }[] = [];
  const log = {
    info: (ctx: unknown, msg?: string) => void logs.push({ ctx: ctx as Record<string, unknown>, msg }),
    warn: (ctx: unknown, msg?: string) => void logs.push({ ctx: ctx as Record<string, unknown>, msg }),
  };

  const reset = () => pg.handle.db.delete(t.onboarding).where(eq(t.onboarding.repoId, repoId));
  const setRanks = async (rows: [string, number][]) => {
    await pg.handle.db.delete(t.fileRank).where(eq(t.fileRank.repoId, repoId));
    await pg.handle.db
      .insert(t.fileRank)
      .values(rows.map(([filePath, rank]) => ({ repoId, filePath, pagerank: rank, hotness: 0, rank, percentile: 99 })));
  };
  async function generate(payload: { mode: 'import_graph' | 'activity'; window_days?: number | null }) {
    const svc = new OnboardingTourService(app.container);
    await svc.startGenerate(workspaceId, repoId, payload, log);
    for (let i = 0; i < 200; i++) {
      const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding-tour` });
      const body = res.json();
      if (!body.generating) return body;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('did not settle');
  }
  const section = (tour: { sections: { kind: string }[] }, kind: string) =>
    tour.sections.find((x) => x.kind === kind) as unknown as { items: { path: string; hotness?: number | null }[] };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select({ id: t.workspaces.id }).from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
    base = await mkdtemp(join(tmpdir(), 'devdigest-tour-fix-'));
    await mkdir(join(base, 'clone'), { recursive: true });
    await writeFile(join(base, 'clone', 'package.json'), JSON.stringify({ scripts: { test: 'y' } }));
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'fixes', fullName: 'acme/fixes', clonePath: join(base, 'clone') })
      .returning();
    repoId = repo!.id;
    llm.fixture = GOOD_FIXTURE;
    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git, github: new MockGitHubClient(), repoIntel: intel, llm: { openrouter: llm } },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  it('AC-10/AC-26: orders by stored rank, not percentile (distinct ranks with equal percentile)', async () => {
    await setRanks([
      ['src/core/engine.ts', 0.501],
      ['src/api/routes.ts', 0.5],
      ['src/util/log.ts', 0.499],
    ]);
    llm.mode = 'throw';
    await reset();
    const plain = await generate({ mode: 'import_graph' });
    expect(section(plain.tour, 'critical_paths').items.map((i) => i.path)).toEqual([
      'src/core/engine.ts',
      'src/api/routes.ts',
      'src/util/log.ts',
    ]);
    git.counts = { 'src/util/log.ts': 10, 'src/api/routes.ts': 5 };
    await reset();
    const act = await generate({ mode: 'activity', window_days: 30 });
    // engine .501, routes .5 x 1.5 = .75, log .499 x 2 = .998
    expect(section(act.tour, 'critical_paths').items.map((i) => i.path)).toEqual([
      'src/util/log.ts',
      'src/api/routes.ts',
      'src/core/engine.ts',
    ]);
    llm.mode = 'ok';
  });

  it('AC-8: the reading path lists at most 5 files', async () => {
    const paths = Array.from({ length: 12 }, (_, i) => `src/m${String(i).padStart(2, '0')}.ts`);
    ctl.paths = paths;
    await setRanks(paths.map((p, i) => [p, 1 - i / 100] as [string, number]));
    try {
      llm.mode = 'throw';
      await reset();
      const skel = await generate({ mode: 'import_graph' });
      expect(section(skel.tour, 'reading_path').items.length).toBeLessThanOrEqual(5);
      // model output with many files is capped too
      llm.mode = 'ok';
      llm.fixture = { ...GOOD_FIXTURE, reading_path: paths.map((p) => ({ path: p, why: 'w' })) };
      await reset();
      const enriched = await generate({ mode: 'import_graph' });
      expect(enriched.tour.meta.source).toBe('llm');
      expect(section(enriched.tour, 'reading_path').items).toHaveLength(5);
    } finally {
      llm.fixture = GOOD_FIXTURE;
      ctl.paths = ['src/core/engine.ts', 'src/api/routes.ts', 'src/util/log.ts'];
    }
  });

  it('NFR-6: system prompt + facts stay within 24 000 tokens and truncation is recorded', async () => {
    const paths = Array.from({ length: 2500 }, (_, i) => `src/generated/module-${i}/some-longer-file-name-${i}.ts`);
    ctl.paths = paths;
    await setRanks(paths.map((p, i) => [p, 1 - i / 10000] as [string, number]));
    llm.mode = 'ok';
    llm.calls = [];
    try {
      await reset();
      const body = await generate({ mode: 'import_graph' });
      expect(body.tour.meta.truncated).toBe(true);
      const all = llm.calls[0]!.messages.map((m) => m.content).join('\n');
      expect(app.container.tokenizer.count(all)).toBeLessThanOrEqual(24_000);
      expect(all).toContain('src/generated/module-0/'); // highest rank kept
      expect(all).not.toContain('module-2499/'); // lowest rank truncated first
    } finally {
      ctl.paths = ['src/core/engine.ts', 'src/api/routes.ts', 'src/util/log.ts'];
    }
  });

  it('NFR-12: every generation log carries ranking mode, window and model; none carries prompt text', async () => {
    await setRanks([['src/core/engine.ts', 1], ['src/api/routes.ts', 0.9], ['src/util/log.ts', 0.8]]);
    git.counts = { 'src/util/log.ts': 3 };
    llm.mode = 'ok';
    logs.length = 0;
    await reset();
    await generate({ mode: 'activity', window_days: 45 });
    ctl.degraded = true;
    await reset();
    await generate({ mode: 'import_graph' });
    ctl.degraded = false;
    llm.mode = 'throw';
    await reset();
    await generate({ mode: 'import_graph' });
    llm.mode = 'ok';
    const gen = logs.filter((l) => l.msg?.startsWith('onboarding tour'));
    expect(gen.map((l) => l.ctx.outcome)).toEqual(['llm', 'skeleton_degraded', 'Model call failed or returned invalid output']);
    for (const l of gen) {
      expect(l.ctx).toHaveProperty('ranking_mode');
      expect(l.ctx).toHaveProperty('window_days');
      expect(l.ctx.provider).toBe('openrouter');
      expect(l.ctx.model).toBe('deepseek/deepseek-v4-flash');
    }
    expect(gen[0]!.ctx).toMatchObject({ ranking_mode: 'activity', window_days: 45 });
    const text = JSON.stringify(logs);
    expect(text).not.toContain('repository-facts');
    expect(text).not.toContain('src/core/engine.ts');
  });
});

d('SimpleGitClient.historyCounts against a real local repository', () => {
  it('deepens a depth-1 file:// clone and counts commits per path inside the window', async () => {
    const base = await mkdtemp(join(tmpdir(), 'devdigest-hist-'));
    try {
      const origin = join(base, 'origin');
      await mkdir(origin, { recursive: true });
      const git = (cwd: string, ...args: string[]) =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
          cwd,
          encoding: 'utf8',
        });
      git(origin, 'init', '-q', '-b', 'main');
      const commit = async (file: string, body: string) => {
        await writeFile(join(origin, file), body);
        git(origin, 'add', file);
        git(origin, 'commit', '-q', '-m', `edit ${file} ${body}`);
      };
      await commit('a.txt', '1');
      await commit('a.txt', '2');
      await commit('b.txt', '1');
      await commit('a.txt', '3');

      const client = new SimpleGitClient(join(base, 'clones'));
      const repo = { owner: 'acme', name: 'hist' };
      await client.clone(repo, `file://${origin}`, { depth: 1 });
      const shallow = git(client.clonePathFor(repo), 'rev-list', '--count', 'HEAD').trim();
      expect(shallow).toBe('1');

      const counts = await client.historyCounts(repo, 30);
      expect(counts).toEqual({ 'a.txt': 3, 'b.txt': 1 });
      await expect(client.historyCounts(repo, 0)).rejects.toThrow(RangeError);
      await expect(client.historyCounts({ owner: 'acme', name: 'missing' }, 30)).rejects.toThrow(/not cloned/);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
