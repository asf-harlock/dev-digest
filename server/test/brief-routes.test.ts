import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance, type RouteOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BriefModelOutput, LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { AppError, ConfigError } from '../src/platform/errors.js';

/**
 * Hermetic — no Postgres. The brief repository is replaced by an in-memory
 * fake that mirrors its contract (workspace-scoped reads, shallow merge), so
 * what is under test is the route + service orchestration: status codes, the
 * lock, the deadline race, model resolution, prompt contents, logging.
 */

interface FakePull {
  id: string;
  workspaceId: string;
  repoId: string;
  title: string;
  body: string | null;
  headSha: string;
}
interface Store {
  pulls: Map<string, FakePull>;
  files: { path: string; additions: number; deletions: number; patch: string | null }[];
  stored: Map<string, Record<string, unknown>>;
  override: { provider: string; model: string } | undefined;
  merges: Record<string, unknown>[];
}

const h = vi.hoisted(() => ({
  store: undefined as unknown as Store,
}));

vi.mock('../src/modules/brief/repository.js', () => ({
  BriefRepository: class {
    async getPull(ws: string, id: string) {
      const p = h.store.pulls.get(id);
      return p && p.workspaceId === ws ? p : undefined;
    }
    async getFiles() {
      return h.store.files;
    }
    async getStored(_ws: string, id: string) {
      return h.store.stored.get(id);
    }
    async getFeatureModelOverride() {
      return h.store.override;
    }
    async mergeEnvelope(ws: string, id: string, patch: Record<string, unknown>) {
      const p = h.store.pulls.get(id);
      if (!p || p.workspaceId !== ws) return false;
      h.store.merges.push(patch);
      h.store.stored.set(id, { ...(h.store.stored.get(id) ?? {}), ...patch });
      return true;
    }
  },
}));

// Imported after the mock is registered.
const { default: briefRoutes } = await import('../src/modules/brief/routes.js');
const { resetBriefLocks } = await import('../src/modules/brief/service.js');

const WS = 'ws-1';
const PR = '11111111-1111-4111-8111-111111111111';
const FOREIGN_PR = '22222222-2222-4222-8222-222222222222';
const MISSING_PR = '33333333-3333-4333-8333-333333333333';
const OK_OUTPUT: BriefModelOutput = {
  summary: 'Adds a limiter.',
  risks: [
    { kind: 'logic', title: 'Real', explanation: 'e', severity: 'high', file_refs: ['src/a.ts:3'] },
    { kind: 'logic', title: 'Ghost', explanation: 'e', severity: 'low', file_refs: ['src/ghost.ts'] },
  ],
  review_focus: [{ file: 'src/a.ts', line: 3, reason: 'look' }],
};
const PATCH = '@@ -1,2 +1,3 @@ function trailerLeak() {\n ctx\n+ADDED_MARKER\n-REMOVED_MARKER';

interface Harness {
  app: FastifyInstance;
  llm: MockLLMProvider;
  llmFor: ReturnType<typeof vi.fn>;
  logs: Record<string, unknown>[];
  routes: RouteOptions[];
  github: { getIssue: ReturnType<typeof vi.fn> };
  specs: { clonePath: string | null; contextPaths: string[] };
}

let cleanup: (() => Promise<void>)[] = [];

async function build(
  opts: {
    llm?: LLMProvider;
    providers?: Record<string, LLMProvider | undefined>;
    deadlineMs?: number;
    withRateLimit?: boolean;
  } = {},
): Promise<Harness> {
  const llm = new MockLLMProvider('openai', { structured: OK_OUTPUT });
  const providers = opts.providers ?? { openai: opts.llm ?? llm };
  const llmFor = vi.fn(async (id: string) => {
    const p = providers[id];
    if (!p) throw new ConfigError(`${id} key is not configured`);
    return p;
  });
  const github = { getIssue: vi.fn(async () => ({ number: 12, title: 'Issue', body: 'issue body' })) };
  const specs = { clonePath: null as string | null, contextPaths: [] as string[] };
  const container = {
    db: {},
    auth: {
      currentUser: async () => ({ id: 'u1', email: 'x', name: 'x' }),
      currentWorkspace: async () => ({ id: WS, name: 'default' }),
    },
    llm: llmFor,
    github: async () => github,
    git: { currentHead: async () => 'head-sha' },
    tokenizer: { count: (t: string) => Math.ceil(t.length / 4) },
    reviewRepo: {
      getRepo: async () => ({ owner: 'acme', name: 'api', clonePath: specs.clonePath }),
      getIntent: async () => undefined,
    },
    repoIntel: {
      getBlastRadius: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true, reason: 'no_data' }),
    },
    agentsRepo: {
      listEnabled: async () => (specs.contextPaths.length ? [{ id: 'a1', contextPaths: specs.contextPaths }] : []),
      enabledSkillsForPrompt: async () => [],
    },
  };

  const logs: Record<string, unknown>[] = [];
  const app = Fastify({
    logger: { level: 'info', stream: { write: (line: string) => logs.push(JSON.parse(line)) } },
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('container', container as never);
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      return;
    }
    reply.status((err as { statusCode?: number }).statusCode ?? 500).send({ error: { code: 'internal_error', message: String(err) } });
  });
  const routes: RouteOptions[] = [];
  app.addHook('onRoute', (r) => routes.push(r));
  if (opts.withRateLimit) await app.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
  await app.register(briefRoutes, opts.deadlineMs !== undefined ? { deadlineMs: opts.deadlineMs } : {});
  await app.ready();
  cleanup.push(() => app.close());
  return { app, llm, llmFor, logs, routes, github, specs };
}

