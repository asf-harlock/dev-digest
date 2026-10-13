import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';
import { MultiAgentEstimates, MultiAgentRun } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { createMultiAgentRun } from '../src/modules/reviews/repository/multi-agent.repo.js';
import * as t from '../src/db/schema.js';

/**
 * SPEC-11 multi-agent review, end to end against a real Postgres: the routes
 * `POST /pulls/:id/multi-agent-run`, `GET /pulls/:id/multi-agent` and
 * `GET /multi-agent/estimates`, the executor underneath them, and the repo SQL.
 *
 * Parallelism is driven by a CONTROLLED mock LLM, not by timers: each agent's
 * model call blocks on a gate the test opens, so "both agents are running at the
 * same time" is something the test observes, not something it waits for.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

// ---- fixtures --------------------------------------------------------------

/** src/a.ts gets lines 1..60 added, src/b.ts lines 1..5, so grounding keeps findings on them. */
const addedFile = (path: string, n: number) =>
  [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -0,0 +1,${n} @@`,
    ...Array.from({ length: n }, (_, i) => `+line ${i + 1}`),
  ].join('\n');
const DIFF = `${addedFile('src/a.ts', 60)}\n${addedFile('src/b.ts', 5)}`;

type FixtureFinding = {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  category: 'bug' | 'security';
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  confidence: number;
  kind: 'finding';
};
const fx = (over: Partial<FixtureFinding> & Pick<FixtureFinding, 'severity' | 'title' | 'start_line' | 'end_line' | 'rationale'>): FixtureFinding => ({
  id: `fx-${over.title}`,
  category: 'bug',
  file: 'src/a.ts',
  confidence: 0.9,
  kind: 'finding',
  ...over,
});

/** What one model (= one agent) answers. `fail` makes the call throw, like a provider 429. */
type Plan = { findings: FixtureFinding[]; costUsd: number | null; fail?: string };

const PLANS: Record<string, Plan> = {
  // overlaps beta on src/a.ts and flags src/b.ts alone
  'm-alpha': {
    costUsd: 0.004,
    findings: [
      fx({ severity: 'CRITICAL', title: 'SQL injection', start_line: 10, end_line: 12, rationale: 'Unsanitised input.\nSecond line.' }),
      fx({ severity: 'WARNING', title: 'Missing check', file: 'src/b.ts', start_line: 2, end_line: 2, rationale: 'No null check.' }),
    ],
  },
  'm-beta': {
    costUsd: 0.006,
    findings: [fx({ severity: 'WARNING', title: 'Input validation', start_line: 11, end_line: 11, rationale: 'Needs validation.' })],
  },
  'm-delta': {
    costUsd: 0.002,
    findings: [fx({ severity: 'SUGGESTION', title: 'Rename', start_line: 12, end_line: 12, rationale: 'Name is unclear.' })],
  },
  'm-gamma': { costUsd: null, findings: [], fail: 'provider returned 429 Too Many Requests' },
};

/**
 * A mock LLM whose `completeStructured` records that it STARTED, then blocks on
 * a per-model gate (default: open). `untilStarted(n)` resolves once n calls have
 * entered the provider — with a sequential executor that never happens, because
 * call 2 only starts after call 1 returned.
 */
class ControlledLLM extends MockLLMProvider {
  readonly started: string[] = [];
  private gates = new Map<string, { promise: Promise<void>; open: () => void }>();
  private waiters: { n: number; resolve: () => void }[] = [];

  constructor(private plans: Record<string, Plan> = PLANS) {
    super('openai');
  }

  hold(model: string): void {
    let open!: () => void;
    const promise = new Promise<void>((r) => (open = r));
    this.gates.set(model, { promise, open });
  }

  release(model: string): void {
    this.gates.get(model)?.open();
  }

  releaseAll(): void {
    for (const g of this.gates.values()) g.open();
  }

  untilStarted(n: number): Promise<void> {
    if (this.started.length >= n) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.waiters.push({ n, resolve });
      // Failure guard only: a sequential executor would sit at 1 started call forever.
      setTimeout(() => reject(new Error(`only ${this.started.length}/${n} agents reached the model`)), 4000).unref();
    });
  }

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.started.push(req.model);
    for (const w of this.waiters) if (this.started.length >= w.n) w.resolve();
    await this.gates.get(req.model)?.promise;
    const plan = this.plans[req.model];
    if (!plan) throw new Error(`no plan for model ${req.model}`);
    if (plan.fail) throw new Error(plan.fail);
    const fixture = { verdict: 'comment', summary: `Reviewed by ${req.model}`, score: 70, findings: plan.findings };
    return {
      data: (req.schema as { parse: (v: unknown) => T }).parse(fixture),
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: plan.costUsd,
      raw: JSON.stringify(fixture),
      attempts: 1,
    };
  }
}

// ---- suite -----------------------------------------------------------------

d('SPEC-11 multi-agent review (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const cleanups: (() => Promise<void> | void)[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterEach(async () => {
    for (const c of cleanups.splice(0).reverse()) await c();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const db = () => pg.handle.db;

  async function mkApp(llm: ControlledLLM) {
    const app = await buildApp({
      config: config(),
      db: db(),
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
      },
    });
    // Open every gate first so a failed assertion never leaves a run blocked on close.
    cleanups.push(async () => {
      llm.releaseAll();
      await app.close();
    });
    return app;
  }

  let seq = 0;
  async function mkPr() {
    const name = `multi-${seq++}`;
    const [repo] = await db().insert(t.repos).values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` }).returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 700 + seq,
        title: 'Harden input handling',
        author: 'marisa.koch',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        additions: 65,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
        body: 'Body.',
      })
      .returning();
    return { repo: repo!, pr: pr! };
  }

  async function mkAgent(app: Awaited<ReturnType<typeof mkApp>>, label: string, model: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: `${label} #${seq++}`, provider: 'openai', model, system_prompt: 'review' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  type App = Awaited<ReturnType<typeof mkApp>>;
  const startRun = (app: App, prId: string, agentIds: string[]) =>
    app.inject({ method: 'POST', url: `/pulls/${prId}/multi-agent-run`, payload: { agentIds } });
  const latest = (app: App, prId: string) => app.inject({ method: 'GET', url: `/pulls/${prId}/multi-agent` });
  const snapshot = async (app: App, prId: string) => {
    const res = await latest(app, prId);
    expect(res.statusCode).toBe(200);
    return MultiAgentRun.parse(res.json());
  };
  const runRows = (prId: string) => db().select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
  const groupRows = (prId: string) => db().select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, prId));
  const statusOf = async (runId: string) =>
    (await db().select().from(t.agentRuns).where(eq(t.agentRuns.id, runId)))[0]?.status;

  /** Start a multi-agent run over the given (label, model) pairs and wait until every child is terminal. */
  async function runToCompletion(app: App, prId: string, specs: [string, string][]) {
    const agentIds: string[] = [];
    for (const [label, model] of specs) agentIds.push(await mkAgent(app, label, model));
    const res = await startRun(app, prId, agentIds);
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(db(), prId, { expected: specs.length });
    return { agentIds, snap: await snapshot(app, prId) };
  }

  // ---- request validation, nothing written (EC-2, EC-3) ---------------------

  it('EC-2: an empty agentIds is a 422 and writes no row', async () => {
    const app = await mkApp(new ControlledLLM());
    const { pr } = await mkPr();
    const res = await startRun(app, pr.id, []);
    expect(res.statusCode).toBe(422);
    expect(await groupRows(pr.id)).toHaveLength(0);
    expect(await runRows(pr.id)).toHaveLength(0);
  });

  it('EC-3: an unknown agent id is a 404 and NO multi_agent_runs / agent_runs row exists, even for the valid ids before it', async () => {
    const app = await mkApp(new ControlledLLM());
    const { pr } = await mkPr();
    const good = await mkAgent(app, 'Alpha', 'm-alpha');
    const res = await startRun(app, pr.id, [good, randomUUID()]);
    expect(res.statusCode).toBe(404);
    expect(await groupRows(pr.id)).toHaveLength(0);
    expect(await runRows(pr.id)).toHaveLength(0);
  });

  it("EC-3: an agent of another workspace is a 404 too (NFR-2)", async () => {
    const app = await mkApp(new ControlledLLM());
    const { pr } = await mkPr();
    const [other] = await db().insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
    const [foreign] = await db()
      .insert(t.agents)
      .values({ workspaceId: other!.id, name: 'Foreign', provider: 'openai', model: 'm-alpha', systemPrompt: 'x' })
      .returning();
    const res = await startRun(app, pr.id, [foreign!.id]);
    expect(res.statusCode).toBe(404);
    expect(await groupRows(pr.id)).toHaveLength(0);
  });

  it('a PR that does not exist is a 404', async () => {
    const app = await mkApp(new ControlledLLM());
    const agent = await mkAgent(app, 'Alpha', 'm-alpha');
    expect((await startRun(app, randomUUID(), [agent])).statusCode).toBe(404);
  });

  it('AC-13: the group and its children are created in ONE transaction — a failing child rolls the group back', async () => {
    const { pr } = await mkPr();
    const app = await mkApp(new ControlledLLM());
    const good = await mkAgent(app, 'Alpha', 'm-alpha');
    // The second child violates the agent FK, after the group row and the first child were inserted.
    await expect(
      createMultiAgentRun(db(), {
        workspaceId,
        prId: pr.id,
        agents: [
          { agentId: good, provider: 'openai', model: 'm-alpha' },
          { agentId: randomUUID(), provider: 'openai', model: 'm-alpha' },
        ],
      }),
    ).rejects.toThrow();
    expect(await groupRows(pr.id)).toHaveLength(0);
    expect(await runRows(pr.id)).toHaveLength(0);
  });

  // ---- start, parallelism, dedupe (AC-13, AC-14, AC-20, EC-4) ---------------

  it('AC-13/AC-14/AC-20/EC-4: one group, one child per distinct agent, both running at once, each finishing independently', async () => {
    const llm = new ControlledLLM();
    llm.hold('m-alpha');
    llm.hold('m-beta');
    const app = await mkApp(llm);
    const { pr } = await mkPr();
    const alpha = await mkAgent(app, 'Alpha', 'm-alpha');
    const beta = await mkAgent(app, 'Beta', 'm-beta');

    // EC-4: alpha is listed twice → one run for it.
    const res = await startRun(app, pr.id, [alpha, beta, alpha]);
    expect(res.statusCode).toBe(200);
    const started = MultiAgentRun.parse(res.json());

    // AC-13: the snapshot comes back before any agent finished.
    expect(started.agent_count).toBe(2);
    expect(started.columns.map((c) => c.status)).toEqual(['running', 'running']);
    expect(started.total_cost_usd).toBeNull();
    expect(started.conflicts).toEqual([]);
    const groups = await groupRows(pr.id);
    const children = await runRows(pr.id);
    expect(groups).toHaveLength(1);
    expect(children).toHaveLength(2);
    expect(children.every((c) => c.multiAgentRunId === groups[0]!.id && c.source === 'local')).toBe(true);
    expect(started.id).toBe(groups[0]!.id);

    // AC-14: BOTH agents reached the provider while both are still held — neither waited for the other.
    await llm.untilStarted(2);
    expect(new Set(llm.started)).toEqual(new Set(['m-alpha', 'm-beta']));
    expect((await runRows(pr.id)).every((r) => r.status === 'running')).toBe(true);

    // AC-20: beta finishes first; the next snapshot shows its result while alpha still runs.
    const betaRun = started.columns.find((c) => c.agent_id === beta)!.run_id;
    const alphaRun = started.columns.find((c) => c.agent_id === alpha)!.run_id;
    llm.release('m-beta');
    await vi.waitFor(async () => expect(await statusOf(betaRun)).toBe('done'));
    const mid = await snapshot(app, pr.id);
    const midBeta = mid.columns.find((c) => c.run_id === betaRun)!;
    const midAlpha = mid.columns.find((c) => c.run_id === alphaRun)!;
    expect(midBeta.status).toBe('done');
    expect(midBeta.findings).toHaveLength(1);
    expect(midAlpha.status).toBe('running');
    expect(midAlpha.findings).toEqual([]);
    expect(mid.conflicts).toEqual([]); // fewer than 2 done columns (AC-30)

    llm.release('m-alpha');
    await vi.waitFor(async () => expect(await statusOf(alphaRun)).toBe('done'));
    const end = await snapshot(app, pr.id);
    expect(end.columns.map((c) => c.status)).toEqual(['done', 'done']);
    expect(end.id).toBe(started.id); // still the same group
  });

  // ---- 409 (EC-5) -----------------------------------------------------------

  it('EC-5: a second run while a child is still running is a 409 without details and writes nothing; after it ends a new run is accepted', async () => {
    const llm = new ControlledLLM();
    llm.hold('m-alpha');
    llm.hold('m-beta');
    const app = await mkApp(llm);
    const { pr } = await mkPr();
    const alpha = await mkAgent(app, 'Alpha', 'm-alpha');
    const beta = await mkAgent(app, 'Beta', 'm-beta');

    const first = await startRun(app, pr.id, [alpha, beta]);
    expect(first.statusCode).toBe(200);

    const second = await startRun(app, pr.id, [alpha]);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.details).toBeUndefined();
    expect(await groupRows(pr.id)).toHaveLength(1);
    expect(await runRows(pr.id)).toHaveLength(2);

    llm.releaseAll();
    await waitForPrRuns(db(), pr.id, { expected: 2 });
    const third = await startRun(app, pr.id, [alpha]);
    expect(third.statusCode).toBe(200);
    expect(MultiAgentRun.parse(third.json()).id).not.toBe(MultiAgentRun.parse(first.json()).id);
    await waitForPrRuns(db(), pr.id, { expected: 3 });
    // GET now returns the newest group.
    expect((await snapshot(app, pr.id)).agent_count).toBe(1);
  });

  it('EC-5/EC-22: a standalone single-agent run that is still running does not block a multi-agent run, and carries no group id', async () => {
    const llm = new ControlledLLM();
    llm.hold('m-alpha');
    const app = await mkApp(llm);
    const { pr } = await mkPr();
    const alpha = await mkAgent(app, 'Alpha', 'm-alpha');
    const beta = await mkAgent(app, 'Beta', 'm-beta');

    const single = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: alpha } });
    expect(single.statusCode).toBe(200);
    await llm.untilStarted(1);
    const singleRunId = single.json().runs[0].run_id as string;
    expect(await statusOf(singleRunId)).toBe('running');

    const multi = await startRun(app, pr.id, [beta]);
    expect(multi.statusCode).toBe(200);

    llm.releaseAll();
    await vi.waitFor(async () => expect(await statusOf(singleRunId)).toBe('done'));
    await waitForPrRuns(db(), pr.id, { expected: 2 });

    // EC-22: the run list carries `multi_agent_run_id` — null for the single run, the group id for the child.
    const runs = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/runs` })).json() as {
      run_id: string;
      multi_agent_run_id: string | null;
    }[];
    expect(runs.find((r) => r.run_id === singleRunId)!.multi_agent_run_id).toBeNull();
    const group = MultiAgentRun.parse(multi.json());
    expect(runs.find((r) => r.run_id === group.columns[0]!.run_id)!.multi_agent_run_id).toBe(group.id);
  });

  // ---- snapshot, aggregates, conflicts (AC-15, AC-16, AC-17, AC-31..36) ------

  it('AC-15/AC-16/AC-17: the snapshot carries full findings, derived totals and the computed conflicts; each child has its own trace', async () => {
    const app = await mkApp(new ControlledLLM());
    const { pr } = await mkPr();
    const { snap } = await runToCompletion(app, pr.id, [
      ['Beta', 'm-beta'], // created first on purpose: the order must come from the name, not creation
      ['Alpha', 'm-alpha'],
    ]);

    // AC-16: ordered by agent name, every FindingRecord field present.
    expect(snap.columns.map((c) => c.model)).toEqual(['m-alpha', 'm-beta']);
    const [alphaCol, betaCol] = snap.columns;
    expect(alphaCol!.status).toBe('done');
    expect(alphaCol!.error).toBeNull();
    expect(alphaCol!.summary).toBe('Reviewed by m-alpha');
    expect(alphaCol!.score).toEqual(expect.any(Number));
    expect(alphaCol!.findings).toHaveLength(2);
    expect(alphaCol!.findings[0]).toMatchObject({
      title: expect.any(String),
      file: expect.any(String),
      end_line: expect.any(Number),
      rationale: expect.any(String),
      confidence: 0.9,
      review_id: expect.any(String),
      accepted_at: null,
      dismissed_at: null,
    });

    // AC-17: derived at read time.
    expect(snap.agent_count).toBe(2);
    expect(snap.total_cost_usd).toBeCloseTo(0.01);
    expect(Number.isInteger(snap.total_duration_ms)).toBe(true);
    expect(snap.total_duration_ms).toBeGreaterThanOrEqual(0);
    expect(snap.pr_number).toBe(pr.number);

    // AC-31..36: alpha 10-12 and beta 11-11 overlap → one contended group (different severities),
    // anchored at 10 with alpha's title; src/b.ts:2 was flagged by alpha only.
    expect(snap.conflicts).toHaveLength(2);
    const [onA, onB] = snap.conflicts;
    expect(onA).toMatchObject({ file: 'src/a.ts', line: 10, title: 'SQL injection', contended: true });
    expect(onA!.takes.map((tk) => [tk.run_id, tk.verdict, tk.note, tk.dismissed])).toEqual([
      [alphaCol!.run_id, 'CRITICAL', 'Unsanitised input.', false],
      [betaCol!.run_id, 'WARNING', 'Needs validation.', false],
    ]);
    expect(onB).toMatchObject({ file: 'src/b.ts', line: 2, title: 'Missing check', contended: true });
    expect(onB!.takes.map((tk) => [tk.verdict, tk.note])).toEqual([
      ['WARNING', 'No null check.'],
      ['ignored', ''],
    ]);

    // Nothing derived is stored (NFR-3): the group row is just id + pr + time.
    const [group] = await groupRows(pr.id);
    expect(Object.keys(group!).sort()).toEqual(['id', 'prId', 'ranAt', 'workspaceId']);

    // AC-15: each child went through the normal executor — same trace document as a single run.
    for (const col of snap.columns) {
      await vi.waitFor(async () => {
        const trace = await app.inject({ method: 'GET', url: `/runs/${col.run_id}/trace` });
        expect(trace.statusCode).toBe(200);
        expect(trace.json().config.model).toBe(col.model);
      });
    }
  });

  it('EC-10: a failing agent fails only its own column; the others finish and the conflicts ignore the failed one', async () => {
    const app = await mkApp(new ControlledLLM());
    const { pr } = await mkPr();
    const { snap } = await runToCompletion(app, pr.id, [
      ['Alpha', 'm-alpha'],
      ['Beta', 'm-beta'],
      ['Gamma', 'm-gamma'],
    ]);

    expect(snap.columns.map((c) => c.status)).toEqual(['done', 'done', 'failed']);
    const failed = snap.columns[2]!;
    expect(failed.error).toContain('429');
    expect(failed.findings).toEqual([]);
    expect(failed.cost_usd).toBeNull();
    // Known costs only: the failed column contributes nothing.
    expect(snap.total_cost_usd).toBeCloseTo(0.01);
    // AC-30/EC-10: conflicts come from the `done` columns only.
    expect(snap.conflicts.length).toBeGreaterThan(0);
    for (const c of snap.conflicts) {
      expect(c.takes.map((tk) => tk.run_id)).not.toContain(failed.run_id);
      expect(c.takes).toHaveLength(2);
    }
  });

  it('EC-12 (server side): fewer than 2 done columns → no conflicts at all', async () => {
    const app = await mkApp(new ControlledLLM());
    const { pr } = await mkPr();
    const { snap } = await runToCompletion(app, pr.id, [
      ['Alpha', 'm-alpha'],
      ['Gamma', 'm-gamma'],
    ]);
    expect(snap.columns.map((c) => c.status)).toEqual(['done', 'failed']);
    expect(snap.conflicts).toEqual([]);
  });

  // ---- deleted rows (EC-16, EC-17, EC-18) -----------------------------------

  it('EC-16: a PR with no multi-agent run is a 404', async () => {
    const app = await mkApp(new ControlledLLM());
    const { pr } = await mkPr();
    expect((await latest(app, pr.id)).statusCode).toBe(404);
    expect((await latest(app, randomUUID())).statusCode).toBe(404);
  });

  it('EC-18/EC-17/EC-16: a deleted agent keeps its column (null name, last), a deleted run leaves the others, and when every run is gone the PR is a 404', async () => {
    const app = await mkApp(new ControlledLLM());
    const { pr } = await mkPr();
    const { agentIds, snap } = await runToCompletion(app, pr.id, [
      ['Alpha', 'm-alpha'],
      ['Beta', 'm-beta'],
      ['Delta', 'm-delta'],
    ]);
    const [alphaCol, betaCol, deltaCol] = snap.columns;
    const deltaAgent = agentIds[2]!;
    expect(deltaCol!.agent_id).toBe(deltaAgent);

    // EC-18: delete Alpha's agent. The run survives with agent_id NULL; its findings stay.
    expect((await app.inject({ method: 'DELETE', url: `/agents/${agentIds[0]}` })).statusCode).toBe(200);
    const afterAgent = await snapshot(app, pr.id);
    expect(afterAgent.columns).toHaveLength(3);
    const orphan = afterAgent.columns.find((c) => c.run_id === alphaCol!.run_id)!;
    expect(orphan).toMatchObject({ agent_id: null, agent_name: null, status: 'done' });
    expect(orphan.findings).toHaveLength(2);
    // A deleted agent sorts last.
    expect(afterAgent.columns[2]!.run_id).toBe(alphaCol!.run_id);
    // It is still in the conflicts, keyed by its run_id.
    const orphanTakes = afterAgent.conflicts.flatMap((c) => c.takes).filter((tk) => tk.run_id === alphaCol!.run_id);
    expect(orphanTakes.length).toBeGreaterThan(0);
    expect(orphanTakes.every((tk) => tk.agent_id === null && tk.persona === null)).toBe(true);

    // EC-17: delete Delta's run (DELETE /runs/:id). It leaves the columns AND the conflicts.
    expect((await app.inject({ method: 'DELETE', url: `/runs/${deltaCol!.run_id}` })).statusCode).toBe(200);
    const afterRun = await snapshot(app, pr.id);
    expect(afterRun.agent_count).toBe(2);
    expect(afterRun.columns.map((c) => c.run_id)).not.toContain(deltaCol!.run_id);
    for (const c of afterRun.conflicts) expect(c.takes.map((tk) => tk.run_id)).not.toContain(deltaCol!.run_id);

    // EC-16: delete the rest → no children left → 404, even though the group row remains.
    for (const id of [alphaCol!.run_id, betaCol!.run_id]) {
      expect((await app.inject({ method: 'DELETE', url: `/runs/${id}` })).statusCode).toBe(200);
    }
    expect(await groupRows(pr.id)).toHaveLength(1);
    expect((await latest(app, pr.id)).statusCode).toBe(404);
  });

  // ---- reaper (EC-13) -------------------------------------------------------

  it('EC-13: the boot reaper turns a running column into `failed` and unblocks the PR', async () => {
    const llm = new ControlledLLM();
    llm.hold('m-alpha');
    llm.hold('m-beta');
    const app = await mkApp(llm);
    const { pr } = await mkPr();
    const alpha = await mkAgent(app, 'Alpha', 'm-alpha');
    const beta = await mkAgent(app, 'Beta', 'm-beta');
    const first = MultiAgentRun.parse((await startRun(app, pr.id, [alpha, beta])).json());
    expect(first.columns.map((c) => c.status)).toEqual(['running', 'running']);

    // "The API restarted": nothing but the reaper touches the rows.
    expect(await new ReviewRepository(db()).reapStaleRunningRuns()).toBeGreaterThanOrEqual(2);
    const afterReap = await snapshot(app, pr.id);
    expect(afterReap.columns.map((c) => c.status)).toEqual(['failed', 'failed']);
    expect((await startRun(app, pr.id, [alpha])).statusCode).toBe(200); // no longer 409

    // The orphaned in-process executors are still parked on their gates; let them finish
    // so no write lands after the container is gone.
    llm.releaseAll();
    await vi.waitFor(async () => {
      const rows = await runRows(pr.id);
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.status === 'done')).toBe(true);
    });
  });

  // ---- PR list cost (NFR-3) -------------------------------------------------

  it('NFR-3: the PR-list cost counts each child once — the sum of the child costs, not the group total on top', async () => {
    const app = await mkApp(new ControlledLLM());
    const { repo, pr } = await mkPr();
    const { snap } = await runToCompletion(app, pr.id, [
      ['Alpha', 'm-alpha'],
      ['Beta', 'm-beta'],
    ]);

    const list = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json() as {
      id: string;
      cost_usd: number | null;
    }[];
    const row = list.find((r) => r.id === pr.id)!;
    const childSum = (await runRows(pr.id)).reduce((s, r) => s + (r.costUsd ?? 0), 0);
    expect(childSum).toBeCloseTo(0.01);
    expect(row.cost_usd).toBeCloseTo(0.01); // not 0.02
    expect(row.cost_usd).toBeCloseTo(snap.total_cost_usd!);
  });

  // ---- estimates (AC-5, EC-6, NFR-1, NFR-2) ---------------------------------

  it('AC-5/EC-6/NFR-1/NFR-2: estimates are medians over each agent\'s last 5 done runs (any PR, CI included), one entry per workspace agent, with no model call', async () => {
    const llm = new ControlledLLM();
    const app = await mkApp(llm);
    const windowed = await mkAgent(app, 'Windowed', 'm-alpha');
    const even = await mkAgent(app, 'Even', 'm-alpha');
    const never = await mkAgent(app, 'Never', 'm-alpha');

    const base = Date.now() - 30 * 24 * 3600 * 1000;
    const at = (i: number) => new Date(base + i * 3600 * 1000);
    type Run = typeof t.agentRuns.$inferInsert;
    const run = (agentId: string, i: number, over: Partial<Run>): Run => ({
      workspaceId,
      agentId,
      prId: null, // "on any PR"
      ranAt: at(i),
      status: 'done',
      source: 'local',
      ...over,
    });
    await db()
      .insert(t.agentRuns)
      .values([
        // 7 done runs, oldest first. Only the newest five (i = 3..7) are in the window.
        run(windowed, 1, { durationMs: 900_000, costUsd: 9 }),
        run(windowed, 2, { durationMs: 900_000, costUsd: 9 }),
        run(windowed, 3, { durationMs: 30_000, costUsd: 0.01 }),
        run(windowed, 4, { durationMs: 40_000, costUsd: null }), // unknown cost: ignored, still counted
        run(windowed, 5, { durationMs: 50_000, costUsd: 0.03 }),
        run(windowed, 6, { durationMs: 60_000, costUsd: 0.05 }),
        run(windowed, 7, { durationMs: 70_000, costUsd: null, source: 'ci' }), // CI runs count
        // The newest run failed: it is not a `done` run and must not take a slot.
        run(windowed, 8, { durationMs: 1, costUsd: 123, status: 'failed' }),
        // Even count → mean of the two middle values.
        run(even, 1, { durationMs: 1_000, costUsd: 0.1 }),
        run(even, 2, { durationMs: 4_000, costUsd: 0.3 }),
      ]);

    // Another workspace's runs and agents never show up (NFR-2).
    const [other] = await db().insert(t.workspaces).values({ name: `other-${seq++}` }).returning();
    const [foreign] = await db()
      .insert(t.agents)
      .values({ workspaceId: other!.id, name: 'Foreign', provider: 'openai', model: 'x', systemPrompt: 'x' })
      .returning();
    await db().insert(t.agentRuns).values(run(foreign!.id, 1, { workspaceId: other!.id, durationMs: 5, costUsd: 5 }));

    const res = await app.inject({ method: 'GET', url: '/multi-agent/estimates' });
    expect(res.statusCode).toBe(200);
    const body = MultiAgentEstimates.parse(res.json());
    const byId = new Map(body.agents.map((a) => [a.agent_id, a]));

    // One entry per agent of the workspace.
    const agentList = (await app.inject({ method: 'GET', url: '/agents' })).json() as { id: string }[];
    expect(body.agents).toHaveLength(agentList.length);
    expect(new Set(byId.keys())).toEqual(new Set(agentList.map((a) => a.id)));
    expect(byId.has(foreign!.id)).toBe(false);

    // Window of 5: durations 30,40,50,60,70 s → median 50 s; known costs 0.01,0.03,0.05 → 0.03.
    expect(byId.get(windowed)).toMatchObject({ duration_ms: 50_000, runs_used: 5 });
    expect(byId.get(windowed)!.cost_usd).toBeCloseTo(0.03);
    // Even count.
    expect(byId.get(even)).toMatchObject({ duration_ms: 2_500, runs_used: 2 });
    expect(byId.get(even)!.cost_usd).toBeCloseTo(0.2);
    // EC-6: no done run → nulls and 0, never 0 ms / $0.
    expect(byId.get(never)).toEqual({ agent_id: never, duration_ms: null, cost_usd: null, runs_used: 0 });

    // NFR-1: not a single model call.
    expect(llm.started).toHaveLength(0);
    expect(llm.calls).toHaveLength(0);
  });
});
