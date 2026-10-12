import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { EvalCaseOutcome, EvalMetrics, EvalRunSnapshot } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { scoreCase, scoreRun } from '../src/modules/eval/scoring.js';

/**
 * SPEC-09 Phase C — the AGENT metric trend against a real Postgres (Docker; self-skips
 * without it). `GET /agents/:id/eval-overview` holds the newest 100 finished runs in
 * chronological order (AC-58), every point carries `cost_usd` with a missing price kept
 * null and never 0 (EC-27), a missing metric stays a gap, errored/running runs are not
 * finished runs, and skill runs on the same carrier never show up in an agent read
 * (NFR-5). `GET /eval-dashboard` keeps working with that much history and its run
 * records carry `cost_usd` for the dashboard detail page (AC-57).
 *
 * Runs are inserted straight into the table: nothing here executes a run, so the LLM
 * mock is never called. Skill trend/cap coverage is in `skill-eval-runs.it.test.ts`.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[eval-trend] Docker not available — skipping integration tests.');

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const SNAPSHOT: EvalRunSnapshot = {
  provider: 'openai',
  model: 'gpt-4.1',
  strategy: 'single-pass',
  system_prompt: 'You are a test reviewer.',
  skills: [],
};

const metricsWith = (recall: number | null): EvalMetrics => ({
  ...scoreRun([]),
  recall: { value: recall, num: recall === null ? 0 : 1, den: recall === null ? 0 : 1 },
});

const T0 = Date.UTC(2090, 0, 1);
const MINUTE = 60_000;
const FINISHED_COUNT = 105;
const GAP_INDEX = 50; // a finished run whose recall could not be computed

/** Cost of the i-th finished run: a real value, or null (price unknown) every 7th run. */
const costOf = (i: number): number | null => (i % 7 === 0 ? null : 0.001 * (i + 1));
const recallOf = (i: number): number | null => (i === GAP_INDEX ? null : i / 200);