const post = (app: FastifyInstance, id = PR) => app.inject({ method: 'POST', url: `/pulls/${id}/brief` });
const get = async (app: FastifyInstance, id = PR) => (await app.inject({ method: 'GET', url: `/pulls/${id}/brief` })).json();

async function until(fn: () => boolean | Promise<boolean>, timeoutMs = 3000) {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}
const settled = (id = PR) => until(() => get(h2app!, id).then((b) => !b.generating));
let h2app: FastifyInstance | undefined;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

/** An LLM whose completeStructured blocks until the test releases it. */
function gatedLLM() {
  const gate = deferred<void>();
  const calls: unknown[] = [];
  const llm = {
    id: 'openai',
    calls,
    async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      calls.push(req);
      await gate.promise;
      return {
        data: OK_OUTPUT as unknown as T,
        model: req.model,
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.001,
        raw: '{}',
        attempts: 1,
      };
    },
  } as unknown as LLMProvider & { calls: unknown[] };
  return { llm, gate, calls };
}

beforeEach(() => {
  resetBriefLocks();
  h2app = undefined;
  h.store = {
    pulls: new Map([[PR, { id: PR, workspaceId: WS, repoId: 'repo-1', title: 'Add limiter', body: 'Adds a limiter', headSha: 'head-sha' }]]),
    files: [{ path: 'src/a.ts', additions: 2, deletions: 1, patch: PATCH }],
    stored: new Map(),
    override: undefined,
    merges: [],
  };
});
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

