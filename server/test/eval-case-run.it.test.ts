import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Review, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * SPEC-10 Phase B against a real Postgres: `POST /eval-cases/:id/run` and everything a single-case
 * run must leave alone or change - NFR-18's snapshot test (set-only readers identical before and
 * after a case run, only that case's `latest_result` moved), the any-scope 409 guard, the errored /
 * reaped case run as the case's latest result, compare / run-detail / workspace behaviour, call
 * counts, the review tables and the owner-delete cascade. Self-skips without Docker.
 *
 * The LLM is a mock (a gated, countable subclass): a run executes in a detached promise after the
 * route answers 202, so tests poll `GET /eval-runs/:id` and hold a run open with `gate`. Fixtures
 * carry placeholder secrets only (NFR-14). Hermetic counterpart: `src/modules/eval/case-run.test.ts`.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[eval-case-run] Docker not available — skipping integration tests.');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUT_BODY = 'SUT-BODY: never ship secrets.';

const CONFIG_PATCH = [
  '@@ -10,3 +10,4 @@',
  '   port: 3000,',
  '+  stripeKey: "sk_live_xxx",',
  '   redisUrl: x,',
].join('\n');
const DIFF = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  CONFIG_PATCH,
].join('\n');

const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe key.',
  score: 40,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A key is committed.',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};
const NO_FINDINGS: Review = { verdict: 'approve', summary: 'ok', score: 95, findings: [] };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `mode`: `skill` (default) finds the bug only when the skill under test is in the prompt - an agent
 * with no skills therefore finds nothing; `finds` / `quiet` force the fixture. Can be held open
 * (`gate`), fail per call, and report no cost.
 */
class RunLLM extends MockLLMProvider {
  /** Calls that reached the provider, counted on entry (before the gate). */
  entered = 0;
  gate: Promise<void> | undefined;
  failOn: (callNo: number) => boolean = () => false;
  mode: 'skill' | 'finds' | 'quiet' = 'skill';
  noCost = false;

