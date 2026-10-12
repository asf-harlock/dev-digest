import { describe, it, expect, vi } from 'vitest';
import type { EvalCaseOutcome, Review, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider } from '../../adapters/mocks.js';
import type { Container } from '../../platform/container.js';
import { CASE_ERROR_FALLBACK, LOG } from './constants.js';
import {
  pickLatestSource,
  skillSummaryFromRow,
  sourceOutcomes,
  summaryFromRow,
  toFrozenCase,
  toLatestResult,
  toRunRecord,
  toRunningCaseRun,
  toSkillDetailLatest,
  toSkillRunRecord,
  type AgentRunRow,
  type SkillRunRow,
} from './helpers.js';
import type { CarrierLink } from './arms.js';
import type { EvalCaseRow, EvalRepository } from './repository.js';
import { errorCaseOutcome, scoreCase } from './scoring.js';
import { EvalService } from './service.js';
import type { CaseResultSource, EvalLogger, EvalRunSummary } from './types.js';

/**
 * SPEC-10 Phase B, hermetic: the per-case latest-result merge (AC-46, EC-21, EC-22), the `scope`
 * mapping (AC-50), and `EvalService.startCaseRun` against an in-memory repository and a mock LLM
 * (the outside world). The SQL side - the real readers - is `test/eval-case-run.it.test.ts`.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const EXP = { type: 'must_find' as const, file: 'src/config.ts', start_line: 10, end_line: 12 };
const FINDING = { file: 'src/config.ts', start_line: 11, end_line: 11, title: 't', severity: 'INFO', category: 'bug' };

const outcome = (caseId: string, hit: boolean, over: { ms?: number; cost?: number | null } = {}): EvalCaseOutcome =>
  scoreCase({
    caseId,
    name: `n-${caseId}`,
    expectation: EXP,
    findings: hit ? [FINDING] : [],
    groundingKept: hit ? 1 : 0,
    groundingTotal: hit ? 1 : 0,
    durationMs: over.ms ?? 5,
    costUsd: over.cost === undefined ? 0.001 : over.cost,
  });

const source = (over: Partial<CaseResultSource> = {}): CaseResultSource => ({
  runId: 'run-x',
  scope: 'set',
  startedAt: new Date('2026-01-01T00:00:00Z'),
  outcome: outcome('c1', true),
  without: undefined,
  runErrorReason: null,
  runDurationMs: null,
  ...over,
});

const caseRow = (over: Partial<EvalCaseRow> = {}): EvalCaseRow =>
  ({
    id: 'c1',
    workspaceId: 'ws-1',
    ownerKind: 'agent',
    ownerId: 'agent-1',
    name: 'the-case',
    inputDiff: 'diff --git a/x b/x',
    inputFiles: ['src/config.ts'],
    inputMeta: { pr_number: 7, repo_full_name: 'acme/api', title: 'Add rate limiting', body: 'why' },
    expectedOutput: EXP,
    notes: null,
    sourceFindingId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...over,
  }) as EvalCaseRow;

// ---------------------------------------------------------------------------
// pickLatestSource - AC-46
// ---------------------------------------------------------------------------

describe('pickLatestSource (AC-46)', () => {
  const t0 = new Date('2026-03-01T00:00:00Z');
  const t1 = new Date('2026-03-01T00:01:00Z');

  it('AC-46: a later-started case run wins over the set run; an older one loses to it', () => {
    const set = source({ runId: 'set', scope: 'set', startedAt: t0 });
    const newer = source({ runId: 'case-new', scope: 'case', startedAt: t1 });
    const older = source({ runId: 'case-old', scope: 'case', startedAt: new Date('2026-02-01T00:00:00Z') });
    expect(pickLatestSource(set, newer)?.runId).toBe('case-new');
    expect(pickLatestSource(set, older)?.runId).toBe('set');
  });

  it('AC-46: either side alone is the answer; neither is undefined', () => {
    const set = source({ runId: 'set' });
    const cs = source({ runId: 'case', scope: 'case' });
    expect(pickLatestSource(set, undefined)).toBe(set);
    expect(pickLatestSource(undefined, cs)).toBe(cs);
    expect(pickLatestSource(undefined, undefined)).toBeUndefined();
  });

  it('tie rule: on an exact started_at tie the set run wins', () => {
    const set = source({ runId: 'set', scope: 'set', startedAt: t0 });
    const cs = source({ runId: 'case', scope: 'case', startedAt: t0 });
    expect(pickLatestSource(set, cs)?.runId).toBe('set');
  });
});

// ---------------------------------------------------------------------------
// sourceOutcomes - EC-21, EC-22
// ---------------------------------------------------------------------------

describe('sourceOutcomes (EC-21, EC-22)', () => {
  const row = { id: 'c1', name: 'the-case', expectedOutput: EXP };

  it('passes a stored outcome through unchanged (unpaired and paired)', () => {
    const o = outcome('c1', true);
    const w = outcome('c1', false);
    expect(sourceOutcomes(row, source({ outcome: o }), false)).toEqual({ with: o, without: undefined });
    expect(sourceOutcomes(row, source({ outcome: o, without: w }), true)).toEqual({ with: o, without: w });
  });

  it('EC-21/EC-22: a run with no stored outcome becomes an errored placeholder with the run\'s own reason and duration', () => {
    const got = sourceOutcomes(
      row,
      source({ scope: 'case', outcome: undefined, runErrorReason: 'interrupted', runDurationMs: 1234 }),
      false,
    );
    expect(got.without).toBeUndefined();
    expect(got.with).toMatchObject({
      case_id: 'c1',
      name: 'the-case',
      expectation_type: 'must_find',
      status: 'errored',
      pass: null,
      error_reason: 'interrupted',
      duration_ms: 1234,
      findings: [],
    });
  });

  it('a placeholder without any run reason falls back to the generic one and a 0 duration', () => {
    const got = sourceOutcomes(row, source({ outcome: undefined, runErrorReason: null, runDurationMs: null }), false);
    expect(got.with).toMatchObject({ error_reason: CASE_ERROR_FALLBACK, duration_ms: 0 });
  });

  it('paired: both arms are the errored placeholder; an outcome with a missing without-arm counts as missing', () => {
    const missing = sourceOutcomes(row, source({ outcome: undefined, runErrorReason: 'boom' }), true);
    expect(missing.with.status).toBe('errored');
    expect(missing.without?.status).toBe('errored');
    // the with arm is there but the without arm was never stored -> the pair is incomplete
    const half = sourceOutcomes(row, source({ outcome: outcome('c1', true), without: undefined, runErrorReason: 'x' }), true);
    expect(half.with).toMatchObject({ status: 'errored', error_reason: 'x' });
    expect(half.without?.status).toBe('errored');
  });
});

// ---------------------------------------------------------------------------
// small mappers
// ---------------------------------------------------------------------------

describe('toRunningCaseRun / toFrozenCase (AC-48, EC-26)', () => {
  it('AC-48: maps to the contract shape, null when nothing runs', () => {
    expect(toRunningCaseRun(null)).toBeNull();
    expect(toRunningCaseRun({ runId: 'r1', caseId: 'c1' })).toEqual({ run_id: 'r1', case_id: 'c1' });
  });

  it('EC-26: freezes only what a run reviews - id, name, diff, PR title and body, expectation (no pr_number, no repo, no notes)', () => {
    const frozen = toFrozenCase(caseRow({ notes: 'private note' }));
    expect(frozen).toEqual({
      id: 'c1',
      name: 'the-case',
      inputDiff: 'diff --git a/x b/x',
      inputMeta: { title: 'Add rate limiting', body: 'why' },
      expectation: EXP,
    });
  });
});

describe('scope in the run mappers (AC-47, AC-50)', () => {
  const summary: EvalRunSummary = {
    id: 'r',
    agentId: 'a',
    status: 'completed',
    scope: 'case',
    ranAt: new Date('2026-01-01T00:00:00Z'),
    finishedAt: new Date('2026-01-01T00:00:05Z'),
    agentVersion: 2,
    casesTotal: 1,
    casesDone: 1,
    metrics: null,
    durationMs: 5000,
    costUsd: null,
    errorReason: null,
  };

  it('AC-50: toRunRecord carries the scope', () => {
    expect(toRunRecord(summary, 'Agent').scope).toBe('case');
    expect(toRunRecord({ ...summary, scope: 'set' }, 'Agent').scope).toBe('set');
  });

  it('AC-50: summaryFromRow copies the row\'s scope and the one-case counts', () => {
    const row = {
      id: 'r',
      agentId: 'a',
      agentVersion: 2,
      status: 'completed',
      scope: 'case',
      ranAt: summary.ranAt,
      finishedAt: summary.finishedAt,
      caseSet: [{ id: 'c1', name: 'one' }],
      caseResults: [outcome('c1', true)],
      metricParts: null,
      durationMs: 5000,
      costUsd: null,
      errorReason: null,
    } as unknown as AgentRunRow;
    expect(summaryFromRow(row)).toMatchObject({ scope: 'case', casesTotal: 1, casesDone: 1 });
    expect(toRunRecord(summaryFromRow({ ...row, scope: 'set' }), null).scope).toBe('set');
  });

  it('AC-50: the skill record and the skill summary carry the scope', () => {
    const row = {
      id: 'r',
      skillId: 's',
      skillVersion: 1,
      carrierAgentId: 'a',
      carrierName: 'Carrier',
      carrierVersion: 1,
      carrierModel: 'gpt-4.1',
      status: 'completed',
      scope: 'case',
      ranAt: summary.ranAt,
      finishedAt: summary.finishedAt,
      caseSet: [{ id: 'c1', name: 'one' }],
      caseResults: [outcome('c1', true)],
      metricParts: null,
      withoutMetrics: null,
      lift: null,
      durationMs: 1,
      costUsd: null,
      errorReason: null,
    } as unknown as SkillRunRow;
    const s = skillSummaryFromRow(row);
    expect(s.scope).toBe('case');
    expect(toSkillRunRecord(s, 'skill').scope).toBe('case');
    expect(toSkillRunRecord({ ...s, scope: 'set' }, 'skill').scope).toBe('set');
  });
});

describe('latest result findings (AC-22, AC-26, EC-13)', () => {
  it('EC-13: an outcome without `findings` (older document / fixture) maps to findings null, state kept', () => {
    const legacy = { ...outcome('c1', true) } as Partial<EvalCaseOutcome>;
    delete legacy.findings;
    const result = toLatestResult('r', legacy as EvalCaseOutcome);
    expect(result).toMatchObject({ state: 'passed', findings: null });
  });

  it('AC-26: stored findings come back as an array (an empty array is "ran, found nothing", not null)', () => {
    expect(toLatestResult('r', outcome('c1', true))?.findings).toEqual([
      expect.objectContaining({ file: 'src/config.ts', label: expect.any(String) }),
    ]);
    expect(toLatestResult('r', outcome('c1', false))?.findings).toEqual([]);
  });

  it('AC-44: a skill case\'s detail takes state and findings from the with arm and adds the effect', () => {
    const w = outcome('c1', true, { ms: 30, cost: 0.01 });
    const wo = outcome('c1', false, { ms: 70, cost: 0.02 });
    const r = toSkillDetailLatest('r', w, wo);
    expect(r).toMatchObject({ state: 'passed', effect: 'helped', duration_ms: 100 });
    expect(r?.findings).toHaveLength(1);
    expect(toSkillDetailLatest('r', w, undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// EvalService.startCaseRun
// ---------------------------------------------------------------------------

const WS = 'ws-1';
const AGENT = 'agent-1';
const SKILL = 'skill-1';
const CARRIER = 'carrier-1';
const SUT_BODY = 'SUT-BODY: never ship secrets.';
const SECRET_DIFF_TEXT = 'stripeKey: "sk_live_xxx"';
const PR_TITLE = 'Add rate limiting and rotate keys';
const SYSTEM_PROMPT = 'You are a strict internal reviewer.';

const DIFF = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -10,3 +10,4 @@',
  '   port: 3000,',
  `+  ${SECRET_DIFF_TEXT},`,
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

const prompt = (req: unknown) =>
  (req as StructuredRequest<unknown>).messages.map((m) => m.content as string).join('\n');

class ArmLLM extends MockLLMProvider {
  entered = 0;
  failOn: (callNo: number) => boolean = () => false;
  noCost = false;
  constructor() {
    super('openai');
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const callNo = ++this.entered;
    this.calls.push({ method: 'completeStructured', req });
    if (this.failOn(callNo)) throw new Error(`provider boom ${callNo}`);
    const hasSkill = prompt(req).includes(SUT_BODY);
    const res = await new MockLLMProvider('openai', { structured: hasSkill ? REVIEW : NO_FINDINGS }).completeStructured<T>(req);
    return this.noCost ? { ...res, costUsd: null } : res;
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
  /** The stored case; `null` = no such case. */
  row?: EvalCaseRow | null;
  agentEnabled?: boolean;
  carrierExists?: boolean;
  carriers?: { agentId: string; name: string; version: number; model: string; enabled: boolean; linkEnabled: boolean }[];
  /** `isRunning` answers true for this many checks, then false (the owner was deleted). */
  runningChecks?: number;
}