describe('POST /pulls/:id/brief', () => {
  it('AC-2: returns 202 {status: running}, generates in the background, and GET serves the grounded brief', async () => {
    const t = await build();
    h2app = t.app;
    const res = await post(t.app);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: 'running' });
    await settled();

    const body = await get(t.app);
    expect(body.brief.risks.map((r: { title: string }) => r.title)).toEqual(['Real']);
    expect(body.meta.generated_for_sha).toBe('head-sha');
    expect(body.stale).toBe(false);
    expect(body.missing_inputs.map((m: { kind: string }) => m.kind)).toEqual(
      expect.arrayContaining(['intent_missing', 'blast_degraded', 'specs_missing', 'issue_not_referenced']),
    );
  });

  it('EC-23: a PR of another workspace is a 404 on both verbs and never reaches the model', async () => {
    const t = await build();
    h.store.pulls.set(FOREIGN_PR, { id: FOREIGN_PR, workspaceId: 'ws-other', repoId: 'r', title: 't', body: null, headSha: 's' });
    expect((await post(t.app, FOREIGN_PR)).statusCode).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: `/pulls/${FOREIGN_PR}/brief` })).statusCode).toBe(404);
    expect((await post(t.app, MISSING_PR)).statusCode).toBe(404);
    expect(t.llm.calls).toHaveLength(0);
  });

  it('EC-1: a missing provider key is config_error before the lock and before any call', async () => {
    const t = await build({ providers: {} });
    h2app = t.app;
    const res = await post(t.app);
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('config_error');
    expect((await get(t.app)).generating).toBe(false);
    expect(h.store.merges).toHaveLength(0);
  });

  it('EC-1: the failed config check did not take the lock (a later POST works)', async () => {
    const providers: Record<string, LLMProvider | undefined> = {};
    const t = await build({ providers });
    h2app = t.app;
    expect((await post(t.app)).statusCode).toBe(500);
    providers.openai = t.llm;
    expect((await post(t.app)).statusCode).toBe(202);
    await settled();
  });

  it('NFR-1 / NFR-13: concurrent POSTs give one 202 and one 409, and exactly one completeStructured call', async () => {
    const { llm, gate, calls } = gatedLLM();
    const t = await build({ llm });
    h2app = t.app;
    const [a, b] = await Promise.all([post(t.app), post(t.app)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([202, 409]);
    expect((await get(t.app)).generating).toBe(true);
    gate.resolve();
    await settled();
    expect(calls).toHaveLength(1);
  });

  it('409 while running, and the lock releases after completion', async () => {
    const { llm, gate } = gatedLLM();
    const t = await build({ llm });
    h2app = t.app;
    expect((await post(t.app)).statusCode).toBe(202);
    const dup = await post(t.app);
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('conflict');
    gate.resolve();
    await settled();
    expect((await post(t.app)).statusCode).toBe(202);
    await settled();
  });

  it('NFR-13: exactly one structured log line per generation, without prompt or PR content', async () => {
    const t = await build();
    h2app = t.app;
    h.store.pulls.get(PR)!.body = 'PRIVATE_BODY_MARKER';
    await post(t.app);
    await settled();
    await until(() => t.logs.some((l) => l.msg === 'brief generation finished'));
    const lines = t.logs.filter((l) => l.msg === 'brief generation finished');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ prId: PR, provider: 'openai', outcome: 'ok', tokensIn: 100, tokensOut: 50 });
    expect(JSON.stringify(t.logs)).not.toContain('PRIVATE_BODY_MARKER');
  });

  it('NFR-9: the POST route carries the 10/minute rate-limit config; GET does not', async () => {
    const t = await build();
    const postRoute = t.routes.find((r) => r.method === 'POST' && r.url === '/pulls/:id/brief');
    const getRoute = t.routes.find((r) => r.method === 'GET' && r.url === '/pulls/:id/brief');
    expect((postRoute?.config as { rateLimit?: unknown })?.rateLimit).toEqual({ max: 10, timeWindow: '1 minute' });
    expect((getRoute?.config as { rateLimit?: unknown } | undefined)?.rateLimit).toBeUndefined();
  });

  it('NFR-9: with the limiter registered, the 11th POST in a minute is 429', async () => {
    const { llm, gate } = gatedLLM();
    const t = await build({ llm, withRateLimit: true });
    h2app = t.app;
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await post(t.app)).statusCode);
    expect(codes[0]).toBe(202);
    expect(codes.slice(1, 10).every((c) => c === 409)).toBe(true);
    expect(codes[10]).toBe(429);
    gate.resolve();
    await settled();
  });

  it('AC-30: uses the workspace override for risk_brief', async () => {
    const other = new MockLLMProvider('anthropic', { structured: OK_OUTPUT });
    h.store.override = { provider: 'anthropic', model: 'claude-test-model' };
    const t = await build({ providers: { anthropic: other } });
    h2app = t.app;
    await post(t.app);
    await settled();
    expect(t.llmFor).toHaveBeenCalledWith('anthropic');
    expect((other.calls[0]!.req as { model: string }).model).toBe('claude-test-model');
    expect((await get(t.app)).meta).toMatchObject({ provider: 'anthropic', model: 'claude-test-model' });
  });

  it('AC-30: without an override falls back to the FEATURE_MODELS default (openai / gpt-4.1)', async () => {
    const t = await build();
    h2app = t.app;
    await post(t.app);
    await settled();
    expect(t.llmFor).toHaveBeenCalledWith('openai');
    expect((t.llm.calls[0]!.req as { model: string }).model).toBe('gpt-4.1');
  });
});

