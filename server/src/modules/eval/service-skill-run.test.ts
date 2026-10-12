import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Review, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider } from '../../adapters/mocks.js';
import type { Container } from '../../platform/container.js';
import type { CarrierLink } from './arms.js';
import { LOG } from './constants.js';
import type { EvalRepository } from './repository.js';
import { EvalService } from './service.js';
import type { CarrierRow, EvalLogger, FrozenCase, SkillForRun } from './types.js';

/**
 * SPEC-09 EvalService.startSkillRun / executeSkillRun — hermetic. The repository
 * is an in-memory stub and the LLM is a mock (the outside world); the service,
 * arms, pairing, scoring and the real reviewer-core engine run for real.
 * The SQL side is `skill-eval-runs.it.test.ts`.
 *
 * `startSkillRun` answers 202-style before the detached executor finishes, so
 * the tests wait on the stub's `finalizeSkillRun` / the abort log line.
 */

const WS = 'ws-1';
const SKILL = 'skill-1';
const CARRIER = 'agent-1';
const SUT_BODY = 'SUT-BODY: never ship secrets.';

const DIFF = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -10,3 +10,4 @@',
  '   port: 3000,',
  '+  stripeKey: "sk_live_xxx",',
  '   redisUrl: x,',
].join('\n');

const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded key.',
  score: 40,
  findings: [
    {
      id: 'f1',
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

const frozenCase = (id: string): FrozenCase => ({
  id,
  name: `case-${id}`,
  inputDiff: DIFF,
  inputMeta: { title: 'Add rate limiting', body: null },
  expectation: { type: 'must_find', file: 'src/config.ts', start_line: 10, end_line: 12 },
});

const user = (req: unknown) =>
  (req as StructuredRequest<unknown>).messages.find((m) => m.role === 'user')!.content as string;

/** A mock provider that finds the bug only when the skill under test is in the prompt, and can fail per call. */
class ArmLLM extends MockLLMProvider {
  entered = 0;
  gate: Promise<void> | undefined;
  failOn: (callNo: number) => boolean = () => false;
  /** Whether each call's prompt held the skill under test, in call order. */
  withSkill: boolean[] = [];

  constructor() {
    super('openai');
  }

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const callNo = ++this.entered;
    this.calls.push({ method: 'completeStructured', req });
    const has = user(req).includes(SUT_BODY);
    this.withSkill.push(has);
    if (this.gate) await this.gate;
    if (this.failOn(callNo)) throw new Error(`provider boom ${callNo}`);
    return new MockLLMProvider('openai', { structured: has ? REVIEW : NO_FINDINGS }).completeStructured<T>(req);
  }
}

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

interface WorldOpts {
  skill?: SkillForRun | undefined;
  carrierExists?: boolean;
  carriers?: CarrierRow[];
  cases?: FrozenCase[];
  links?: CarrierLink[];
  /** `isRunning` answers true for this many checks, then false (the skill was deleted). */
  runningChecks?: number;
}

function makeWorld(o: WorldOpts = {}) {
  const skill: SkillForRun | undefined =
    'skill' in o
      ? o.skill
      : { id: SKILL, name: 'sut-skill', body: SUT_BODY, version: 3, enabled: true };
  const carriers: CarrierRow[] = o.carriers ?? [
    { agentId: CARRIER, name: 'Carrier', version: 2, model: 'gpt-4.1', enabled: true, linkEnabled: true },
  ];
  const cases = o.cases ?? [frozenCase('c1'), frozenCase('c2')];
  const links: CarrierLink[] = o.links ?? [
    { skillId: SKILL, name: 'sut-skill', body: SUT_BODY, order: 0, linkEnabled: true, skillEnabled: true },
  ];
  const llm = new ArmLLM();
  const finalized = deferred<{ values: Record<string, unknown>; results?: { with: unknown[]; without: unknown[] } }>();
  let checks = 0;
  const writes: string[] = [];

  const repo = {
    skillForRun: vi.fn(async (_ws: string, id: string) => (id === SKILL ? skill : undefined)),
    carriersForSkill: vi.fn(async () => carriers),
    casesForRun: vi.fn(async () => cases),
    carrierLinks: vi.fn(async () => links),
    insertSkillRun: vi.fn(async (_values: unknown) => 'run-1'),
    isRunning: vi.fn(async () => {
      checks++;
      return o.runningChecks === undefined || checks <= o.runningChecks;
    }),
    saveSkillProgress: vi.fn(async () => {
      writes.push('progress');
      return true;
    }),
    finalizeSkillRun: vi.fn(async (_ws: string, _id: string, values: Record<string, unknown>, results?: { with: unknown[]; without: unknown[] }) => {
      writes.push('finalize');
      finalized.resolve({ values, results });
      return true;
    }),
  };

  const container = {
    evalRepo: repo,
    agentsRepo: {
      getById: vi.fn(async (_ws: string, id: string) =>
        id === CARRIER && o.carrierExists !== false
          ? {
              id,
              name: 'Carrier',
              version: 2,
              provider: 'openai',
              model: 'gpt-4.1',
              strategy: 'single-pass',
              systemPrompt: 'You are a strict reviewer.',
            }
          : undefined,
      ),
    },
    llm: vi.fn(async () => llm),
  };

  const logger: EvalLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = new EvalService(container as unknown as Container);
  return { service, repo: repo as unknown as EvalRepository & typeof repo, llm, logger, finalized, writes, container };
}

describe('EvalService.startSkillRun (SPEC-09)', () => {
  let w: ReturnType<typeof makeWorld>;

  describe('check order', () => {
    const expectNothingStarted = (world: ReturnType<typeof makeWorld>) => {
      expect(world.repo.insertSkillRun).not.toHaveBeenCalled();
      expect(world.llm.calls).toHaveLength(0);
    };

    it('AC-20/EC-12/EC-13: 404 skill → 404 carrier → 422 no_agent_linked → 422 no_eval_cases, each before the next, nothing started', async () => {
      // 1. unknown skill AND unknown carrier AND no cases → the skill 404 wins
      w = makeWorld({ cases: [], carrierExists: false });
      await expect(w.service.startSkillRun(WS, 'ghost-skill', 'ghost-agent')).rejects.toMatchObject({
        statusCode: 404,
        message: 'Skill not found',
      });
      expectNothingStarted(w);

      // 2. known skill, unknown carrier (also not linked, no cases) → the carrier 404
      w = makeWorld({ cases: [], carrierExists: false });
      await expect(w.service.startSkillRun(WS, SKILL, CARRIER)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Agent not found',
      });
      expectNothingStarted(w);

      // 3. carrier exists but is not linked to the skill, AND there are no cases → no_agent_linked
      w = makeWorld({ cases: [], carriers: [] });
      await expect(w.service.startSkillRun(WS, SKILL, CARRIER)).rejects.toMatchObject({
        statusCode: 422,
        code: 'no_agent_linked',
      });
      expectNothingStarted(w);

      // 4. linked carrier, no cases → no_eval_cases
      w = makeWorld({ cases: [] });
      await expect(w.service.startSkillRun(WS, SKILL, CARRIER)).rejects.toMatchObject({
        statusCode: 422,
        code: 'no_eval_cases',
      });
      expectNothingStarted(w);
    });

    it('EC-12: a carrier that exists but is linked only to ANOTHER skill is no_agent_linked', async () => {
      w = makeWorld({
        carriers: [{ agentId: 'someone-else', name: 'Other', version: 1, model: 'm', enabled: true, linkEnabled: true }],
      });
      await expect(w.service.startSkillRun(WS, SKILL, CARRIER)).rejects.toMatchObject({ code: 'no_agent_linked' });
      expectNothingStarted(w);
    });
  });

  describe('run', () => {
    beforeEach(() => {
      w = makeWorld();
    });

    it('AC-22/AC-23/AC-26: answers {id, running} BEFORE any case is reviewed, with a snapshot of skill, carrier and both arms', async () => {
      const gate = deferred();
      w.llm.gate = gate.promise;
      const start = await w.service.startSkillRun(WS, SKILL, CARRIER, w.logger);
      expect(start).toEqual({ id: 'run-1', status: 'running' });
      expect(w.repo.finalizeSkillRun).not.toHaveBeenCalled(); // detached: no review has finished

      const insert = w.repo.insertSkillRun.mock.calls[0]![0] as unknown as {
        skillId: string;
        skillVersion: number;
        carrier: unknown;
        caseSet: unknown;
        skillSnapshot: { with_skills: { name: string }[]; without_skills: unknown[]; skill: unknown; carrier: Record<string, unknown> };
      };
      expect(insert).toMatchObject({
        skillId: SKILL,
        skillVersion: 3,
        carrier: { agentId: CARRIER, name: 'Carrier', version: 2, model: 'gpt-4.1' },
        caseSet: [{ id: 'c1', name: 'case-c1' }, { id: 'c2', name: 'case-c2' }],
      });
      expect(insert.skillSnapshot.skill).toEqual({ name: 'sut-skill', body: SUT_BODY, version: 3 });
      expect(insert.skillSnapshot.carrier).toMatchObject({ system_prompt: 'You are a strict reviewer.', provider: 'openai', strategy: 'single-pass' });
      expect(insert.skillSnapshot.with_skills.map((s) => s.name)).toEqual(['sut-skill']);
      expect(insert.skillSnapshot.without_skills).toEqual([]);
      // cases are read once (EC-10)
      expect(w.repo.casesForRun).toHaveBeenCalledTimes(1);

      gate.resolve();
      await w.finalized.promise;
    });

    it('NFR-2/AC-27: exactly two reviews per case — with arm then without arm, one at a time, in case order', async () => {
      await w.service.startSkillRun(WS, SKILL, CARRIER, w.logger);
      await w.finalized.promise;

      expect(w.llm.calls.map((c) => c.method)).toEqual(Array(4).fill('completeStructured'));
      // case 1 with, case 1 without, case 2 with, case 2 without
      expect(w.llm.withSkill).toEqual([true, false, true, false]);
      // progress saved per case, finalize last
      expect(w.writes).toEqual(['progress', 'progress', 'finalize']);
    });

    it('AC-28..AC-32: finalizes with both arms\' metrics, the raw lift, per-case results and a completed status', async () => {
      await w.service.startSkillRun(WS, SKILL, CARRIER, w.logger);
      const { values, results } = await w.finalized.promise;

      expect(values).toMatchObject({
        status: 'completed',
        casesErrored: 0,
        errorReason: null,
        // 4 reviews × 0.001 (mock cost) over both arms
        costUsd: expect.closeTo(0.004, 9),
      });
      const withM = values.withMetrics as { recall: { value: number }; precision: { value: number | null } };
      const withoutM = values.withoutMetrics as { recall: { value: number }; precision: { value: number | null } };
      expect(withM.recall.value).toBe(1);
      expect(withoutM.recall.value).toBe(0);
      // EC-26: the without arm kept no finding → precision null → its lift is null, recall's is the raw fraction
      expect(withoutM.precision.value).toBeNull();
      expect(values.lift).toEqual({ recall: 1, precision: null, citation_accuracy: null });
      expect(results!.with).toHaveLength(2);
      expect(results!.without).toHaveLength(2);
      expect(w.logger.error).not.toHaveBeenCalled();
    });

    it('EC-16: a review that fails in ONE arm errors the case in both arms; the run is partial and the metrics skip it', async () => {
      w.llm.failOn = (n) => n === 2; // case 1, without arm
      await w.service.startSkillRun(WS, SKILL, CARRIER, w.logger);
      const { values, results } = await w.finalized.promise;

      expect(values.status).toBe('partial');
      expect(values.casesErrored).toBe(1);
      const [with1, with2] = results!.with as { status: string; error_reason: string | null }[];
      const [without1] = results!.without as { status: string; error_reason: string | null }[];
      expect(with1).toMatchObject({ status: 'errored', error_reason: 'provider boom 2' });
      expect(without1).toMatchObject({ status: 'errored', error_reason: 'provider boom 2' });
      expect(with2!.status).toBe('scored');
      expect((values.withMetrics as { traces_total: number }).traces_total).toBe(1);
      expect((values.withoutMetrics as { traces_total: number }).traces_total).toBe(1);
    });

    it('EC-17: every case errored → status errored, null metrics and lift and cost, the first case\'s reason', async () => {
      w.llm.failOn = () => true;
      await w.service.startSkillRun(WS, SKILL, CARRIER, w.logger);
      const { values } = await w.finalized.promise;
      expect(values).toMatchObject({
        status: 'errored',
        withMetrics: null,
        withoutMetrics: null,
        lift: null,
        costUsd: null,
        errorReason: 'provider boom 1',
      });
    });

    it('EC-27: a model missing from the price table (null cost) makes the run cost null', async () => {
      const original = w.llm.completeStructured.bind(w.llm);
      w.llm.completeStructured = async (req) => ({ ...(await original(req)), costUsd: null });
      await w.service.startSkillRun(WS, SKILL, CARRIER, w.logger);
      const { values } = await w.finalized.promise;
      expect(values.status).toBe('completed');
      expect(values.costUsd).toBeNull();
    });

    it('NFR-12: the start and finish log lines carry ids, counts, status and duration — never a diff, prompt or skill body', async () => {
      await w.service.startSkillRun(WS, SKILL, CARRIER, w.logger);
      await w.finalized.promise;
      await vi.waitFor(() => expect(w.logger.info).toHaveBeenCalledWith(expect.anything(), LOG.skillRunFinished));
      const logged = JSON.stringify((w.logger.info as ReturnType<typeof vi.fn>).mock.calls);
      expect(logged).toContain('run-1');
      expect(logged).toContain(CARRIER);
      expect(logged).not.toContain(SUT_BODY);
      expect(logged).not.toContain('sk_live_xxx');
      expect(logged).not.toContain('strict reviewer');
    });

    it('an unexpected crash mid-run (DB error) never leaves the run running: it is finalized errored with the reason', async () => {
      w.repo.saveSkillProgress.mockRejectedValueOnce(new Error('db went away'));
      await w.service.startSkillRun(WS, SKILL, CARRIER, w.logger);
      const { values } = await w.finalized.promise;
      expect(values).toMatchObject({ status: 'errored', withMetrics: null, lift: null, errorReason: 'db went away' });
      expect(w.logger.error).toHaveBeenCalled();
    });
  });

  describe('EC-24: the skill is deleted while its run executes', () => {
    it('EC-24: stops before the next review — no further LLM call, no write, no error log', async () => {
      // isRunning is checked before EACH review: true for c1 with, c1 without and c2 with, then false
      // → deleted between the arms of case 2: its with review ran, its without review must not.
      w = makeWorld({ runningChecks: 3 });
      await w.service.startSkillRun(WS, SKILL, CARRIER, w.logger);
      await vi.waitFor(() => expect(w.logger.info).toHaveBeenCalledWith(expect.anything(), LOG.skillRunAborted));

      expect(w.llm.entered).toBe(3); // c1 with, c1 without, c2 with — never c2 without
      expect(w.repo.finalizeSkillRun).not.toHaveBeenCalled();
      expect(w.writes).toEqual(['progress']); // only case 1 was saved; nothing after the deletion
      expect(w.logger.error).not.toHaveBeenCalled();
    });

    it('EC-24: deleted before the next case starts — that case is never reviewed', async () => {
      w = makeWorld({ runningChecks: 2 }); // case 1 both arms, then gone before case 2
      await w.service.startSkillRun(WS, SKILL, CARRIER, w.logger);
      await vi.waitFor(() => expect(w.logger.info).toHaveBeenCalledWith(expect.anything(), LOG.skillRunAborted));
      expect(w.llm.entered).toBe(2);
      expect(w.repo.finalizeSkillRun).not.toHaveBeenCalled();
      expect(w.logger.error).not.toHaveBeenCalled();
    });

    it('EC-24: gone before the very first review — zero LLM calls', async () => {
      w = makeWorld({ runningChecks: 0 });
      await w.service.startSkillRun(WS, SKILL, CARRIER, w.logger);
      await vi.waitFor(() => expect(w.logger.info).toHaveBeenCalledWith(expect.anything(), LOG.skillRunAborted));
      expect(w.llm.entered).toBe(0);
      expect(w.writes).toEqual([]);
    });

    it('EC-24: deleted during the last arm review — finalize finds no row, the run ends quietly', async () => {
      w = makeWorld({ cases: [frozenCase('c1')] });
      w.repo.finalizeSkillRun.mockResolvedValueOnce(false);
      await w.service.startSkillRun(WS, SKILL, CARRIER, w.logger);
      await vi.waitFor(() => expect(w.logger.info).toHaveBeenCalledWith(expect.anything(), LOG.skillRunAborted));
      expect(w.logger.error).not.toHaveBeenCalled();
    });
  });
});