function makeWorld(o: WorldOpts = {}) {
  const row = 'row' in o ? o.row : caseRow();
  const llm = new ArmLLM();
  const finalized = deferred<{ values: Record<string, unknown>; results?: { with: EvalCaseOutcome[]; without: EvalCaseOutcome[] } }>();
  let checks = 0;
  const links: CarrierLink[] = [
    { skillId: SKILL, name: 'sut-skill', body: SUT_BODY, order: 0, linkEnabled: true, skillEnabled: true },
  ];

  const progress: EvalCaseOutcome[][] = [];
  const repo = {
    getCase: vi.fn(async (_ws: string, id: string) => (row && row.id === id ? row : undefined)),
    casesForRun: vi.fn(async () => {
      throw new Error('a case run must not read the owner\'s whole set');
    }),
    insertRun: vi.fn(async (_values: unknown) => 'run-1'),
    insertSkillRun: vi.fn(async (_values: unknown) => 'run-1'),
    skillForRun: vi.fn(async (_ws: string, id: string) =>
      id === SKILL ? { id: SKILL, name: 'sut-skill', body: SUT_BODY, version: 3, enabled: true } : undefined,
    ),
    carriersForSkill: vi.fn(
      async () =>
        o.carriers ?? [{ agentId: CARRIER, name: 'Carrier', version: 2, model: 'gpt-4.1', enabled: true, linkEnabled: true }],
    ),
    carrierLinks: vi.fn(async () => links),
    isRunning: vi.fn(async () => {
      checks++;
      return o.runningChecks === undefined || checks <= o.runningChecks;
    }),
    saveProgress: vi.fn(async (_ws: string, _id: string, outcomes: EvalCaseOutcome[]) => {
      progress.push(outcomes);
      return true;
    }),
    saveSkillProgress: vi.fn(async () => true),
    finalizeRun: vi.fn(async (_ws: string, _id: string, values: Record<string, unknown>) => {
      finalized.resolve({ values });
      return true;
    }),
    finalizeSkillRun: vi.fn(
      async (_ws: string, _id: string, values: Record<string, unknown>, results?: { with: EvalCaseOutcome[]; without: EvalCaseOutcome[] }) => {
        finalized.resolve({ values, results });
        return true;
      },
    ),
  };

  const agentRow = (id: string) => ({
    id,
    name: id === CARRIER ? 'Carrier' : 'Owner agent',
    version: 2,
    provider: 'openai',
    model: 'gpt-4.1',
    strategy: 'single-pass',
    systemPrompt: SYSTEM_PROMPT,
    enabled: o.agentEnabled !== false,
  });
  const container = {
    evalRepo: repo,
    agentsRepo: {
      getById: vi.fn(async (_ws: string, id: string) =>
        (id === AGENT || id === CARRIER) && (id !== CARRIER || o.carrierExists !== false) ? agentRow(id) : undefined,
      ),
      enabledSkillsForPrompt: vi.fn(async () => []),
    },
    llm: vi.fn(async () => llm),
  };
  const logger: EvalLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const service = new EvalService(container as unknown as Container);
  return { service, repo: repo as unknown as EvalRepository & typeof repo, llm, logger, finalized, progress };
}