d('SPEC-09 agent metric trend (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const db = () => pg.handle.db;
  const makeApp = () =>
    buildApp({
      config: config(),
      db: db(),
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), llm: { openai: new MockLLMProvider('openai') } },
    });
  type App = Awaited<ReturnType<typeof makeApp>>;

  async function makeAgent(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Trend Agent ${++seq}-${randomUUID().slice(0, 6)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a test reviewer.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  function agentRun(
    agentId: string,
    o: { status?: 'running' | 'completed' | 'partial' | 'errored'; at: number; recall?: number | null; cost?: number | null; version?: number },
  ): typeof t.evalRuns.$inferInsert {
    const status = o.status ?? 'completed';
    const finished = status === 'completed' || status === 'partial';
    const metrics = finished ? metricsWith(o.recall ?? null) : null;
    const ranAt = new Date(o.at);
    return {
      workspaceId,
      ownerKind: 'agent',
      agentId,
      agentVersion: o.version ?? 1,
      status,
      snapshot: SNAPSHOT,
      caseSet: [],
      caseResults: [],
      metricParts: metrics,
      tracesPassed: metrics?.traces_passed ?? null,
      tracesTotal: metrics?.traces_total ?? null,
      casesErrored: 0,
      recall: metrics?.recall.value ?? null,
      precision: metrics?.precision.value ?? null,
      citationAccuracy: metrics?.citation_accuracy.value ?? null,
      ranAt,
      finishedAt: status === 'running' ? null : ranAt,
      durationMs: status === 'running' ? null : 1000,
      costUsd: o.cost === undefined ? 0.01 : o.cost,
      errorReason: status === 'errored' ? 'boom' : null,
    };
  }

  function skillRun(skillId: string, carrierId: string, at: number): typeof t.evalRuns.$inferInsert {
    const metrics = metricsWith(0.99);
    return {
      workspaceId,
      ownerKind: 'skill',
      skillId,
      skillVersion: 1,
      carrierAgentId: carrierId,
      carrierName: 'Carrier',
      carrierVersion: 1,
      carrierModel: 'gpt-4.1',
      status: 'completed',
      snapshot: SNAPSHOT,
      skillSnapshot: {
        carrier: { agent_id: carrierId, name: 'Carrier', version: 1, provider: 'openai', model: 'gpt-4.1', strategy: 'single-pass', system_prompt: 'x' },
        skill: { name: 'seeded-skill', body: 'body', version: 1 },
        with_skills: [],
        without_skills: [],
      },
      caseSet: [],
      caseResults: [],
      withoutResults: [],
      metricParts: metrics,
      withoutMetrics: metricsWith(0.1),
      lift: { recall: 0.89, precision: null, citation_accuracy: null },
      recall: 0.99,
      precision: metrics.precision.value,
      citationAccuracy: metrics.citation_accuracy.value,
      casesErrored: 0,
      ranAt: new Date(at),
      finishedAt: new Date(at),
      durationMs: 1000,
      costUsd: 0.5,
    };
  }

  /**
   * 105 finished agent runs (a gap and a null price among them), then — all NEWER than
   * every finished run, so they would head the window if a read let them in — an errored
   * run, a running run and 3 finished skill runs on the same carrier agent.
   */
  async function seedHistory(agentId: string) {
    const finishedRows = Array.from({ length: FINISHED_COUNT }, (_, i) =>
      agentRun(agentId, {
        at: T0 + i * MINUTE,
        status: i % 2 === 0 ? 'completed' : 'partial',
        recall: recallOf(i),
        cost: costOf(i),
        version: 1 + Math.floor(i / 10),
      }),
    );
    const finished = (await db().insert(t.evalRuns).values(finishedRows).returning()).sort(
      (a, b) => a.ranAt.getTime() - b.ranAt.getTime(),
    );
    const [errored, running] = await db()
      .insert(t.evalRuns)
      .values([
        agentRun(agentId, { status: 'errored', at: T0 + 200 * MINUTE }),
        agentRun(agentId, { status: 'running', at: T0 + 201 * MINUTE }),
      ])
      .returning();
    const skillId = randomUUID();
    const skillRuns = await db()
      .insert(t.evalRuns)
      .values([210, 211, 212].map((m) => skillRun(skillId, agentId, T0 + m * MINUTE)))
      .returning();
    return { finished, errored: errored!, running: running!, skillRuns };
  }

  type TrendPoint = {
    run_id: string;
    ran_at: string;
    agent_version: number;
    recall: number | null;
    cost_usd: number | null;
  };

  it('AC-58/EC-27/NFR-5: the agent trend is the newest 100 finished runs, chronological, each with cost_usd (null stays null), gaps kept, errored/running/skill runs excluded', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app);
    const { finished, errored, running, skillRuns } = await seedHistory(agent.id);

    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-overview` });
    expect(res.statusCode).toBe(200);
    const o = res.json();
    const trend = o.trend as TrendPoint[];

    // AC-58: exactly 100, the 100 most recent, oldest first.
    expect(trend).toHaveLength(100);
    expect(trend.map((p) => p.run_id)).toEqual(finished.slice(FINISHED_COUNT - 100).map((r) => r.id));
    const times = trend.map((p) => Date.parse(p.ran_at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    // The window drops the 5 oldest — and says so honestly: all 105 are counted.
    expect(o.finished_runs).toBe(FINISHED_COUNT);
    expect(o.latest.id).toBe(finished[FINISHED_COUNT - 1]!.id);
    expect(o.previous.id).toBe(finished[FINISHED_COUNT - 2]!.id);

    // EC-27: a real cost is carried as a number; a missing price is null, never 0.
    for (const [k, p] of trend.entries()) {
      const i = FINISHED_COUNT - 100 + k; // index into the seeded finished runs
      const expected = costOf(i);
      if (expected === null) expect(p.cost_usd, `run ${i}`).toBeNull();
      else expect(p.cost_usd, `run ${i}`).toBeCloseTo(expected, 10);
    }
    expect(trend.some((p) => p.cost_usd === null)).toBe(true);
    expect(trend.some((p) => typeof p.cost_usd === 'number' && p.cost_usd > 0)).toBe(true);

    // EC-36: a finished run with no recall is a gap, not 0 — and keeps its place in the line.
    const gap = trend.find((p) => p.run_id === finished[GAP_INDEX]!.id)!;
    expect(gap.recall).toBeNull();
    expect(trend[GAP_INDEX - (FINISHED_COUNT - 100)]!.run_id).toBe(gap.run_id);
    expect(trend.filter((p) => p.recall === null)).toHaveLength(1);

    // Only finished runs are on the trend; the newer errored/running runs are not.
    const ids = new Set(trend.map((p) => p.run_id));
    expect(ids.has(errored.id)).toBe(false);
    expect(ids.has(running.id)).toBe(false);
    expect(o.running_run_id).toBe(running.id); // …but the overview still reports it as running

    // NFR-5: skill runs on the same carrier never reach an agent read.
    for (const s of skillRuns) expect(ids.has(s.id)).toBe(false);
    const listed = new Set((o.runs as { id: string }[]).map((r) => r.id));
    for (const s of skillRuns) expect(listed.has(s.id)).toBe(false);
    expect(trend.every((p) => p.recall !== 0.99)).toBe(true);
    await app.close();
  });

  it('AC-57/AC-58/NFR-5: /eval-dashboard still answers with 105 runs behind an agent — 10-point sparkline, run records with cost_usd, no skill runs — and agrees with the detail page overview', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app);
    const { finished, skillRuns } = await seedHistory(agent.id);

    const res = await app.inject({ method: 'GET', url: '/eval-dashboard' });
    expect(res.statusCode).toBe(200);
    const dash = res.json();
    const summary = dash.agents.find((a: { agent_id: string }) => a.agent_id === agent.id);
    expect(summary).toBeDefined();

    // Sparkline stays 10 points of recall, oldest first, gap kept.
    expect(summary.sparkline).toEqual(
      finished.slice(FINISHED_COUNT - 10).map((_, k) => recallOf(FINISHED_COUNT - 10 + k)),
    );
    expect(summary.latest.id).toBe(finished[FINISHED_COUNT - 1]!.id);

    // Every run record the dashboard shows carries cost_usd; a missing price is null, not 0.
    expect(summary.latest.cost_usd).toBeCloseTo(costOf(FINISHED_COUNT - 1)!, 10);
    const recent = dash.recent_runs as { id: string; owner_kind?: string; cost_usd: number | null }[];
    expect(recent.length).toBeLessThanOrEqual(20);
    for (const r of recent) expect(r).toHaveProperty('cost_usd');
    const skillIds = new Set(skillRuns.map((s) => s.id));
    expect(recent.some((r) => skillIds.has(r.id))).toBe(false);
    const nullCost = recent.filter((r) => r.cost_usd === null);
    expect(nullCost.length).toBeGreaterThan(0); // finished runs with an unknown price (every 7th)
    expect(recent.every((r) => r.cost_usd !== 0)).toBe(true);

    // The dashboard detail page reads the overview: its newest trend point is the dashboard's latest run.
    const overview = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-overview` })).json();
    const last = (overview.trend as TrendPoint[]).at(-1)!;
    expect(last.run_id).toBe(summary.latest.id);
    expect(last.cost_usd).toBe(summary.latest.cost_usd);
    await app.close();
  });

  it('NFR-13/AC-58: GET /agents/:id/eval-overview answers within 500 ms with 105 finished runs (50 case outcomes each) and 50 cases, still returning 100 trend points', async () => {
    const agent = await makeAgent(await makeApp());
    const cases = await db()
      .insert(t.evalCases)
      .values(
        Array.from({ length: 50 }, (_, i) => ({
          workspaceId,
          ownerKind: 'agent' as const,
          ownerId: agent.id,
          name: `perf-case-${i}`,
          inputDiff: 'diff --git a/src/config.ts b/src/config.ts\n' + 'x'.repeat(2000),
          inputFiles: ['src/config.ts'],
          inputMeta: { pr_number: null, repo_full_name: null, title: 'T', body: null },
          expectedOutput: { type: 'must_find' as const, file: 'src/config.ts', start_line: 10, end_line: 12 },
        })),
      )
      .returning({ id: t.evalCases.id, name: t.evalCases.name });

    // Heavy jsonb per run: the overview must read scalar columns only (NFR-13).
    const outcomes: EvalCaseOutcome[] = cases.map((c) =>
      scoreCase({
        caseId: c.id,
        name: c.name,
        expectation: { type: 'must_find', file: 'src/config.ts', start_line: 10, end_line: 12 },
        findings: [{ file: 'src/config.ts', start_line: 11, end_line: 11, title: 't'.repeat(200), severity: 'INFO', category: 'bug' }],
        groundingKept: 1,
        groundingTotal: 1,
        durationMs: 5,
        costUsd: 0.001,
      }),
    );
    const rows = Array.from({ length: FINISHED_COUNT }, (_, i) => ({
      ...agentRun(agent.id, { at: T0 + i * MINUTE, recall: 1, cost: 0.05 }),
      caseSet: cases.map((c) => ({ id: c.id, name: c.name })),
      caseResults: outcomes,
    }));
    for (let i = 0; i < rows.length; i += 25) await db().insert(t.evalRuns).values(rows.slice(i, i + 25));

    const app = await makeApp();
    await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-overview` }); // warm-up: pool / planner cold start

    const start = performance.now();
    const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-overview` });
    const ms = performance.now() - start;
    expect(res.statusCode).toBe(200);
    expect(ms).toBeLessThan(500);
    const o = res.json();
    expect(o).toMatchObject({ cases_total: 50, finished_runs: FINISHED_COUNT });
    expect(o.trend).toHaveLength(100);
    expect(o.runs).toHaveLength(50);
    await app.close();
  }, 180_000);
});