describe('prompt reaching the model', () => {
  const promptOf = (llm: MockLLMProvider) => JSON.stringify(llm.calls[0]!.req);

  it('NFR-14 / F5: no diff body line and no hunk trailer, only rebuilt numeric headers', async () => {
    const t = await build();
    h2app = t.app;
    await post(t.app);
    await settled();
    const p = promptOf(t.llm);
    expect(p).toContain('@@ -1,2 +1,3 @@');
    for (const leak of ['ADDED_MARKER', 'REMOVED_MARKER', 'trailerLeak']) expect(p).not.toContain(leak);
  });

  it('F6: a secret in the PR body, the issue body or a spec document never reaches calls[0].req', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'brief-spec-'));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    await mkdir(join(dir, 'docs'));
    await writeFile(join(dir, 'docs/spec.md'), 'Spec text with sk_live_spec000000000 inside');
    const t = await build();
    h2app = t.app;
    t.specs.clonePath = dir;
    t.specs.contextPaths = ['docs/spec.md'];
    h.store.pulls.get(PR)!.body = 'Closes #12. token sk_live_body000000000';
    t.github.getIssue.mockResolvedValue({ number: 12, title: 'Issue', body: 'issue sk_live_issue00000000' });

    await post(t.app);
    await settled();
    const p = promptOf(t.llm);
    expect(p).toContain('Spec text with');
    expect(p).toContain('issue ');
    expect(p).not.toMatch(/sk_live_(spec|body|issue)0+/);
    expect(p).toContain('[REDACTED:stripe_key]');
  });

  it('EC-26 / F9: unreadable and empty spec entries produce no spec section and specs_missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'brief-spec-'));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    await mkdir(join(dir, 'docs'));
    await writeFile(join(dir, 'docs/empty.md'), '');
    const t = await build();
    h2app = t.app;
    t.specs.clonePath = dir;
    t.specs.contextPaths = ['docs/empty.md', 'docs/missing.md'];
    await post(t.app);
    await settled();
    const p = promptOf(t.llm);
    expect(p).not.toContain('Project context');
    expect(p).not.toContain('docs/empty.md');
    expect(p).not.toContain('docs/missing.md');
    expect((await get(t.app)).missing_inputs.map((m: { kind: string }) => m.kind)).toContain('specs_missing');
  });
});

describe('failure handling', () => {
  it('EC-4: a failed regeneration keeps the last good brief and records only the error', async () => {
    const good = { brief: OK_OUTPUT, generated_for_sha: 'head-sha', generated_at: '2026-01-01T00:00:00.000Z', provider: 'openai', model: 'gpt-4.1' };
    h.store.stored.set(PR, good);
    const failing = { id: 'openai', completeStructured: async () => { throw new Error('boom sk_live_leak000000000'); } } as unknown as LLMProvider;
    const t = await build({ llm: failing });
    h2app = t.app;
    await post(t.app);
    await settled();
    const body = await get(t.app);
    expect(body.brief.summary).toBe('Adds a limiter.');
    expect(body.meta.last_error).toBe('Model call failed or returned invalid output');
    expect(body.meta.last_error_at).toBeTruthy();
    expect(JSON.stringify(h.store.stored.get(PR))).not.toContain('sk_live_leak');
    expect(Object.keys(h.store.merges[0]!).sort()).toEqual(['last_error', 'last_error_at']);
  });

  it('EC-5: an error-only envelope validates and is served with brief null', async () => {
    h.store.stored.set(PR, { last_error: 'Model call timed out', last_error_at: '2026-01-01T00:00:00.000Z' });
    const t = await build();
    const res = await t.app.inject({ method: 'GET', url: `/pulls/${PR}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json().brief).toBeNull();
    expect(res.json().meta.last_error).toBe('Model call timed out');
    expect(res.json().stale).toBe(false);
  });

  it('EC-21: an invalid stored envelope reads as no brief', async () => {
    h.store.stored.set(PR, { brief: { summary: 42 } });
    const t = await build();
    const res = await t.app.inject({ method: 'GET', url: `/pulls/${PR}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ brief: null, meta: null, stale: false });
  });

  it('AC-24 / Q-G: stale only when a stored SHA differs from head; a null SHA is not stale', async () => {
    const base = { brief: OK_OUTPUT };
    h.store.stored.set(PR, { ...base, generated_for_sha: 'older' });
    const t = await build();
    expect((await get(t.app)).stale).toBe(true);
    h.store.stored.set(PR, { ...base, generated_for_sha: null });
    expect((await get(t.app)).stale).toBe(false);
  });
});

describe('deadline and lock race (F2)', () => {
  it('holds the lock past the deadline, writes last_error at the deadline, and discards the late result', async () => {
    const { llm, gate, calls } = gatedLLM();
    const t = await build({ llm, deadlineMs: 30 });
    h2app = t.app;
    expect((await post(t.app)).statusCode).toBe(202);

    await until(() => h.store.stored.get(PR)?.last_error === 'Model call timed out');
    // Deadline passed but the orphan call is still in flight.
    expect((await get(t.app)).generating).toBe(true);
    expect((await post(t.app)).statusCode).toBe(409);
    expect(calls).toHaveLength(1);

    const mergesAtDeadline = h.store.merges.length;
    gate.resolve();
    await settled();
    await new Promise((r) => setTimeout(r, 20));
    // The late resolution wrote nothing.
    expect(h.store.merges).toHaveLength(mergesAtDeadline);
    expect(h.store.stored.get(PR)?.brief).toBeUndefined();
    expect((await get(t.app)).brief).toBeNull();
    // Lock released once the call settled.
    expect((await post(t.app)).statusCode).toBe(202);
    await settled();
  });
});