const skillCase = () =>
  caseRow({
    ownerKind: 'skill',
    ownerId: SKILL,
    inputDiff: DIFF,
    inputMeta: { pr_number: null, repo_full_name: null, title: PR_TITLE, body: null },
  });
const agentCase = () =>
  caseRow({ inputDiff: DIFF, inputMeta: { pr_number: null, repo_full_name: null, title: PR_TITLE, body: null } });

describe('EvalService.startCaseRun (SPEC-10)', () => {
  describe('rejections - nothing is started', () => {
    const expectNothingStarted = (w: ReturnType<typeof makeWorld>) => {
      expect(w.repo.insertRun).not.toHaveBeenCalled();
      expect(w.repo.insertSkillRun).not.toHaveBeenCalled();
      expect(w.llm.calls).toHaveLength(0);
    };

    it('404 for an unknown case', async () => {
      const w = makeWorld({ row: null });
      await expect(w.service.startCaseRun(WS, 'ghost', undefined, w.logger)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Eval case not found',
      });
      expectNothingStarted(w);
    });

    it('422 validation_error for a skill-owned case with no carrier (EC-19 path), 404 for an unknown carrier, 422 no_agent_linked for an unlinked one', async () => {
      let w = makeWorld({ row: skillCase() });
      await expect(w.service.startCaseRun(WS, 'c1', undefined, w.logger)).rejects.toMatchObject({
        statusCode: 422,
        code: 'validation_error',
      });
      expectNothingStarted(w);

      w = makeWorld({ row: skillCase(), carrierExists: false });
      await expect(w.service.startCaseRun(WS, 'c1', CARRIER, w.logger)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Agent not found',
      });
      expectNothingStarted(w);

      w = makeWorld({ row: skillCase(), carriers: [] });
      await expect(w.service.startCaseRun(WS, 'c1', CARRIER, w.logger)).rejects.toMatchObject({
        statusCode: 422,
        code: 'no_agent_linked',
      });
      expectNothingStarted(w);
    });

    it('a deleted owner agent is a 404 and starts nothing', async () => {
      const w = makeWorld({ row: caseRow({ ownerId: 'gone-agent' }) });
      await expect(w.service.startCaseRun(WS, 'c1', undefined, w.logger)).rejects.toMatchObject({ statusCode: 404 });
      expectNothingStarted(w);
    });
  });

  describe('agent-owned case', () => {
    it('AC-36/AC-35/NFR-2: inserts scope "case" with a one-case case_set, answers before any review, reviews exactly once', async () => {
      const w = makeWorld({ row: agentCase() });
      const start = await w.service.startCaseRun(WS, 'c1', undefined, w.logger);
      expect(start).toEqual({ id: 'run-1', status: 'running' });

      const insert = w.repo.insertRun.mock.calls[0]![0] as unknown as { scope: string; caseSet: unknown[]; agentId: string };
      expect(insert).toMatchObject({ scope: 'case', agentId: AGENT, caseSet: [{ id: 'c1', name: 'the-case' }] });
      // the owner's whole set is never read; the one case is the frozen row read at start (EC-26)
      expect(w.repo.casesForRun).not.toHaveBeenCalled();

      const { values } = await w.finalized.promise;
      expect(w.llm.entered).toBe(1);
      expect(values).toMatchObject({ status: 'completed', errorReason: null });
      expect(w.progress).toHaveLength(1);
    });

    it('EC-30: a disabled agent still runs its case', async () => {
      const w = makeWorld({ row: agentCase(), agentEnabled: false });
      await expect(w.service.startCaseRun(WS, 'c1', undefined, w.logger)).resolves.toMatchObject({ status: 'running' });
      const { values } = await w.finalized.promise;
      expect(values.status).toBe('completed');
    });

    it('AC-38/EC-21: a failing review finishes the run errored with the reason, no metrics and a null cost', async () => {
      const w = makeWorld({ row: agentCase() });
      w.llm.failOn = () => true;
      await w.service.startCaseRun(WS, 'c1', undefined, w.logger);
      const { values } = await w.finalized.promise;
      expect(values).toMatchObject({ status: 'errored', metrics: null, costUsd: null, errorReason: 'provider boom 1' });
    });

    it('EC-25: an unpriced model stores a null cost, never 0', async () => {
      const w = makeWorld({ row: agentCase() });
      w.llm.noCost = true;
      await w.service.startCaseRun(WS, 'c1', undefined, w.logger);
      const { values } = await w.finalized.promise;
      expect(values).toMatchObject({ status: 'completed', costUsd: null });
    });

    it('NFR-12: start and finish log lines carry run id, owner, case id, scope, status and duration - never the diff, PR title, prompt or finding text', async () => {
      const w = makeWorld({ row: agentCase() });
      await w.service.startCaseRun(WS, 'c1', undefined, w.logger);
      await w.finalized.promise;
      await vi.waitFor(() => expect(w.logger.info).toHaveBeenCalledWith(expect.anything(), LOG.runFinished));

      const started = (w.logger.info as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1] === LOG.runStarted)![0];
      expect(started).toMatchObject({ runId: 'run-1', ownerKind: 'agent', agentId: AGENT, caseId: 'c1', scope: 'case' });
      const finished = (w.logger.info as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1] === LOG.runFinished)![0];
      expect(finished).toMatchObject({ scope: 'case', status: 'completed', durationMs: expect.any(Number) });

      const logged = JSON.stringify([
        ...(w.logger.info as ReturnType<typeof vi.fn>).mock.calls,
        ...(w.logger.error as ReturnType<typeof vi.fn>).mock.calls,
      ]);
      for (const secret of [SECRET_DIFF_TEXT, 'sk_live_xxx', PR_TITLE, SYSTEM_PROMPT, 'Hardcoded Stripe key', 'src/config.ts']) {
        expect(logged).not.toContain(secret);
      }
    });
  });

  describe('skill-owned case', () => {
    it('AC-36/NFR-2: inserts scope "case" with a one-case case_set and reviews exactly twice (with arm, then without arm)', async () => {
      const w = makeWorld({ row: skillCase() });
      const start = await w.service.startCaseRun(WS, 'c1', CARRIER, w.logger);
      expect(start).toEqual({ id: 'run-1', status: 'running' });

      const insert = w.repo.insertSkillRun.mock.calls[0]![0] as unknown as {
        scope: string;
        caseSet: unknown[];
        skillId: string;
        carrier: { agentId: string };
      };
      expect(insert).toMatchObject({ scope: 'case', skillId: SKILL, carrier: { agentId: CARRIER }, caseSet: [{ id: 'c1', name: 'the-case' }] });
      expect(w.repo.casesForRun).not.toHaveBeenCalled();

      const { values, results } = await w.finalized.promise;
      expect(w.llm.entered).toBe(2);
      expect(w.llm.calls.map((c) => prompt(c.req).includes(SUT_BODY))).toEqual([true, false]);
      // AC-38: one case -> completed (never partial); both arms stored
      expect(values).toMatchObject({ status: 'completed', casesErrored: 0 });
      expect(results!.with).toHaveLength(1);
      expect(results!.without).toHaveLength(1);
    });

    it('AC-38/EC-21: an arm that fails errors the single case in both arms and the run is errored with the reason (never partial)', async () => {
      const w = makeWorld({ row: skillCase() });
      w.llm.failOn = (n) => n === 2;
      await w.service.startCaseRun(WS, 'c1', CARRIER, w.logger);
      const { values, results } = await w.finalized.promise;
      expect(values).toMatchObject({
        status: 'errored',
        withMetrics: null,
        withoutMetrics: null,
        lift: null,
        costUsd: null,
        errorReason: 'provider boom 2',
      });
      expect(results!.with[0]).toMatchObject({ status: 'errored', error_reason: 'provider boom 2' });
      expect(results!.without[0]).toMatchObject({ status: 'errored' });
    });

    it('EC-27: the skill deleted after the first arm - no second-arm call, no write, no error log', async () => {
      const w = makeWorld({ row: skillCase(), runningChecks: 1 }); // first check passes, the one between the arms does not
      await w.service.startCaseRun(WS, 'c1', CARRIER, w.logger);
      await vi.waitFor(() => expect(w.logger.info).toHaveBeenCalledWith(expect.anything(), LOG.skillRunAborted));

      expect(w.llm.entered).toBe(1);
      expect(w.repo.saveSkillProgress).not.toHaveBeenCalled();
      expect(w.repo.finalizeSkillRun).not.toHaveBeenCalled();
      expect(w.logger.error).not.toHaveBeenCalled();
    });

    it('NFR-12: log lines carry case id and scope and never the skill body, diff, PR title or prompt', async () => {
      const w = makeWorld({ row: skillCase() });
      await w.service.startCaseRun(WS, 'c1', CARRIER, w.logger);
      await w.finalized.promise;
      await vi.waitFor(() => expect(w.logger.info).toHaveBeenCalledWith(expect.anything(), LOG.skillRunFinished));

      const started = (w.logger.info as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[1] === LOG.skillRunStarted)![0];
      expect(started).toMatchObject({ runId: 'run-1', ownerKind: 'skill', skillId: SKILL, carrierAgentId: CARRIER, caseId: 'c1', scope: 'case' });
      const logged = JSON.stringify([
        ...(w.logger.info as ReturnType<typeof vi.fn>).mock.calls,
        ...(w.logger.error as ReturnType<typeof vi.fn>).mock.calls,
      ]);
      for (const secret of [SUT_BODY, SECRET_DIFF_TEXT, PR_TITLE, SYSTEM_PROMPT, 'Hardcoded Stripe key']) {
        expect(logged).not.toContain(secret);
      }
    });

    it('a run that crashes mid-way (DB error) is finalized errored with the reason - never left running', async () => {
      const w = makeWorld({ row: skillCase() });
      w.repo.saveSkillProgress.mockRejectedValueOnce(new Error('db went away'));
      await w.service.startCaseRun(WS, 'c1', CARRIER, w.logger);
      const { values } = await w.finalized.promise;
      expect(values).toMatchObject({ status: 'errored', errorReason: 'db went away' });
      expect(w.logger.error).toHaveBeenCalled();
    });
  });
});

// An errored placeholder built by the merge is a real `errored` outcome the mappers accept (EC-21, AC-43).
describe('errored placeholder through the mappers (EC-21)', () => {
  it('a reaped case run surfaces as an errored latest result with the run\'s reason and no findings', () => {
    const placeholder = sourceOutcomes(
      { id: 'c1', name: 'the-case', expectedOutput: EXP },
      source({ scope: 'case', outcome: undefined, runErrorReason: 'interrupted', runDurationMs: 40 }),
      false,
    ).with;
    expect(toLatestResult('run-9', placeholder)).toMatchObject({
      run_id: 'run-9',
      state: 'errored',
      error_reason: 'interrupted',
      expected_count: null,
      got_count: null,
      duration_ms: 40,
      findings: [],
    });
    expect(errorCaseOutcome('c1', 'x', 'must_find', 'r', 1).status).toBe('errored');
  });
});
