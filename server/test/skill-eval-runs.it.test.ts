import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type {
  EvalCaseOutcome,
  EvalExpectation,
  EvalLift,
  EvalMetrics,
  Review,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { errorCaseOutcome, scoreCase, scoreRun } from '../src/modules/eval/scoring.js';

/**
 * SPEC-09 Phase B — the skill eval runner against a real Postgres: POST
 * /skills/:id/eval-runs, GET /skills/:id/eval-overview, the `owner_kind` union
 * of GET /eval-runs/:id, the skill cases' `latest_result`, single-flight per
 * skill, agent-read exclusion (NFR-5), the skill-delete cascade and the
 * performance budget. Self-skips without Docker. The LLM is a mock; fixtures
 * carry placeholder secrets only (`sk_live_xxx`, NFR-14).
 *
 * A run executes in a detached promise after the route answers 202, so tests
 * poll `GET /eval-runs/:id` (`waitForRun`) and hold a run open with a gated LLM.
 * Pure arms/pairing/lift maths are in `src/modules/eval/arms.test.ts`; the
 * orchestration with a stubbed repo is `service-skill-run.test.ts`.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[skill-eval-runs] Docker not available — skipping integration tests.');

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
 * Finds the bug only when the skill under test is in the prompt — so a with-arm
 * pass against a without-arm miss is a genuine `helped`, and a with-arm finding on
 * a `must_not_flag` case is a genuine `hurt`. Can be held open (`gate`) or fail per call.
 */
class ArmLLM extends MockLLMProvider {
  /** Calls that reached the provider, counted on entry (before the gate). */
  entered = 0;
  gate: Promise<void> | undefined;
  failOn: (callNo: number) => boolean = () => false;
  models: string[] = [];

  constructor() {
    super('openai');
  }

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const callNo = ++this.entered;
    const r = req as unknown as StructuredRequest<unknown>;
    this.models.push(r.model);
    const prompt = r.messages.map((m) => m.content as string).join('\n');
    if (this.gate) await this.gate;
    if (this.failOn(callNo)) throw new Error(`provider boom ${callNo}`);
    const fixture = prompt.includes(SUT_BODY) ? REVIEW : NO_FINDINGS;
    return new MockLLMProvider('openai', { structured: fixture }).completeStructured<T>(req);
  }
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const EXP_FIND: EvalExpectation = { type: 'must_find', file: 'src/config.ts', start_line: 10, end_line: 12 };

const BASE_SNAPSHOT = {
  provider: 'openai' as const,
  model: 'gpt-4.1',
  strategy: 'single-pass' as const,
  system_prompt: 'You are a test reviewer.',
  skills: [] as { name: string; body: string }[],
};

const outcome = (caseId: string, type: 'must_find' | 'must_not_flag', hit: boolean, over: { ms?: number; cost?: number | null } = {}) =>
  scoreCase({
    caseId,
    name: `n-${caseId.slice(0, 6)}`,
    expectation: { type, file: 'src/config.ts', start_line: 10, end_line: 12 },
    findings: hit
      ? [{ file: 'src/config.ts', start_line: 11, end_line: 11, title: 't', severity: 'INFO', category: 'bug' }]
      : [],
    groundingKept: hit ? 1 : 0,
    groundingTotal: hit ? 1 : 0,
    durationMs: over.ms ?? 5,
    costUsd: over.cost === undefined ? 0.001 : over.cost,
  });

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

d('SPEC-09 skill eval runs (Testcontainers pg)', () => {
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
  function makeApp(llm: MockLLMProvider = new ArmLLM()) {
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
        name: `Carrier ${++seq}-${randomUUID().slice(0, 6)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a test reviewer.',
        ...over,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string; version: number; model: string };
  }

  async function makeSkill(app: App, over: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: `sk-${++seq}-${randomUUID().slice(0, 6)}`,
        description: 'A test skill',
        type: 'convention',
        body: SUT_BODY,
        ...over,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string; version: number };
  }

  /** Direct link row so `order` and both enable flags are exact. */
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
    await sleep(3); // distinct created_at → deterministic run order
    return res.json() as { id: string; name: string };
  }

  /**
   * A skill with a linked carrier and two cases: `find` (must_find) is HELPED by the
   * skill, `quiet` (must_not_flag) is HURT by it — the mock only finds the bug with the skill.
   */
  async function skillWorld(app: App) {
    const skill = await makeSkill(app);
    const carrier = await makeAgent(app);
    await link(carrier.id, skill.id, 0);
    const find = await makeCase(app, 'skill', skill.id, 'find-it');
    const quiet = await makeCase(app, 'skill', skill.id, 'stay-quiet', 'must_not_flag');
    return { skill, carrier, find, quiet };
  }

  const startRun = (app: App, skillId: string, carrierId: string) =>
    app.inject({ method: 'POST', url: `/skills/${skillId}/eval-runs`, payload: { carrier_agent_id: carrierId } });

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

  interface SkillRunSeed {
    status?: 'running' | 'completed' | 'partial' | 'errored';
    ranAt?: Date;
    with?: EvalCaseOutcome[];
    without?: EvalCaseOutcome[];
    caseSet?: { id: string; name: string }[];
    withMetrics?: EvalMetrics | null;
    withoutMetrics?: EvalMetrics | null;
    lift?: EvalLift | null;
    costUsd?: number | null;
    skillVersion?: number;
    ws?: string;
    carrierName?: string;
    carrierVersion?: number;
  }
  function skillRunValues(skillId: string, carrierId: string, o: SkillRunSeed = {}): typeof t.evalRuns.$inferInsert {
    const status = o.status ?? 'completed';
    const finished = status === 'completed' || status === 'partial';
    const withOut = o.with ?? [];
    const withoutOut = o.without ?? [];
    const withM = o.withMetrics === undefined ? (finished ? scoreRun(withOut) : null) : o.withMetrics;
    const withoutM = o.withoutMetrics === undefined ? (finished ? scoreRun(withoutOut) : null) : o.withoutMetrics;
    const lift: EvalLift | null =
      o.lift !== undefined
        ? o.lift
        : withM && withoutM
          ? {
              recall: withM.recall.value == null || withoutM.recall.value == null ? null : withM.recall.value - withoutM.recall.value,
              precision: withM.precision.value == null || withoutM.precision.value == null ? null : withM.precision.value - withoutM.precision.value,
              citation_accuracy:
                withM.citation_accuracy.value == null || withoutM.citation_accuracy.value == null
                  ? null
                  : withM.citation_accuracy.value - withoutM.citation_accuracy.value,
            }
          : null;
    const ranAt = o.ranAt ?? new Date();
    return {
      workspaceId: o.ws ?? workspaceId,
      ownerKind: 'skill',
      skillId,
      skillVersion: o.skillVersion ?? 1,
      carrierAgentId: carrierId,
      carrierName: o.carrierName ?? 'Seeded carrier',
      carrierVersion: o.carrierVersion ?? 1,
      carrierModel: 'gpt-4.1',
      status,
      snapshot: BASE_SNAPSHOT,
      skillSnapshot: {
        carrier: { agent_id: carrierId, name: o.carrierName ?? 'Seeded carrier', version: o.carrierVersion ?? 1, provider: 'openai', model: 'gpt-4.1', strategy: 'single-pass', system_prompt: 'You are a test reviewer.' },
        skill: { name: 'seeded-skill', body: SUT_BODY, version: o.skillVersion ?? 1 },
        with_skills: [{ name: 'seeded-skill', body: SUT_BODY }],
        without_skills: [],
      },
      caseSet: o.caseSet ?? withOut.map((c) => ({ id: c.case_id, name: c.name })),
      caseResults: withOut,
      withoutResults: withoutOut,
      metricParts: withM,
      withoutMetrics: withoutM,
      lift,
      recall: withM?.recall.value ?? null,
      precision: withM?.precision.value ?? null,
      citationAccuracy: withM?.citation_accuracy.value ?? null,
      tracesPassed: withM?.traces_passed ?? null,
      tracesTotal: withM?.traces_total ?? null,
      casesErrored: withM?.cases_errored ?? 0,
      ranAt,
      finishedAt: status === 'running' ? null : ranAt,
      durationMs: status === 'running' ? null : 1000,
      costUsd: o.costUsd === undefined ? 0.01 : o.costUsd,
      errorReason: status === 'errored' ? 'boom' : null,
    };
  }
  async function insertSkillRun(skillId: string, carrierId: string, o: SkillRunSeed = {}) {
    const [row] = await db().insert(t.evalRuns).values(skillRunValues(skillId, carrierId, o)).returning();
    return row!;
  }

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

  // =========================================================================
  // POST /skills/:id/eval-runs
  // =========================================================================

  describe('POST /skills/:id/eval-runs', () => {
    it('AC-22..AC-32/AC-42/NFR-2/NFR-4: 202 first, then two reviews per case, both arms scored, lift, effects, snapshot, and no writes to review tables', async () => {
      const llm = new ArmLLM();
      const app = await makeApp(llm);
      const { skill, carrier, find, quiet } = await skillWorld(app);

      const before = await tableCounts();
      const start = await startRun(app, skill.id, carrier.id);
      expect(start.statusCode).toBe(202);
      expect(start.json()).toMatchObject({ status: 'running' });
      const runId = start.json().id as string;

      const run = await waitForRun(app, runId);
      expect(run).toMatchObject({
        id: runId,
        owner_kind: 'skill',
        skill_id: skill.id,
        skill_name: skill.name,
        skill_version: skill.version,
        carrier: { agent_id: carrier.id, name: carrier.name, version: carrier.version, model: 'gpt-4.1' },
        status: 'completed',
        cases_total: 2,
        cases_done: 2,
        error_reason: null,
      });
      expect(run.finished_at).not.toBeNull();
      expect(run.duration_ms).toBeGreaterThanOrEqual(0);
      // AC-26: the case set, in run order. EC-27: cost is the total over both arms (4 reviews × 0.001)
      expect(run.case_set).toEqual([{ id: find.id, name: find.name }, { id: quiet.id, name: quiet.name }]);
      expect(run.cost_usd).toBeCloseTo(0.004, 6);

      // AC-23/AC-24/AC-25: the snapshot — skill, carrier config and both arms' skill lists
      expect(run.snapshot).toEqual({
        carrier: { agent_id: carrier.id, name: carrier.name, version: carrier.version, provider: 'openai', model: 'gpt-4.1', strategy: expect.any(String), system_prompt: 'You are a test reviewer.' },
        skill: { name: skill.name, body: SUT_BODY, version: skill.version },
        with_skills: [{ name: skill.name, body: SUT_BODY }],
        without_skills: [],
      });

      // AC-31: per-case effects — the skill helped the must_find case and hurt the must_not_flag one
      expect(run.case_results).toHaveLength(2);
      expect(run.case_results[0]).toMatchObject({ case_id: find.id, case_name: find.name, effect: 'helped' });
      expect(run.case_results[0].with).toMatchObject({ status: 'scored', pass: true, got_count: 1 });
      expect(run.case_results[0].without).toMatchObject({ status: 'scored', pass: false, got_count: 0 });
      expect(run.case_results[1]).toMatchObject({ case_id: quiet.id, effect: 'hurt' });

      // AC-29/AC-30: both arms' metrics over the same cases, and the raw lift
      expect(run.with).toMatchObject({ recall: { value: 1, num: 1, den: 1 }, precision: { value: 0.5, num: 1, den: 2 }, tp: 1, fp: 1, traces_passed: 1, traces_total: 2 });
      expect(run.without).toMatchObject({ recall: { value: 0, num: 0, den: 1 }, precision: { value: null, num: 0, den: 0 }, tp: 0, fp: 0, traces_passed: 1, traces_total: 2 });
      // EC-26: the without arm kept nothing → precision null → its lift is null, never 0
      expect(run.lift).toEqual({ recall: 1, precision: null, citation_accuracy: null });

      // NFR-2: exactly two provider calls per case; AC-27: with arm first, then without
      expect(llm.entered).toBe(4);
      expect(llm.models).toEqual(['gpt-4.1', 'gpt-4.1', 'gpt-4.1', 'gpt-4.1']);

      // NFR-4: nothing written to the live review tables, last_reviewed_sha untouched
      expect(await tableCounts()).toEqual(before);
      await app.close();
    });

    it('AC-24/AC-25: the arms list the carrier\'s enabled skills in link order, ties by name then id; the skill under test goes last of its tie, whatever its flags', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const carrier = await makeAgent(app);
      const tieB = await makeSkill(app, { name: `tie-b-${randomUUID().slice(0, 4)}` });
      const tieA = await makeSkill(app, { name: `tie-a-${randomUUID().slice(0, 4)}` });
      const first = await makeSkill(app, { name: `first-${randomUUID().slice(0, 4)}` });
      const last = await makeSkill(app, { name: `last-${randomUUID().slice(0, 4)}` });
      const linkOff = await makeSkill(app, { name: `link-off-${randomUUID().slice(0, 4)}` });
      const skillOff = await makeSkill(app, { name: `skill-off-${randomUUID().slice(0, 4)}` });
      await db().update(t.skills).set({ enabled: false }).where(eq(t.skills.id, skillOff.id));
      await db().update(t.skills).set({ enabled: false }).where(eq(t.skills.id, skill.id)); // skill under test is itself disabled …
      await link(carrier.id, first.id, 0);
      await link(carrier.id, tieB.id, 1);
      await link(carrier.id, tieA.id, 1);
      await link(carrier.id, skill.id, 1, false); // … and its link is off, still in the with arm
      await link(carrier.id, last.id, 2);
      await link(carrier.id, linkOff.id, 3, false);
      await link(carrier.id, skillOff.id, 4);
      await makeCase(app, 'skill', skill.id, 'one');

      const { id } = (await startRun(app, skill.id, carrier.id)).json();
      const run = await waitForRun(app, id);
      const names = (arm: { name: string }[]) => arm.map((s) => s.name);
      expect(names(run.snapshot.without_skills)).toEqual([first.name, tieA.name, tieB.name, last.name]);
      expect(names(run.snapshot.with_skills)).toEqual([first.name, tieA.name, tieB.name, skill.name, last.name]);
      await app.close();
    });

    it('EC-16: a provider failure in one arm errors the case in both, the run is partial, and the case drops out of every metric', async () => {
      const llm = new ArmLLM();
      llm.failOn = (n) => n === 2; // case 1, without arm
      const app = await makeApp(llm);
      const { skill, carrier, find } = await skillWorld(app);
      const { id } = (await startRun(app, skill.id, carrier.id)).json();
      const run = await waitForRun(app, id);

      expect(run.status).toBe('partial');
      expect(run.case_results[0]).toMatchObject({ case_id: find.id, effect: 'errored' });
      expect(run.case_results[0].with).toMatchObject({ status: 'errored', pass: null, error_reason: 'provider boom 2' });
      expect(run.case_results[0].without).toMatchObject({ status: 'errored', pass: null, error_reason: 'provider boom 2' });
      expect(run.with.traces_total).toBe(1);
      expect(run.without.traces_total).toBe(1);
      expect(run.with.cases_errored).toBe(1);
      await app.close();
    });

    it('EC-17: every case errored → status errored, null metrics, lifts and cost, the first reason on the run', async () => {
      const llm = new ArmLLM();
      llm.failOn = () => true;
      const app = await makeApp(llm);
      const { skill, carrier } = await skillWorld(app);
      const { id } = (await startRun(app, skill.id, carrier.id)).json();
      const run = await waitForRun(app, id);
      expect(run).toMatchObject({ status: 'errored', with: null, without: null, lift: null, cost_usd: null, error_reason: 'provider boom 1' });
      expect(run.case_results.every((r: { effect: string }) => r.effect === 'errored')).toBe(true);
      await app.close();
    });

    it('EC-11/EC-12/EC-13/AC-20: rejections carry their code and start nothing — skill 404 → carrier 404 → no_agent_linked → no_eval_cases', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const carrier = await makeAgent(app);
      const runsBefore = (await db().select({ n: count() }).from(t.evalRuns))[0]!.n;
      const code = async (skillId: string, carrierId: string) => {
        const r = await startRun(app, skillId, carrierId);
        return { status: r.statusCode, code: r.json().error?.code };
      };

      expect(await code(randomUUID(), randomUUID())).toEqual({ status: 404, code: 'not_found' }); // unknown skill beats unknown carrier
      expect(await code(skill.id, randomUUID())).toEqual({ status: 404, code: 'not_found' });
      // EC-11: nothing linked at all (and no cases) → no_agent_linked first
      expect(await code(skill.id, carrier.id)).toEqual({ status: 422, code: 'no_agent_linked' });
      // EC-12: linked to ANOTHER agent, the carrier chosen is not
      const other = await makeAgent(app);
      await link(other.id, skill.id, 0);
      expect(await code(skill.id, carrier.id)).toEqual({ status: 422, code: 'no_agent_linked' });
      // EC-13: linked carrier, zero cases
      await link(carrier.id, skill.id, 0);
      expect(await code(skill.id, carrier.id)).toEqual({ status: 422, code: 'no_eval_cases' });

      // body / path validation
      expect((await app.inject({ method: 'POST', url: `/skills/${skill.id}/eval-runs`, payload: {} })).statusCode).toBe(422);
      expect((await startRun(app, skill.id, 'not-a-uuid')).statusCode).toBe(422);
      expect((await app.inject({ method: 'POST', url: '/skills/not-a-uuid/eval-runs', payload: { carrier_agent_id: carrier.id } })).statusCode).toBe(422);

      expect((await db().select({ n: count() }).from(t.evalRuns))[0]!.n).toBe(runsBefore);
      await app.close();
    });

    it('EC-14/NFR-5/EC-15: single-flight per skill (409 + details.run_id); a carrier\'s own agent run and the skill run proceed together', async () => {
      const llm = new ArmLLM();
      const gate = deferred();
      llm.gate = gate.promise;
      const app = await makeApp(llm);
      const { skill, carrier } = await skillWorld(app);

      const [a, b] = await Promise.all([startRun(app, skill.id, carrier.id), startRun(app, skill.id, carrier.id)]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([202, 409]);
      const accepted = [a, b].find((r) => r.statusCode === 202)!.json();
      const rejected = [a, b].find((r) => r.statusCode === 409)!.json();
      expect(rejected.error).toMatchObject({ code: 'eval_run_in_progress', details: { run_id: accepted.id } });
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.skillId, skill.id))).toHaveLength(1);

      // a later start while it runs is rejected the same way
      const later = await startRun(app, skill.id, carrier.id);
      expect(later.statusCode).toBe(409);
      expect(later.json().error.details.run_id).toBe(accepted.id);

      // a different skill's run is independent of this one
      const otherSkill = await makeSkill(app);
      await link(carrier.id, otherSkill.id, 5);
      await makeCase(app, 'skill', otherSkill.id, 'other-one');
      const otherRun = await startRun(app, otherSkill.id, carrier.id);
      expect(otherRun.statusCode).toBe(202);

      // EC-15: the carrier's OWN agent run starts while the skill run is running — no 409 either way
      await makeCase(app, 'agent', carrier.id, 'agent-case');
      const agentRun = await app.inject({ method: 'POST', url: `/agents/${carrier.id}/eval-runs` });
      expect(agentRun.statusCode).toBe(202);

      // AC-33: progress is visible while running; the overview names the running run
      const mid = (await app.inject({ method: 'GET', url: `/eval-runs/${accepted.id}` })).json();
      expect(mid).toMatchObject({ owner_kind: 'skill', status: 'running', cases_total: 2, cases_done: 0, with: null, without: null, lift: null, finished_at: null });
      const overview = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-overview` })).json();
      expect(overview.running_run_id).toBe(accepted.id);
      // NFR-5: the skill run is not the agent's running run
      const agentOverview = (await app.inject({ method: 'GET', url: `/agents/${carrier.id}/eval-overview` })).json();
      expect(agentOverview.running_run_id).toBe(agentRun.json().id);

      gate.resolve();
      expect((await waitForRun(app, accepted.id)).status).toBe('completed');
      expect((await waitForRun(app, otherRun.json().id)).status).toBe('completed');
      expect((await waitForRun(app, agentRun.json().id)).status).toBe('completed');

      // once finished, a new run may start
      const next = await startRun(app, skill.id, carrier.id);
      expect(next.statusCode).toBe(202);
      await waitForRun(app, next.json().id);
      await app.close();
    });

    it('EC-15: a skill run can start while the carrier\'s agent run is running (the reverse order)', async () => {
      const llm = new ArmLLM();
      const gate = deferred();
      llm.gate = gate.promise;
      const app = await makeApp(llm);
      const { skill, carrier } = await skillWorld(app);
      await makeCase(app, 'agent', carrier.id, 'agent-case');

      const agentRun = await app.inject({ method: 'POST', url: `/agents/${carrier.id}/eval-runs` });
      expect(agentRun.statusCode).toBe(202);
      const skillRun = await startRun(app, skill.id, carrier.id);
      expect(skillRun.statusCode).toBe(202);
      // the agent's own single-flight still holds
      expect((await app.inject({ method: 'POST', url: `/agents/${carrier.id}/eval-runs` })).statusCode).toBe(409);

      gate.resolve();
      await waitForRun(app, agentRun.json().id);
      expect((await waitForRun(app, skillRun.json().id)).status).toBe('completed');
      await app.close();
    });

    it('EC-21/EC-22: the run keeps its start-time snapshot when the skill or the carrier change mid-run, and survives the carrier being deleted', async () => {
      const llm = new ArmLLM();
      const gate = deferred();
      llm.gate = gate.promise;
      const app = await makeApp(llm);
      const { skill, carrier } = await skillWorld(app);
      const { id } = (await startRun(app, skill.id, carrier.id)).json();
      while (llm.entered < 1) await sleep(10);

      expect((await app.inject({ method: 'PUT', url: `/agents/${carrier.id}`, payload: { model: 'gpt-4o', system_prompt: 'A different prompt.' } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: 'Edited body, no marker.' } })).statusCode).toBe(200);
      gate.resolve();

      const run = await waitForRun(app, id);
      expect(run.status).toBe('completed');
      expect(run.snapshot.carrier).toMatchObject({ model: 'gpt-4.1', system_prompt: 'You are a test reviewer.' });
      expect(run.snapshot.skill.body).toBe(SUT_BODY);
      expect(run.skill_version).toBe(skill.version);
      expect(new Set(llm.models)).toEqual(new Set(['gpt-4.1']));
      // the with arm still found the bug: it was reviewed with the snapshotted skill body
      expect(run.with.recall.value).toBe(1);

      // EC-22: deleting the carrier afterwards keeps the run and its snapshotted carrier name
      expect((await app.inject({ method: 'DELETE', url: `/agents/${carrier.id}` })).statusCode).toBe(200);
      const kept = (await app.inject({ method: 'GET', url: `/eval-runs/${id}` })).json();
      expect(kept).toMatchObject({ status: 'completed', carrier: { name: carrier.name } });
      const overview = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-overview` })).json();
      expect(overview.latest.carrier.name).toBe(carrier.name);
      expect(overview.trend[0].carrier_name).toBe(carrier.name);
      expect(overview.carriers).toEqual([]); // no longer linked, no longer a choice
      await app.close();
    });
  });

  // =========================================================================
  // GET /skills/:id/eval-overview
  // =========================================================================

  describe('GET /skills/:id/eval-overview', () => {
    it('AC-41/EC-46: carriers (name order, with enabled and link_enabled), cases_total, latest/previous = the two newest FINISHED runs, trend chronological', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const zed = await makeAgent(app, { name: `Zed ${randomUUID().slice(0, 4)}` });
      const abe = await makeAgent(app, { name: `Abe ${randomUUID().slice(0, 4)}` });
      await link(zed.id, skill.id, 0, true);
      await link(abe.id, skill.id, 0, false); // the link is off
      await db().update(t.agents).set({ enabled: false }).where(eq(t.agents.id, abe.id));
      await makeAgent(app); // not linked → not a carrier
      const c1 = await makeCase(app, 'skill', skill.id, 'one');
      await makeCase(app, 'skill', skill.id, 'two');

      const t0 = Date.UTC(2091, 0, 1);
      const oldest = await insertSkillRun(skill.id, zed.id, { ranAt: new Date(t0), with: [outcome(c1.id, 'must_find', true)], without: [outcome(c1.id, 'must_find', false)] });
      const previous = await insertSkillRun(skill.id, zed.id, { ranAt: new Date(t0 + 60_000), status: 'partial', with: [outcome(c1.id, 'must_find', true)], without: [outcome(c1.id, 'must_find', true)], skillVersion: 2 });
      const latest = await insertSkillRun(skill.id, zed.id, { ranAt: new Date(t0 + 120_000), with: [outcome(c1.id, 'must_find', true)], without: [outcome(c1.id, 'must_find', false)], skillVersion: 2 });
      await insertSkillRun(skill.id, zed.id, { ranAt: new Date(t0 + 180_000), status: 'errored' }); // newer, but not finished
      const running = await insertSkillRun(skill.id, zed.id, { ranAt: new Date(t0 + 240_000), status: 'running' });

      const res = await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-overview` });
      expect(res.statusCode).toBe(200);
      const o = res.json();
      expect(o.skill).toEqual({ id: skill.id, name: skill.name, version: skill.version, enabled: true });
      expect(o).toMatchObject({ cases_total: 2, running_run_id: running.id });
      expect(o.carriers).toEqual([
        { agent_id: abe.id, name: abe.name, version: abe.version, model: 'gpt-4.1', enabled: false, link_enabled: false },
        { agent_id: zed.id, name: zed.name, version: zed.version, model: 'gpt-4.1', enabled: true, link_enabled: true },
      ]);
      expect(o.latest).toMatchObject({ id: latest.id, owner_kind: 'skill', skill_name: skill.name, skill_version: 2, status: 'completed', cases_total: 1, cases_done: 1 });
      expect(o.latest.lift.recall).toBe(1);
      expect(o.previous).toMatchObject({ id: previous.id, status: 'partial' });
      expect(o.previous.lift.recall).toBe(0);
      expect(o.trend.map((p: { run_id: string }) => p.run_id)).toEqual([oldest.id, previous.id, latest.id]);
      expect(o.trend[2]).toMatchObject({ skill_version: 2, carrier_agent_id: zed.id, carrier_name: 'Seeded carrier', carrier_version: 1, model: 'gpt-4.1', recall: 1, cost_usd: 0.01 });
      await app.close();
    });

    it('EC-25/EC-26/EC-28: a null metric or lift reaches the trend as null — a gap, never 0', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const carrier = await makeAgent(app);
      await link(carrier.id, skill.id, 0);
      const c = await makeCase(app, 'skill', skill.id, 'quiet', 'must_not_flag');
      const t0 = Date.UTC(2092, 0, 1);
      // a must_not_flag-only run: no must_find case → recall null in both arms → recall lift null
      await insertSkillRun(skill.id, carrier.id, { ranAt: new Date(t0), with: [outcome(c.id, 'must_not_flag', false)], without: [outcome(c.id, 'must_not_flag', false)], costUsd: null });

      const o = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-overview` })).json();
      expect(o.latest).toMatchObject({ with: { recall: { value: null }, precision: { value: null } }, lift: { recall: null, precision: null, citation_accuracy: null }, cost_usd: null });
      expect(o.trend).toEqual([
        expect.objectContaining({ recall: null, precision: null, citation_accuracy: null, lift: { recall: null, precision: null, citation_accuracy: null }, cost_usd: null }),
      ]);
      await app.close();
    });

    it('EC-23/AC-41: a skill with no runs → null latest/previous, empty trend, no carriers; EC-29-ish: zero cases is cases_total 0', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const o = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-overview` })).json();
      expect(o).toMatchObject({ cases_total: 0, running_run_id: null, carriers: [], latest: null, previous: null, trend: [] });
      await app.close();
    });

    it('AC-41/NFR-13: the trend holds at most 100 finished runs, the newest 100 in chronological order', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const carrier = await makeAgent(app);
      const t0 = Date.UTC(2093, 0, 1);
      const rows = Array.from({ length: 105 }, (_, i) => skillRunValues(skill.id, carrier.id, { ranAt: new Date(t0 + i * 60_000), skillVersion: 1 + i }));
      const inserted = await db().insert(t.evalRuns).values(rows).returning({ id: t.evalRuns.id, ranAt: t.evalRuns.ranAt });
      const chrono = inserted.sort((a, b) => a.ranAt.getTime() - b.ranAt.getTime());

      const o = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-overview` })).json();
      expect(o.trend).toHaveLength(100);
      expect(o.trend.map((p: { run_id: string }) => p.run_id)).toEqual(chrono.slice(5).map((r) => r.id));
      expect(o.latest.id).toBe(chrono[104]!.id);
      expect(o.previous.id).toBe(chrono[103]!.id);
      await app.close();
    });
  });

  // =========================================================================
  // GET /eval-runs/:id — discriminated by owner_kind
  // =========================================================================

  describe('GET /eval-runs/:id', () => {
    it('AC-42: a skill run is owner_kind "skill" (skill version, carrier, arms, lifts); an agent run is owner_kind "agent" with its agent fields', async () => {
      const app = await makeApp();
      const { skill, carrier, find } = await skillWorld(app);
      const skillRun = await insertSkillRun(skill.id, carrier.id, {
        with: [outcome(find.id, 'must_find', true)],
        without: [outcome(find.id, 'must_find', false)],
      });
      const [agentRun] = await db()
        .insert(t.evalRuns)
        .values({
          workspaceId,
          agentId: carrier.id,
          agentVersion: 1,
          status: 'completed',
          snapshot: BASE_SNAPSHOT,
          caseSet: [],
          caseResults: [],
          metricParts: scoreRun([]),
          finishedAt: new Date(),
        })
        .returning();

      const s = (await app.inject({ method: 'GET', url: `/eval-runs/${skillRun.id}` })).json();
      expect(s).toMatchObject({ owner_kind: 'skill', skill_id: skill.id, skill_version: 1, carrier: { agent_id: carrier.id }, cases_total: 1, cases_done: 1 });
      expect(s.snapshot.with_skills).toBeDefined();
      expect(s.case_results).toEqual([expect.objectContaining({ case_id: find.id, effect: 'helped' })]);
      expect(s.lift.recall).toBe(1);
      expect(s).not.toHaveProperty('agent_id');

      const a = (await app.inject({ method: 'GET', url: `/eval-runs/${agentRun!.id}` })).json();
      expect(a).toMatchObject({ owner_kind: 'agent', agent_id: carrier.id, agent_version: 1 });
      expect(a.snapshot.system_prompt).toBe('You are a test reviewer.');
      expect(a).not.toHaveProperty('lift');
      await app.close();
    });
  });

  // =========================================================================
  // GET /skills/:id/eval-cases and GET /eval-cases/:id — latest_result
  // =========================================================================

  describe('skill cases: latest_result', () => {
    it('AC-40: each item carries both arms\' states, the effect, the with-arm counts and the cost over both arms from the latest finished run; null for a case not in it', async () => {
      const app = await makeApp();
      const { skill, carrier } = await skillWorld(app);
      const [find, quiet] = (await db().select().from(t.evalCases).where(eq(t.evalCases.ownerId, skill.id))).sort((a, b) => a.name.localeCompare(b.name)); // find-it, stay-quiet
      const stable = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-cases` })).json();
      expect(stable.every((i: { latest_result: unknown }) => i.latest_result === null)).toBe(true); // no run yet

      const t0 = Date.UTC(2094, 0, 1);
      // an OLDER run, then the latest one — only the latest counts
      await insertSkillRun(skill.id, carrier.id, { ranAt: new Date(t0), with: [outcome(find!.id, 'must_find', false)], without: [outcome(find!.id, 'must_find', false)] });
      const latest = await insertSkillRun(skill.id, carrier.id, {
        ranAt: new Date(t0 + 60_000),
        with: [outcome(find!.id, 'must_find', true, { cost: 0.01 }), errorCaseOutcome(quiet!.id, quiet!.name, 'must_not_flag', 'boom', 1)],
        without: [outcome(find!.id, 'must_find', false, { cost: 0.02 }), errorCaseOutcome(quiet!.id, quiet!.name, 'must_not_flag', 'boom', 1)],
      });
      // a case created after the run is not in it
      const late = await makeCase(app, 'skill', skill.id, 'created-later');

      const items = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-cases` })).json() as { id: string; latest_result: Record<string, unknown> | null }[];
      const byId = new Map(items.map((i) => [i.id, i.latest_result]));
      expect(byId.get(find!.id)).toMatchObject({
        run_id: latest.id,
        with_state: 'passed',
        without_state: 'failed',
        effect: 'helped',
        expected_count: 1,
        got_count: 1,
        error_reason: null,
      });
      expect(byId.get(find!.id)!.cost_usd).toBeCloseTo(0.03, 9);
      expect(byId.get(quiet!.id)).toMatchObject({ with_state: 'errored', without_state: 'errored', effect: 'errored', expected_count: null, got_count: null, cost_usd: null, error_reason: 'boom' });
      expect(byId.get(late.id)).toBeNull();
      await app.close();
    });

    it('AC-59/EC-27: GET /eval-cases/:id returns the WITH-arm state and counts, duration and cost summed over both arms; a null cost in either arm is null', async () => {
      const app = await makeApp();
      const { skill, carrier, find, quiet } = await skillWorld(app);
      await insertSkillRun(skill.id, carrier.id, {
        with: [outcome(find.id, 'must_find', false, { ms: 30, cost: 0.01 }), outcome(quiet.id, 'must_not_flag', false, { ms: 4, cost: null })],
        without: [outcome(find.id, 'must_find', true, { ms: 70, cost: 0.02 }), outcome(quiet.id, 'must_not_flag', false, { ms: 6, cost: 0.02 })],
      });

      const f = (await app.inject({ method: 'GET', url: `/eval-cases/${find.id}` })).json();
      // with-arm FAILED while the without arm passed → state is the with arm's
      expect(f.latest_result).toMatchObject({ state: 'failed', expected_count: 1, got_count: 0, duration_ms: 100, error_reason: null });
      expect(f.latest_result.cost_usd).toBeCloseTo(0.03, 9);
      const q = (await app.inject({ method: 'GET', url: `/eval-cases/${quiet.id}` })).json();
      expect(q.latest_result).toMatchObject({ state: 'passed', duration_ms: 10, cost_usd: null });
      await app.close();
    });

    it('AC-59: a skill case with no finished run, or not in it, has latest_result null', async () => {
      const app = await makeApp();
      const { skill, carrier, find } = await skillWorld(app);
      expect((await app.inject({ method: 'GET', url: `/eval-cases/${find.id}` })).json().latest_result).toBeNull();
      await insertSkillRun(skill.id, carrier.id, { status: 'running' });
      expect((await app.inject({ method: 'GET', url: `/eval-cases/${find.id}` })).json().latest_result).toBeNull();
      const late = await makeCase(app, 'skill', skill.id, 'later');
      await insertSkillRun(skill.id, carrier.id, { ranAt: new Date(Date.now() - 5000), with: [outcome(find.id, 'must_find', true)], without: [outcome(find.id, 'must_find', true)] });
      expect((await app.inject({ method: 'GET', url: `/eval-cases/${late.id}` })).json().latest_result).toBeNull();
      await app.close();
    });
  });

  // =========================================================================
  // NFR-5 — skill runs never appear in agent reads
  // =========================================================================

  describe('NFR-5: agent reads exclude skill runs', () => {
    it('NFR-5/EC-38: a NEWER, finished skill run on the carrier never shows in the agent overview, cases, dashboard or compare — and compare 404s for a skill run id', async () => {
      const app = await makeApp();
      const { skill, carrier } = await skillWorld(app);
      const agentCase = await makeCase(app, 'agent', carrier.id, 'agent-case');

      const base = Date.now() - 3_600_000;
      const insertAgentRun = async (ranAt: Date) => {
        const [row] = await db()
          .insert(t.evalRuns)
          .values({
            workspaceId,
            agentId: carrier.id,
            agentVersion: 1,
            status: 'completed',
            snapshot: BASE_SNAPSHOT,
            caseSet: [{ id: agentCase.id, name: agentCase.name }],
            caseResults: [outcome(agentCase.id, 'must_find', true)],
            metricParts: scoreRun([outcome(agentCase.id, 'must_find', true)]),
            recall: 1,
            ranAt,
            finishedAt: ranAt,
            durationMs: 10,
            costUsd: 0.01,
          })
          .returning();
        return row!;
      };
      const agentRunOld = await insertAgentRun(new Date(base));
      const agentRunNew = await insertAgentRun(new Date(base + 60_000));
      // newer than every agent run, so a leaking predicate would make it the "latest"
      const skillRunA = await insertSkillRun(skill.id, carrier.id, { ranAt: new Date(base + 120_000), with: [outcome(randomUUID(), 'must_find', true)], without: [outcome(randomUUID(), 'must_find', false)] });
      const skillRunB = await insertSkillRun(skill.id, carrier.id, { ranAt: new Date(base + 180_000), with: [outcome(randomUUID(), 'must_find', true)], without: [outcome(randomUUID(), 'must_find', false)] });

      // overview
      const ov = (await app.inject({ method: 'GET', url: `/agents/${carrier.id}/eval-overview` })).json();
      expect(ov).toMatchObject({ cases_total: 1, finished_runs: 2, running_run_id: null });
      expect(ov.latest.id).toBe(agentRunNew.id);
      expect(ov.previous.id).toBe(agentRunOld.id);
      expect(ov.trend).toHaveLength(2);
      expect(ov.runs.map((r: { id: string }) => r.id).sort()).toEqual([agentRunNew.id, agentRunOld.id].sort());

      // cases: only the agent's own, none of the skill's
      const cases = (await app.inject({ method: 'GET', url: `/agents/${carrier.id}/eval-cases` })).json();
      expect(cases.map((c: { id: string }) => c.id)).toEqual([agentCase.id]);

      // dashboard
      const dash = (await app.inject({ method: 'GET', url: '/eval-dashboard' })).json();
      const card = dash.agents.find((a: { agent_id: string }) => a.agent_id === carrier.id);
      expect(card.cases_total).toBe(1);
      expect(card.latest.id).toBe(agentRunNew.id);
      expect(card.sparkline).toHaveLength(2);
      const recent = dash.recent_runs.map((r: { id: string }) => r.id);
      expect(recent).toContain(agentRunNew.id);
      expect(recent).not.toContain(skillRunA.id);
      expect(recent).not.toContain(skillRunB.id);

      // compare: the agent pair still works; any pair with a skill run is 404
      const ok = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${agentRunOld.id}&b=${agentRunNew.id}` });
      expect(ok.statusCode).toBe(200);
      for (const [a, b] of [
        [skillRunA.id, agentRunNew.id],
        [agentRunOld.id, skillRunA.id],
        [skillRunA.id, skillRunB.id],
      ]) {
        const res = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${a}&b=${b}` });
        expect(res.statusCode, `${a} vs ${b}`).toBe(404);
        expect(res.json().error.code).toBe('not_found');
      }
      await app.close();
    });

    it('NFR-5: an agent\'s cases list does not include a skill\'s cases and a skill\'s cases list does not include the agent\'s', async () => {
      const app = await makeApp();
      const { skill, carrier, find, quiet } = await skillWorld(app);
      const agentCase = await makeCase(app, 'agent', carrier.id, 'agent-only');
      const agentList = (await app.inject({ method: 'GET', url: `/agents/${carrier.id}/eval-cases` })).json();
      expect(agentList.map((c: { id: string }) => c.id)).toEqual([agentCase.id]);
      const skillList = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-cases` })).json();
      expect(skillList.map((c: { id: string }) => c.id).sort()).toEqual([find.id, quiet.id].sort());
      await app.close();
    });
  });

  // =========================================================================
  // EC-32 — workspace scoping
  // =========================================================================

  describe('workspace scoping', () => {
    it('EC-32/NFR-3: a skill, carrier or run of another workspace is 404 as if it did not exist, and nothing is started or changed', async () => {
      const app = await makeApp();
      const [ws2] = await db().insert(t.workspaces).values({ name: `other-${randomUUID().slice(0, 6)}` }).returning();
      const w = ws2!.id;
      const [skill2] = await db()
        .insert(t.skills)
        .values({ workspaceId: w, name: `foreign-${randomUUID().slice(0, 6)}`, description: 'd', type: 'convention', source: 'manual', body: SUT_BODY, enabled: true })
        .returning();
      const [agent2] = await db()
        .insert(t.agents)
        .values({ workspaceId: w, name: 'Foreign agent', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'p' })
        .returning();
      await link(agent2!.id, skill2!.id, 0);
      const [case2] = await db()
        .insert(t.evalCases)
        .values({
          workspaceId: w,
          ownerKind: 'skill',
          ownerId: skill2!.id,
          name: 'foreign-case',
          inputDiff: DIFF,
          inputFiles: ['src/config.ts'],
          inputMeta: { pr_number: null, repo_full_name: null, title: 'T', body: null },
          expectedOutput: EXP_FIND,
        })
        .returning();
      const run2 = await insertSkillRun(skill2!.id, agent2!.id, { ws: w, with: [outcome(case2!.id, 'must_find', true)], without: [outcome(case2!.id, 'must_find', false)] });

      const call = (method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url, ...(payload ? { payload } : {}) });
      for (const [method, url, payload] of [
        ['POST', `/skills/${skill2!.id}/eval-runs`, { carrier_agent_id: agent2!.id }],
        ['GET', `/skills/${skill2!.id}/eval-overview`],
        ['GET', `/skills/${skill2!.id}/eval-cases`],
        ['GET', `/eval-cases/${case2!.id}`],
        ['GET', `/eval-runs/${run2.id}`],
      ] as const) {
        const res = await call(method, url, payload as object | undefined);
        expect(res.statusCode, `${method} ${url}`).toBe(404);
        expect(res.json().error.code).toBe('not_found');
      }

      // my skill + a foreign carrier (even with a link row) → the carrier is 404
      const mine = await makeSkill(app);
      await db().insert(t.agentSkills).values({ agentId: agent2!.id, skillId: mine.id, order: 0, enabled: true });
      await makeCase(app, 'skill', mine.id, 'mine');
      const res = await startRun(app, mine.id, agent2!.id);
      expect(res.statusCode).toBe(404);
      // … and the foreign agent is never offered as a carrier
      const o = (await call('GET', `/skills/${mine.id}/eval-overview`)).json();
      expect(o.carriers).toEqual([]);

      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.skillId, mine.id))).toEqual([]);
      const [still] = await db().select().from(t.evalRuns).where(eq(t.evalRuns.id, run2.id));
      expect(still!.status).toBe('completed');
      await app.close();
    });
  });

  // =========================================================================
  // EC-23 / EC-24 — skill delete
  // =========================================================================

  describe('skill delete', () => {
    it('EC-23: deleting a skill deletes its eval cases and runs in the same operation, and only its own', async () => {
      const app = await makeApp();
      const mine = await skillWorld(app);
      const theirs = await skillWorld(app);
      await insertSkillRun(mine.skill.id, mine.carrier.id, { with: [outcome(mine.find.id, 'must_find', true)], without: [outcome(mine.find.id, 'must_find', false)] });
      const keptRun = await insertSkillRun(theirs.skill.id, theirs.carrier.id, { with: [outcome(theirs.find.id, 'must_find', true)], without: [outcome(theirs.find.id, 'must_find', false)] });

      const del = await app.inject({ method: 'DELETE', url: `/skills/${mine.skill.id}` });
      expect(del.statusCode).toBe(200);

      expect(await db().select().from(t.evalCases).where(eq(t.evalCases.ownerId, mine.skill.id))).toEqual([]);
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.skillId, mine.skill.id))).toEqual([]);
      expect((await db().select().from(t.evalCases).where(eq(t.evalCases.ownerId, theirs.skill.id))).length).toBe(2);
      expect((await app.inject({ method: 'GET', url: `/eval-runs/${keptRun.id}` })).statusCode).toBe(200);
      // the agent's own cases are untouched by a skill delete
      expect((await app.inject({ method: 'GET', url: `/agents/${mine.carrier.id}/eval-cases` })).statusCode).toBe(200);
      await app.close();
    });

    it('EC-24: deleting the skill mid-run stops the run before the next review — no further LLM call, no run row left', async () => {
      const llm = new ArmLLM();
      const gate = deferred();
      llm.gate = gate.promise;
      const app = await makeApp(llm);
      const { skill, carrier } = await skillWorld(app);
      const { id } = (await startRun(app, skill.id, carrier.id)).json();
      while (llm.entered < 1) await sleep(10); // case 1, with arm, is inside the provider call

      expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
      gate.resolve();
      await sleep(300); // the detached run observes the deletion at its next checkpoint

      expect(llm.entered).toBe(1); // never the without arm, never case 2
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.skillId, skill.id))).toEqual([]);
      expect((await app.inject({ method: 'GET', url: `/eval-runs/${id}` })).statusCode).toBe(404);
      await app.close();
    });
  });

  // =========================================================================
  // NFR-6, NFR-1 — finished runs are immutable; reads never reach the LLM
  // =========================================================================

  describe('NFR-6 / NFR-1', () => {
    it('NFR-6/EC-10: a finished run is unchanged after its cases are renamed, replaced or deleted', async () => {
      const app = await makeApp();
      const { skill, carrier, find, quiet } = await skillWorld(app);
      const { id } = (await startRun(app, skill.id, carrier.id)).json();
      const before = await waitForRun(app, id);
      const overviewBefore = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-overview` })).json();

      // rename in place, replace (a new id), then delete the other case
      expect((await app.inject({ method: 'PATCH', url: `/eval-cases/${find.id}`, payload: { name: 'renamed' } })).statusCode).toBe(200);
      const replaced = await app.inject({
        method: 'PATCH',
        url: `/eval-cases/${find.id}`,
        payload: { expectation: { type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 } },
      });
      expect(replaced.statusCode).toBe(200);
      expect(replaced.json().replaced_from_id).toBe(find.id);
      expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${quiet.id}` })).statusCode).toBe(204);

      const after = (await app.inject({ method: 'GET', url: `/eval-runs/${id}` })).json();
      expect(after).toEqual(before);
      expect(after.case_set.map((c: { name: string }) => c.name)).toEqual(['find-it', 'stay-quiet']); // names recorded at the start
      const overviewAfter = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-overview` })).json();
      expect(overviewAfter.latest).toEqual(overviewBefore.latest);
      expect(overviewAfter.trend).toEqual(overviewBefore.trend);
      expect(overviewAfter.cases_total).toBe(1); // …while the live set did change
      await app.close();
    });

    it('NFR-1: overview, case list, case detail and run detail never reach the LLM provider', async () => {
      const llm = new ArmLLM();
      const app = await makeApp(llm);
      const { skill, carrier, find } = await skillWorld(app);
      const run = await insertSkillRun(skill.id, carrier.id, { with: [outcome(find.id, 'must_find', true)], without: [outcome(find.id, 'must_find', false)] });
      for (const url of [`/skills/${skill.id}/eval-overview`, `/skills/${skill.id}/eval-cases`, `/eval-cases/${find.id}`, `/eval-runs/${run.id}`]) {
        expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
      }
      expect(llm.entered).toBe(0);
      await app.close();
    });
  });

  // =========================================================================
  // EC-18 — boot reap
  // =========================================================================

  describe('boot reap (EC-18)', () => {
    it('EC-18: a skill run left running by a dead process is marked errored with reason "interrupted" on the next boot, freeing the single-flight slot', async () => {
      const setup = await makeApp();
      const { skill, carrier } = await skillWorld(setup);
      const stale = await insertSkillRun(skill.id, carrier.id, { status: 'running' });
      await setup.close();

      const app = await makeApp(); // buildApp reaps on boot
      const reaped = (await app.inject({ method: 'GET', url: `/eval-runs/${stale.id}` })).json();
      expect(reaped).toMatchObject({ owner_kind: 'skill', status: 'errored', error_reason: 'interrupted' });
      expect(reaped.finished_at).not.toBeNull();
      const o = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-overview` })).json();
      expect(o.running_run_id).toBeNull();
      await app.close();
    });
  });

  // =========================================================================
  // NFR-13 — performance
  // =========================================================================

  it('NFR-13: /skills/:id/eval-overview and /skills/:id/eval-cases answer within 500 ms with 100 finished runs and 50 cases', async () => {
    const [skill] = await db()
      .insert(t.skills)
      .values({ workspaceId, name: `perf-skill-${randomUUID().slice(0, 6)}`, description: 'd', type: 'convention', source: 'manual', body: SUT_BODY, enabled: true })
      .returning();
    const [agent] = await db()
      .insert(t.agents)
      .values({ workspaceId, name: `Perf carrier ${randomUUID().slice(0, 6)}`, provider: 'openai', model: 'gpt-4.1', systemPrompt: 'You are a reviewer. '.repeat(40) })
      .returning();
    await link(agent!.id, skill!.id, 0);

    const cases = await db()
      .insert(t.evalCases)
      .values(
        Array.from({ length: 50 }, (_, i) => ({
          workspaceId,
          ownerKind: 'skill' as const,
          ownerId: skill!.id,
          name: `perf-case-${i}`,
          inputDiff: 'diff --git a/src/config.ts b/src/config.ts\n' + 'x'.repeat(2000),
          inputFiles: ['src/config.ts'],
          inputMeta: { pr_number: null, repo_full_name: null, title: 'T', body: null },
          expectedOutput: EXP_FIND,
        })),
      )
      .returning({ id: t.evalCases.id, name: t.evalCases.name });

    const withOut = cases.map((c) => outcome(c.id, 'must_find', true));
    const withoutOut = cases.map((c) => outcome(c.id, 'must_find', false));
    const t0 = Date.UTC(2096, 0, 1);
    await db()
      .insert(t.evalRuns)
      .values(
        Array.from({ length: 100 }, (_, i) =>
          skillRunValues(skill!.id, agent!.id, {
            ranAt: new Date(t0 + i * 3_600_000),
            skillVersion: 1 + Math.floor(i / 10),
            caseSet: cases.map((c) => ({ id: c.id, name: c.name })),
            with: withOut,
            without: withoutOut,
          }),
        ),
      );

    const app = await makeApp();
    // one warm-up request each so pool connection / planner cold-start is not measured
    await app.inject({ method: 'GET', url: `/skills/${skill!.id}/eval-overview` });
    await app.inject({ method: 'GET', url: `/skills/${skill!.id}/eval-cases` });

    const timed = async (url: string) => {
      const start = performance.now();
      const res = await app.inject({ method: 'GET', url });
      const ms = performance.now() - start;
      expect(res.statusCode).toBe(200);
      return { ms, body: res.json() };
    };

    const overview = await timed(`/skills/${skill!.id}/eval-overview`);
    expect(overview.ms).toBeLessThan(500);
    expect(overview.body).toMatchObject({ cases_total: 50 });
    expect(overview.body.trend).toHaveLength(100);
    expect(overview.body.latest.cases_total).toBe(50);

    const list = await timed(`/skills/${skill!.id}/eval-cases`);
    expect(list.ms).toBeLessThan(500);
    expect(list.body).toHaveLength(50);
    expect(list.body.every((i: { latest_result: { effect: string } | null }) => i.latest_result?.effect === 'helped')).toBe(true);
    await app.close();
  }, 180_000);
});