  constructor() {
    super('openai');
  }

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const callNo = ++this.entered;
    const r = req as unknown as StructuredRequest<unknown>;
    const prompt = r.messages.map((m) => m.content as string).join('\n');
    if (this.gate) await this.gate;
    if (this.failOn(callNo)) throw new Error(`provider boom ${callNo}`);
    const finds = this.mode === 'finds' || (this.mode === 'skill' && prompt.includes(SUT_BODY));
    const res = await new MockLLMProvider('openai', { structured: finds ? REVIEW : NO_FINDINGS }).completeStructured<T>(req);
    return this.noCost ? { ...res, costUsd: null } : res;
  }
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const BASE_SNAPSHOT = {
  provider: 'openai' as const,
  model: 'gpt-4.1',
  strategy: 'single-pass' as const,
  system_prompt: 'You are a test reviewer.',
  skills: [] as { name: string; body: string }[],
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

d('SPEC-10 single-case runs (Testcontainers pg)', () => {
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
  type App = Awaited<ReturnType<typeof makeApp>>;
  function makeApp(llm: MockLLMProvider = new RunLLM()) {
    return buildApp({
      config: config(),
      db: db(),
      overrides: { git: new MockGitClient({ diff: DIFF }), github: new MockGitHubClient(), llm: { openai: llm } },
    });
  }

  // ---- seeding helpers -------------------------------------------------------

  async function makeAgent(app: App, over: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Case Agent ${++seq}-${randomUUID().slice(0, 6)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a test reviewer.',
        ...over,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string; version: number };
  }

  async function makeSkill(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: `cr-skill-${++seq}-${randomUUID().slice(0, 6)}`,
        description: 'A test skill',
        type: 'convention',
        body: SUT_BODY,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string; version: number };
  }

  async function link(agentId: string, skillId: string, order: number, enabled = true) {
    await db().insert(t.agentSkills).values({ agentId, skillId, order, enabled });
  }

  const caseBody = (name: string, type: 'must_find' | 'must_not_flag' = 'must_find') => ({
    name,
    input_diff: DIFF,
    input_meta: { title: 'Add rate limiting', body: null },
    expectation: { type, file: 'src/config.ts', start_line: 10, end_line: 12 },
  });

  async function makeCase(app: App, owner: 'skill' | 'agent', ownerId: string, name: string, type: 'must_find' | 'must_not_flag' = 'must_find') {
    const res = await app.inject({ method: 'POST', url: `/${owner}s/${ownerId}/eval-cases`, payload: caseBody(name, type) });
    expect(res.statusCode).toBe(201);
    await sleep(3); // distinct created_at -> deterministic order
    return res.json() as { id: string; name: string };
  }

  /** An agent with three cases: two `must_find` (a, b) and one `must_not_flag` (c). */
  async function agentWorld(app: App) {
    const agent = await makeAgent(app);
    const a = await makeCase(app, 'agent', agent.id, 'case-a');
    const b = await makeCase(app, 'agent', agent.id, 'case-b');
    const c = await makeCase(app, 'agent', agent.id, 'case-c', 'must_not_flag');
    return { agent, a, b, c };
  }

  /** A skill with a linked carrier and two cases (find: must_find, quiet: must_not_flag). */
  async function skillWorld(app: App) {
    const skill = await makeSkill(app);
    const carrier = await makeAgent(app);
    await link(carrier.id, skill.id, 0);
    const find = await makeCase(app, 'skill', skill.id, 'find-it');
    const quiet = await makeCase(app, 'skill', skill.id, 'stay-quiet', 'must_not_flag');
    return { skill, carrier, find, quiet };
  }

  const startSetRun = (app: App, agentId: string) => app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
  const startSkillSetRun = (app: App, skillId: string, carrierId: string) =>
    app.inject({ method: 'POST', url: `/skills/${skillId}/eval-runs`, payload: { carrier_agent_id: carrierId } });
  const startCaseRun = (app: App, caseId: string, carrierId?: string) =>
    app.inject({
      method: 'POST',
      url: `/eval-cases/${caseId}/run`,
      ...(carrierId ? { payload: { carrier_agent_id: carrierId } } : {}),
    });

  async function waitForRun(app: App, runId: string, timeoutMs = 15_000) {
    const start = Date.now();
    for (;;) {
      const res = await app.inject({ method: 'GET', url: `/eval-runs/${runId}` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      if (body.status !== 'running') return body;
      if (Date.now() - start > timeoutMs) throw new Error(`run ${runId} still running after ${timeoutMs}ms`);
      await sleep(25);
    }
  }

  const finishRun = async (app: App, res: Awaited<ReturnType<typeof startSetRun>>) => {
    expect(res.statusCode).toBe(202);
    return waitForRun(app, res.json().id);
  };

  const json = async (app: App, url: string) => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode, url).toBe(200);
    return res.json();
  };

  async function tableCounts() {
    const n = async (table: PgTable) => (await db().select({ n: count() }).from(table))[0]!.n;
    return {
      reviews: await n(t.reviews),
      findings: await n(t.findings),
      agentRuns: await n(t.agentRuns),
      agentRunSkills: await n(t.agentRunSkills),
      runTraces: await n(t.runTraces),
      pulls: (await db().select({ id: t.pullRequests.id, sha: t.pullRequests.lastReviewedSha }).from(t.pullRequests)).sort(
        (a, b) => a.id.localeCompare(b.id),
      ),
    };
  }

  /** Every set-only reader of NFR-5 - through the routes AND straight through the repository. */
  async function agentSetSnapshot(app: App, agentId: string) {
    const repo = app.container.evalRepo;
    return {
      overview: await json(app, `/agents/${agentId}/eval-overview`),
      dashboard: await json(app, '/eval-dashboard'),
      latestRow: await repo.latestFinishedRunRow(workspaceId, agentId),
      finishedSummaries: await repo.listRunSummaries(workspaceId, agentId, { finishedOnly: true, limit: 100 }),
      allSummaries: await repo.listRunSummaries(workspaceId, agentId, { finishedOnly: false, limit: 50 }),
      finishedCount: await repo.countFinishedRuns(workspaceId, agentId),
      recent: await repo.recentRunSummaries(workspaceId, 50),
      runningRunId: await repo.runningRunId(workspaceId, agentId),
    };
  }

  async function skillSetSnapshot(app: App, skillId: string) {
    const repo = app.container.evalRepo;
    return {
      overview: await json(app, `/skills/${skillId}/eval-overview`),
      dashboard: await json(app, '/eval-dashboard'),
      summaries: await repo.listSkillRunSummaries(workspaceId, skillId, 100),
      trend: await repo.listSkillTrendRows(workspaceId, skillId, 100),
      latestResults: await repo.latestFinishedSkillResults(workspaceId, skillId),
      runningRunId: await repo.runningSkillRunId(workspaceId, skillId),
    };
  }

  const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));

  // =========================================================================
  // NFR-18 - a case run leaves every set-only reader alone
  // =========================================================================

  describe('NFR-18 / AC-47 / AC-46: snapshot before and after a case run', () => {
    it('agent: two set runs, then a finished case run - every set-only snapshot is identical and only that case\'s latest_result changed', async () => {
      const llm = new RunLLM();
      llm.mode = 'quiet'; // the set runs: both must_find cases fail, the must_not_flag case passes
      const app = await makeApp(llm);
      const { agent, a, b, c } = await agentWorld(app);

      const setRun1 = await finishRun(app, await startSetRun(app, agent.id));
      await sleep(5);
      const setRun2 = await finishRun(app, await startSetRun(app, agent.id));
      expect(setRun2).toMatchObject({ scope: 'set', status: 'completed' });

      const setBefore = await agentSetSnapshot(app, agent.id);
      const casesBefore = byId(await json(app, `/agents/${agent.id}/eval-cases`));
      // sanity: the snapshot is not vacuous
      expect(setBefore.overview).toMatchObject({ finished_runs: 2, running_run_id: null, running_case_run: null });
      expect(setBefore.overview.latest.id).toBe(setRun2.id);
      expect(setBefore.overview.previous.id).toBe(setRun1.id);
      expect(setBefore.overview.trend).toHaveLength(2);
      expect(casesBefore.get(a.id)!.latest_result).toMatchObject({ run_id: setRun2.id, state: 'failed' });

      // the case run: case a now finds the bug
      llm.mode = 'finds';
      await sleep(5);
      const caseRun = await finishRun(app, await startCaseRun(app, a.id));
      expect(caseRun).toMatchObject({ scope: 'case', status: 'completed' });

      // every set-only snapshot is byte-identical
      expect(await agentSetSnapshot(app, agent.id)).toEqual(setBefore);

      // per-case: only case a moved, to the case run's result; b and c still show the set run's
      const casesAfter = byId(await json(app, `/agents/${agent.id}/eval-cases`));
      expect(casesAfter.get(a.id)!.latest_result).toMatchObject({ run_id: caseRun.id, state: 'passed', expected_count: 1, got_count: 1 });
      expect(casesAfter.get(a.id)!.latest_result.findings).toHaveLength(1);
      expect(casesAfter.get(b.id)).toEqual(casesBefore.get(b.id));
      expect(casesAfter.get(c.id)).toEqual(casesBefore.get(c.id));
      // the detail route reads through the same merge
      const detail = await json(app, `/eval-cases/${a.id}`);
      expect(detail.latest_result).toMatchObject({ run_id: caseRun.id, state: 'passed' });
      expect((await json(app, `/eval-cases/${b.id}`)).latest_result).toMatchObject({ run_id: setRun2.id });
      await app.close();
    });

    it('skill: a finished case run leaves the skill\'s set-only snapshot and the other case untouched; the run case moves to the with-arm result and its effect', async () => {
      const llm = new RunLLM();
      const app = await makeApp(llm);
      const { skill, carrier, find, quiet } = await skillWorld(app);

      await finishRun(app, await startSkillSetRun(app, skill.id, carrier.id));
      await sleep(5);
      const setRun2 = await finishRun(app, await startSkillSetRun(app, skill.id, carrier.id));
      expect(setRun2).toMatchObject({ owner_kind: 'skill', scope: 'set', status: 'completed' });

      const setBefore = await skillSetSnapshot(app, skill.id);
      const casesBefore = byId(await json(app, `/skills/${skill.id}/eval-cases`));
      expect(setBefore.overview).toMatchObject({ running_run_id: null, running_case_run: null });
      expect(setBefore.overview.trend).toHaveLength(2);

      await sleep(5);
      const caseRun = await finishRun(app, await startCaseRun(app, find.id, carrier.id));
      expect(caseRun).toMatchObject({ owner_kind: 'skill', scope: 'case', status: 'completed' });

      expect(await skillSetSnapshot(app, skill.id)).toEqual(setBefore);

      const casesAfter = byId(await json(app, `/skills/${skill.id}/eval-cases`));
      expect(casesAfter.get(find.id)!.latest_result).toMatchObject({ run_id: caseRun.id, with_state: 'passed', without_state: 'failed', effect: 'helped' });
      expect(casesAfter.get(quiet.id)).toEqual(casesBefore.get(quiet.id));
      const detail = await json(app, `/eval-cases/${find.id}`);
      expect(detail.latest_result).toMatchObject({ run_id: caseRun.id, state: 'passed', effect: 'helped' });
      expect(detail.latest_result.findings).toHaveLength(1);
      await app.close();
    });

    it('AC-46: the later-started run wins either way - a newer set run overrides an older case run, and a newer case run overrides an older set run', async () => {
      const llm = new RunLLM();
      const app = await makeApp(llm);
      const { agent, a } = await agentWorld(app);

      llm.mode = 'finds';
      const caseRun = await finishRun(app, await startCaseRun(app, a.id));
      expect((await json(app, `/eval-cases/${a.id}`)).latest_result).toMatchObject({ run_id: caseRun.id, state: 'passed' });

      await sleep(5);
      llm.mode = 'quiet';
      const setRun = await finishRun(app, await startSetRun(app, agent.id));
      expect((await json(app, `/eval-cases/${a.id}`)).latest_result).toMatchObject({ run_id: setRun.id, state: 'failed' });

      await sleep(5);
      llm.mode = 'finds';
      const caseRun2 = await finishRun(app, await startCaseRun(app, a.id));
      expect((await json(app, `/eval-cases/${a.id}`)).latest_result).toMatchObject({ run_id: caseRun2.id, state: 'passed' });
      await app.close();
    });

    it('EC-14: case runs and no finished set run - the overview has no latest, trend or finished runs, the case row still shows its stored result', async () => {
      const llm = new RunLLM();
      llm.mode = 'finds';
      const app = await makeApp(llm);
      const { agent, a } = await agentWorld(app);
      const caseRun = await finishRun(app, await startCaseRun(app, a.id));

      const overview = await json(app, `/agents/${agent.id}/eval-overview`);
      expect(overview).toMatchObject({ latest: null, previous: null, trend: [], runs: [], finished_runs: 0, running_run_id: null, running_case_run: null });
      const row = byId(await json(app, `/agents/${agent.id}/eval-cases`)).get(a.id)!;
      expect(row.latest_result).toMatchObject({ run_id: caseRun.id, state: 'passed' });
      await app.close();
    });
  });

  // =========================================================================
  // 409 guard (any scope) and running_case_run
  // =========================================================================

  describe('AC-48 / AC-49 / EC-18: single flight across scopes', () => {
    it('agent: while a case run runs, running_case_run is set and running_run_id is null; a set run and a second case run are 409 with details.run_id; then the guard opens', async () => {
      const llm = new RunLLM();
      const gate = deferred();
      llm.gate = gate.promise;
      const app = await makeApp(llm);
      const { agent, a, b } = await agentWorld(app);

      const start = await startCaseRun(app, a.id);
      expect(start.statusCode).toBe(202); // AC-35: answered before the review ends
      expect(start.json()).toMatchObject({ status: 'running' });
      const runId = start.json().id as string;

      const overview = await json(app, `/agents/${agent.id}/eval-overview`);
      expect(overview.running_run_id).toBeNull();
      expect(overview.running_case_run).toEqual({ run_id: runId, case_id: a.id });
      expect(await app.container.evalRepo.runningRunId(workspaceId, agent.id)).toBeNull();

      // AC-41: a running case run shows its progress through the run detail
      expect(await json(app, `/eval-runs/${runId}`)).toMatchObject({ scope: 'case', status: 'running', cases_total: 1, cases_done: 0 });

      // case vs set, case vs case (a different case of the same owner too)
      const set = await startSetRun(app, agent.id);
      expect(set.statusCode).toBe(409);
      expect(set.json().error).toMatchObject({ code: 'eval_run_in_progress', details: { run_id: runId } });
      for (const caseId of [a.id, b.id]) {
        const again = await startCaseRun(app, caseId);
        expect(again.statusCode).toBe(409);
        expect(again.json().error).toMatchObject({ code: 'eval_run_in_progress', details: { run_id: runId } });
      }
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(1);

      gate.resolve();
      expect((await waitForRun(app, runId)).status).toBe('completed');
      llm.gate = undefined;

      // set vs case: a running SET run reports running_run_id (and no running_case_run) and blocks a case run
      const gate2 = deferred();
      llm.gate = gate2.promise;
      const setStart = await startSetRun(app, agent.id);
      expect(setStart.statusCode).toBe(202);
      const setRunId = setStart.json().id as string;
      const ov2 = await json(app, `/agents/${agent.id}/eval-overview`);
      expect(ov2.running_run_id).toBe(setRunId);
      expect(ov2.running_case_run).toBeNull();
      const blocked = await startCaseRun(app, a.id);
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error).toMatchObject({ code: 'eval_run_in_progress', details: { run_id: setRunId } });
      gate2.resolve();
      await waitForRun(app, setRunId);

      // once nothing runs, a case run starts again
      llm.gate = undefined;
      expect((await finishRun(app, await startCaseRun(app, b.id))).status).toBe('completed');
      await app.close();
    });

    it('skill: the same guard in both directions, with running_case_run on the skill overview and null running_run_id', async () => {
      const llm = new RunLLM();
      const gate = deferred();
      llm.gate = gate.promise;
      const app = await makeApp(llm);
      const { skill, carrier, find, quiet } = await skillWorld(app);

      const start = await startCaseRun(app, find.id, carrier.id);
      expect(start.statusCode).toBe(202);
      const runId = start.json().id as string;

      const overview = await json(app, `/skills/${skill.id}/eval-overview`);
      expect(overview.running_run_id).toBeNull();
      expect(overview.running_case_run).toEqual({ run_id: runId, case_id: find.id });
      expect(await app.container.evalRepo.runningSkillRunId(workspaceId, skill.id)).toBeNull();

      const set = await startSkillSetRun(app, skill.id, carrier.id);
      expect(set.statusCode).toBe(409);
      expect(set.json().error).toMatchObject({ code: 'eval_run_in_progress', details: { run_id: runId } });
      const other = await startCaseRun(app, quiet.id, carrier.id);
      expect(other.statusCode).toBe(409);
      expect(other.json().error.details.run_id).toBe(runId);

      // the carrier's OWN agent runs are a different owner: not blocked (SPEC-09 EC-15)
      await makeCase(app, 'agent', carrier.id, 'carrier-own');
      expect((await startSetRun(app, carrier.id)).statusCode).toBe(202);

      gate.resolve();
      await waitForRun(app, runId);
      llm.gate = undefined;

      const gate2 = deferred();
      llm.gate = gate2.promise;
      const setStart = await startSkillSetRun(app, skill.id, carrier.id);
      expect(setStart.statusCode).toBe(202);
      const ov2 = await json(app, `/skills/${skill.id}/eval-overview`);
      expect(ov2).toMatchObject({ running_run_id: setStart.json().id, running_case_run: null });
      const blocked = await startCaseRun(app, find.id, carrier.id);
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error.details.run_id).toBe(setStart.json().id);
      gate2.resolve();
      await waitForRun(app, setStart.json().id);
      llm.gate = undefined;
      // let the carrier's own agent run finish before the app closes
      await sleep(200);
      await app.close();
    });
  });

  // =========================================================================
  // errored / reaped case runs are the case's latest result
  // =========================================================================

  describe('AC-46 / EC-21 / EC-22: an errored or reaped case run is still the latest result', () => {
    it('agent: a failing case run is errored with the reason, is the case\'s latest result after a reload, and siblings keep their set-run result; metrics are untouched', async () => {
      const llm = new RunLLM();
      llm.mode = 'quiet';
      const app = await makeApp(llm);
      const { agent, a, b } = await agentWorld(app);
      const setRun = await finishRun(app, await startSetRun(app, agent.id));
      const overviewBefore = await json(app, `/agents/${agent.id}/eval-overview`);

      llm.entered = 0;
      llm.failOn = () => true;
      await sleep(5);
      const caseRun = await finishRun(app, await startCaseRun(app, a.id));
      expect(caseRun).toMatchObject({ scope: 'case', status: 'errored', error_reason: 'provider boom 1', cost_usd: null });
      await app.close();

      const reloaded = await makeApp(new RunLLM()); // a fresh process: the state is what the DB holds
      const items = byId(await json(reloaded, `/agents/${agent.id}/eval-cases`));
      expect(items.get(a.id)!.latest_result).toMatchObject({
        run_id: caseRun.id,
        state: 'errored',
        error_reason: 'provider boom 1',
        expected_count: null,
        got_count: null,
      });
      expect(items.get(b.id)!.latest_result).toMatchObject({ run_id: setRun.id, state: 'failed' });
      expect((await json(reloaded, `/eval-cases/${a.id}`)).latest_result).toMatchObject({ state: 'errored', error_reason: 'provider boom 1' });
      // an errored case run counts in no metric and is not a finished run
      expect(await json(reloaded, `/agents/${agent.id}/eval-overview`)).toEqual(overviewBefore);
      await reloaded.close();
    });

    it('skill: an errored case run (one arm failing) is errored - never partial - and the case row shows both arms errored', async () => {
      const llm = new RunLLM();
      const app = await makeApp(llm);
      const { skill, carrier, find, quiet } = await skillWorld(app);
      await finishRun(app, await startSkillSetRun(app, skill.id, carrier.id));
      await sleep(5);

      llm.entered = 0;
      llm.failOn = (n) => n === 2; // the without arm
      const caseRun = await finishRun(app, await startCaseRun(app, find.id, carrier.id));
      expect(caseRun).toMatchObject({ scope: 'case', status: 'errored', error_reason: 'provider boom 2' });

      const items = byId(await json(app, `/skills/${skill.id}/eval-cases`));
      expect(items.get(find.id)!.latest_result).toMatchObject({ run_id: caseRun.id, with_state: 'errored', without_state: 'errored', effect: 'errored', error_reason: 'provider boom 2' });
      expect(items.get(quiet.id)!.latest_result).not.toMatchObject({ run_id: caseRun.id });
      await app.close();
    });

    it('EC-22: a case run left running by a dead process is errored "interrupted" on the next boot and stays the case\'s latest result (agent and skill)', async () => {
      const setup = await makeApp();
      const { agent, a, b } = await agentWorld(setup);
      const world = await skillWorld(setup);
      const setRun = await finishRun(setup, await startSetRun(setup, agent.id));
      await sleep(5);

      const [agentCaseRun] = await db()
        .insert(t.evalRuns)
        .values({
          workspaceId,
          agentId: agent.id,
          agentVersion: 1,
          status: 'running',
          scope: 'case',
          snapshot: BASE_SNAPSHOT,
          caseSet: [{ id: a.id, name: a.name }],
          caseResults: [],
        })
        .returning();
      const [skillCaseRun] = await db()
        .insert(t.evalRuns)
        .values({
          workspaceId,
          ownerKind: 'skill',
          skillId: world.skill.id,
          skillVersion: 1,
          carrierAgentId: world.carrier.id,
          carrierName: world.carrier.name,
          carrierVersion: 1,
          carrierModel: 'gpt-4.1',
          status: 'running',
          scope: 'case',
          snapshot: BASE_SNAPSHOT,
          skillSnapshot: {
            carrier: { agent_id: world.carrier.id, name: world.carrier.name, version: 1, provider: 'openai', model: 'gpt-4.1', strategy: 'single-pass', system_prompt: 'p' },
            skill: { name: world.skill.name, body: SUT_BODY, version: 1 },
            with_skills: [{ name: world.skill.name, body: SUT_BODY }],
            without_skills: [],
          },
          caseSet: [{ id: world.find.id, name: world.find.name }],
          caseResults: [],
          withoutResults: [],
        })
        .returning();
      // while they run, both owners report them
      expect((await json(setup, `/agents/${agent.id}/eval-overview`)).running_case_run).toEqual({ run_id: agentCaseRun!.id, case_id: a.id });
      await setup.close();

      const app = await makeApp(); // buildApp reaps on boot
      for (const id of [agentCaseRun!.id, skillCaseRun!.id]) {
        const reaped = await json(app, `/eval-runs/${id}`);
        expect(reaped).toMatchObject({ scope: 'case', status: 'errored', error_reason: 'interrupted' });
        expect(reaped.finished_at).not.toBeNull();
      }
      expect((await json(app, `/agents/${agent.id}/eval-overview`)).running_case_run).toBeNull();
      expect((await json(app, `/skills/${world.skill.id}/eval-overview`)).running_case_run).toBeNull();

      const items = byId(await json(app, `/agents/${agent.id}/eval-cases`));
      expect(items.get(a.id)!.latest_result).toMatchObject({ run_id: agentCaseRun!.id, state: 'errored', error_reason: 'interrupted' });
      expect(items.get(b.id)!.latest_result).toMatchObject({ run_id: setRun.id });
      const skillItems = byId(await json(app, `/skills/${world.skill.id}/eval-cases`));
      expect(skillItems.get(world.find.id)!.latest_result).toMatchObject({ run_id: skillCaseRun!.id, with_state: 'errored', without_state: 'errored', error_reason: 'interrupted' });
      expect((await json(app, `/eval-cases/${world.find.id}`)).latest_result).toMatchObject({ state: 'errored', error_reason: 'interrupted', findings: [] });
      await app.close();
    });
  });

  // =========================================================================
  // compare, run detail, workspace scope
  // =========================================================================

  describe('GET /eval-runs/compare and /eval-runs/:id', () => {
    it('EC-28: compare is 404 for a case run in either position, and still works for two set runs', async () => {
      const llm = new RunLLM();
      const app = await makeApp(llm);
      const { agent, a } = await agentWorld(app);
      const set1 = await finishRun(app, await startSetRun(app, agent.id));
      await sleep(5);
      const set2 = await finishRun(app, await startSetRun(app, agent.id));
      await sleep(5);
      const caseRun = await finishRun(app, await startCaseRun(app, a.id));

      for (const [x, y] of [
        [caseRun.id, set1.id],
        [set1.id, caseRun.id],
        [caseRun.id, caseRun.id],
      ]) {
        const res = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${x}&b=${y}` });
        expect(res.statusCode, `${x} vs ${y}`).toBe(404);
        expect(res.json().error.code).toBe('not_found');
      }
      expect((await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${set1.id}&b=${set2.id}` })).statusCode).toBe(200);
      await app.close();
    });

    it('AC-50/AC-36/AC-38: an agent case run reads back as scope "case" with its snapshot, one-case case_set, per-case result, counts, duration and cost', async () => {
      const llm = new RunLLM();
      llm.mode = 'finds';
      const app = await makeApp(llm);
      const { agent, a } = await agentWorld(app);
      const run = await finishRun(app, await startCaseRun(app, a.id));

      expect(run).toMatchObject({
        owner_kind: 'agent',
        scope: 'case',
        agent_id: agent.id,
        status: 'completed',
        cases_total: 1,
        cases_done: 1,
        error_reason: null,
      });
      expect(run.case_set).toEqual([{ id: a.id, name: a.name }]);
      expect(run.case_results).toEqual([expect.objectContaining({ case_id: a.id, status: 'scored', pass: true })]);
      expect(run.snapshot).toMatchObject({ provider: 'openai', model: 'gpt-4.1', system_prompt: 'You are a test reviewer.' });
      expect(run.duration_ms).toBeGreaterThanOrEqual(0);
      expect(run.cost_usd).toBeCloseTo(0.001, 6);
      expect(run.finished_at).not.toBeNull();
      await app.close();
    });

    it('AC-50/AC-36/AC-44: a skill case run reads back as scope "case", owner_kind "skill", the carrier and arm snapshot, one case, both arms and the effect', async () => {
      const app = await makeApp();
      const { skill, carrier, find } = await skillWorld(app);
      const run = await finishRun(app, await startCaseRun(app, find.id, carrier.id));

      expect(run).toMatchObject({
        owner_kind: 'skill',
        scope: 'case',
        skill_id: skill.id,
        carrier: { agent_id: carrier.id, name: carrier.name },
        status: 'completed',
        cases_total: 1,
        cases_done: 1,
      });
      expect(run.case_set).toEqual([{ id: find.id, name: find.name }]);
      expect(run.snapshot.with_skills.map((s: { name: string }) => s.name)).toEqual([skill.name]);
      expect(run.snapshot.without_skills).toEqual([]);
      expect(run.case_results).toHaveLength(1);
      expect(run.case_results[0]).toMatchObject({ case_id: find.id, effect: 'helped' });
      expect(run.case_results[0].with).toMatchObject({ status: 'scored', pass: true });
      expect(run.case_results[0].without).toMatchObject({ status: 'scored', pass: false });
      await app.close();
    });

    it('EC-29: a case, carrier or case run of another workspace is 404 as if it did not exist, and nothing is started', async () => {
      const llm = new RunLLM();
      const app = await makeApp(llm);
      const [ws2] = await db().insert(t.workspaces).values({ name: `other-${randomUUID().slice(0, 6)}` }).returning();
      const w = ws2!.id;
      const [agent2] = await db()
        .insert(t.agents)
        .values({ workspaceId: w, name: 'Foreign agent', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'p' })
        .returning();
      const [case2] = await db()
        .insert(t.evalCases)
        .values({
          workspaceId: w,
          ownerKind: 'agent',
          ownerId: agent2!.id,
          name: 'foreign-case',
          inputDiff: DIFF,
          inputFiles: ['src/config.ts'],
          inputMeta: { pr_number: null, repo_full_name: null, title: 'T', body: null },
          expectedOutput: { type: 'must_find', file: 'src/config.ts', start_line: 10, end_line: 12 },
        })
        .returning();
      const [run2] = await db()
        .insert(t.evalRuns)
        .values({
          workspaceId: w,
          agentId: agent2!.id,
          agentVersion: 1,
          status: 'completed',
          scope: 'case',
          snapshot: BASE_SNAPSHOT,
          caseSet: [{ id: case2!.id, name: case2!.name }],
          caseResults: [],
          finishedAt: new Date(),
        })
        .returning();

      const notFound = async (method: 'GET' | 'POST', url: string, payload?: object) => {
        const res = await app.inject({ method, url, ...(payload ? { payload } : {}) });
        expect(res.statusCode, `${method} ${url}`).toBe(404);
        expect(res.json().error.code).toBe('not_found');
      };
      await notFound('POST', `/eval-cases/${case2!.id}/run`);
      await notFound('GET', `/eval-runs/${run2!.id}`);
      await notFound('GET', `/eval-cases/${case2!.id}`);

      // my skill case + a carrier of the other workspace (even linked) -> the carrier is 404
      const skill = await makeSkill(app);
      await db().insert(t.agentSkills).values({ agentId: agent2!.id, skillId: skill.id, order: 0, enabled: true });
      const mine = await makeCase(app, 'skill', skill.id, 'mine');
      await notFound('POST', `/eval-cases/${mine.id}/run`, { carrier_agent_id: agent2!.id });

      expect(llm.entered).toBe(0);
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.skillId, skill.id))).toEqual([]);
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent2!.id))).toHaveLength(1);
      await app.close();
    });
  });

  // =========================================================================
  // POST /eval-cases/:id/run - validation and rejections
  // =========================================================================

  describe('POST /eval-cases/:id/run - rejections', () => {
    it('AC-35/EC-19: {} , a bad UUID or a malformed carrier is 422; a skill case with no carrier is 422; an unknown case or carrier is 404; an unlinked carrier is 422 no_agent_linked - nothing starts', async () => {
      const llm = new RunLLM();
      const app = await makeApp(llm);
      const { skill, carrier, find } = await skillWorld(app);
      const stranger = await makeAgent(app); // exists, but is not linked to the skill
      const { a } = await agentWorld(app);
      const runsBefore = (await db().select({ n: count() }).from(t.evalRuns))[0]!.n;

      const post = (url: string, payload?: object) => app.inject({ method: 'POST', url, ...(payload ? { payload } : {}) });
      const code = async (url: string, payload?: object) => {
        const r = await post(url, payload);
        return { status: r.statusCode, code: r.json().error?.code };
      };

      // malformed optional body: present but not { carrier_agent_id: uuid }
      expect(await code(`/eval-cases/${find.id}/run`, {})).toEqual({ status: 422, code: 'validation_error' });
      expect(await code(`/eval-cases/${find.id}/run`, { carrier_agent_id: 'not-a-uuid' })).toEqual({ status: 422, code: 'validation_error' });
      expect(await code(`/eval-cases/${find.id}/run`, { carrier_agent_id: 5 })).toEqual({ status: 422, code: 'validation_error' });
      expect(await code(`/eval-cases/${a.id}/run`, { carrier_agent_id: 'not-a-uuid' })).toEqual({ status: 422, code: 'validation_error' });
      // a skill-owned case names its carrier
      expect(await code(`/eval-cases/${find.id}/run`)).toEqual({ status: 422, code: 'validation_error' });
      // path id
      expect((await post('/eval-cases/not-a-uuid/run')).statusCode).toBe(422);
      // 404s
      expect(await code(`/eval-cases/${randomUUID()}/run`)).toEqual({ status: 404, code: 'not_found' });
      expect(await code(`/eval-cases/${find.id}/run`, { carrier_agent_id: randomUUID() })).toEqual({ status: 404, code: 'not_found' });
      // EC-19: a carrier that exists but is not linked to the skill
      expect(await code(`/eval-cases/${find.id}/run`, { carrier_agent_id: stranger.id })).toEqual({ status: 422, code: 'no_agent_linked' });

      expect((await db().select({ n: count() }).from(t.evalRuns))[0]!.n).toBe(runsBefore);
      expect(llm.entered).toBe(0);
      expect(skill.id).toBeDefined();
      expect(carrier.id).toBeDefined();
      await app.close();
    });

    it('EC-30/EC-20: a disabled agent, a disabled skill and a disabled link still run their case', async () => {
      const app = await makeApp();
      const { agent, a } = await agentWorld(app);
      await db().update(t.agents).set({ enabled: false }).where(eq(t.agents.id, agent.id));
      expect((await finishRun(app, await startCaseRun(app, a.id))).status).toBe('completed');

      const { skill, carrier, find } = await skillWorld(app);
      await db().update(t.skills).set({ enabled: false }).where(eq(t.skills.id, skill.id));
      await db().update(t.agentSkills).set({ enabled: false }).where(eq(t.agentSkills.skillId, skill.id));
      const run = await finishRun(app, await startCaseRun(app, find.id, carrier.id));
      expect(run).toMatchObject({ scope: 'case', status: 'completed' });
      // the skill under test is in the with arm whatever its flags
      expect(run.snapshot.with_skills.map((s: { name: string }) => s.name)).toEqual([skill.name]);
      await app.close();
    });
  });

  // =========================================================================
  // calls, tables, cost, frozen input, deletes
  // =========================================================================

  describe('NFR-2 / NFR-3 / EC-25 / EC-26 / EC-27', () => {
    it('NFR-2/NFR-3: one provider call for an agent case and two for a skill case, and no row in reviews, findings, agent_runs, agent_run_skills or run_traces, last_reviewed_sha untouched', async () => {
      const llm = new RunLLM();
      const app = await makeApp(llm);
      const { a } = await agentWorld(app);
      const world = await skillWorld(app);
      const before = await tableCounts();

      const agentRun = await finishRun(app, await startCaseRun(app, a.id));
      expect(agentRun.status).toBe('completed');
      expect(llm.entered).toBe(1);

      llm.entered = 0;
      const skillRun = await finishRun(app, await startCaseRun(app, world.find.id, world.carrier.id));
      expect(skillRun.status).toBe('completed');
      expect(llm.entered).toBe(2);

      expect(await tableCounts()).toEqual(before);
      await app.close();
    });

    it('EC-25: a model with no price stores a null cost and the case result carries null, never 0', async () => {
      const llm = new RunLLM();
      llm.noCost = true;
      const app = await makeApp(llm);
      const { agent, a } = await agentWorld(app);
      const run = await finishRun(app, await startCaseRun(app, a.id));
      expect(run).toMatchObject({ status: 'completed', cost_usd: null });
      const item = byId(await json(app, `/agents/${agent.id}/eval-cases`)).get(a.id)!;
      expect(item.latest_result.cost_usd).toBeNull();
      await app.close();
    });

    it('EC-26: a case replaced while its run executes - the run finishes from the input read at its start and its result stays on the recorded case id', async () => {
      const llm = new RunLLM();
      llm.mode = 'finds';
      const gate = deferred();
      llm.gate = gate.promise;
      const app = await makeApp(llm);
      const { a } = await agentWorld(app);

      const start = await startCaseRun(app, a.id);
      expect(start.statusCode).toBe(202);
      while (llm.entered < 1) await sleep(10);
      const patch = await app.inject({
        method: 'PATCH',
        url: `/eval-cases/${a.id}`,
        payload: { expectation: { type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 } },
      });
      expect(patch.statusCode).toBe(200);
      const newId = patch.json().id as string;
      expect(newId).not.toBe(a.id); // a changed range replaces the case under a new id
      gate.resolve();

      const run = await waitForRun(app, start.json().id);
      expect(run.status).toBe('completed');
      expect(run.case_set).toEqual([{ id: a.id, name: a.name }]);
      expect(run.case_results[0]).toMatchObject({ case_id: a.id, pass: true });
      // the replacement has no result: the old id is gone and the new one never ran
      expect((await json(app, `/eval-cases/${newId}`)).latest_result).toBeNull();
      expect((await app.inject({ method: 'GET', url: `/eval-cases/${a.id}` })).statusCode).toBe(404);
      await app.close();
    });

    it('EC-27: deleting an agent or a skill removes its case runs with its set runs and cases, and nobody else\'s', async () => {
      const app = await makeApp();
      const mineAgent = await agentWorld(app);
      const keptAgent = await agentWorld(app);
      const mineSkill = await skillWorld(app);
      const keptSkill = await skillWorld(app);
      await finishRun(app, await startCaseRun(app, mineAgent.a.id));
      const keptAgentRun = await finishRun(app, await startCaseRun(app, keptAgent.a.id));
      await finishRun(app, await startCaseRun(app, mineSkill.find.id, mineSkill.carrier.id));
      const keptSkillRun = await finishRun(app, await startCaseRun(app, keptSkill.find.id, keptSkill.carrier.id));

      expect((await app.inject({ method: 'DELETE', url: `/agents/${mineAgent.agent.id}` })).statusCode).toBe(200);
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, mineAgent.agent.id))).toEqual([]);
      expect(await db().select().from(t.evalCases).where(eq(t.evalCases.ownerId, mineAgent.agent.id))).toEqual([]);

      expect((await app.inject({ method: 'DELETE', url: `/skills/${mineSkill.skill.id}` })).statusCode).toBe(200);
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.skillId, mineSkill.skill.id))).toEqual([]);
      expect(await db().select().from(t.evalCases).where(eq(t.evalCases.ownerId, mineSkill.skill.id))).toEqual([]);

      expect((await app.inject({ method: 'GET', url: `/eval-runs/${keptAgentRun.id}` })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: `/eval-runs/${keptSkillRun.id}` })).statusCode).toBe(200);
      await app.close();
    });

    it('EC-27: deleting the skill after the first arm of its case run - no second-arm call, no run row left, no failure', async () => {
      const llm = new RunLLM();
      const gate = deferred();
      llm.gate = gate.promise;
      const app = await makeApp(llm);
      const { skill, carrier, find } = await skillWorld(app);
      const start = await startCaseRun(app, find.id, carrier.id);
      expect(start.statusCode).toBe(202);
      while (llm.entered < 1) await sleep(10); // the with arm is inside the provider call

      expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
      gate.resolve();
      await sleep(300); // the detached run observes the deletion at its next checkpoint

      expect(llm.entered).toBe(1);
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.skillId, skill.id))).toEqual([]);
      expect((await app.inject({ method: 'GET', url: `/eval-runs/${start.json().id}` })).statusCode).toBe(404);
      await app.close();
    });

    it('EC-27: deleting the agent while its single review runs - the review is not interrupted, no result is written and no run row is left', async () => {
      const llm = new RunLLM();
      const gate = deferred();
      llm.gate = gate.promise;
      const app = await makeApp(llm);
      const { agent, a } = await agentWorld(app);
      const start = await startCaseRun(app, a.id);
      while (llm.entered < 1) await sleep(10);

      expect((await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` })).statusCode).toBe(200);
      gate.resolve();
      await sleep(300);

      expect(llm.entered).toBe(1);
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toEqual([]);
      expect((await app.inject({ method: 'GET', url: `/eval-runs/${start.json().id}` })).statusCode).toBe(404);
      await app.close();
    });
  });
});
