import { describe, it, expect } from 'vitest';
import type { EvalCaseOutcome, EvalMetrics } from '@devdigest/shared';
import { EVAL_ERROR, EVAL_TASK_LINE, ERROR_REASON_MAX } from './constants.js';
import {
  evalError,
  evalTaskLine,
  expectationTypeFor,
  finalStatus,
  firstErrorReason,
  isUniqueViolation,
  slugify,
  toErrorReason,
  toLatestResult,
  toTrendPoint,
  uniqueCaseName,
} from './helpers.js';
import { errorCaseOutcome, scoreCase, scoreRun } from './scoring.js';
import type { EvalRunSummary } from './types.js';

/** SPEC-08 pure helpers — no DB, no container, no LLM. */

describe('slugify (AC-6, UI-6)', () => {
  it('AC-6: lowercase a-z, 0-9 and "-" only', () => {
    expect(slugify('Hardcoded Stripe Key (sk_live_xxx)!')).toBe('hardcoded-stripe-key-sk-live-xxx');
    expect(slugify('  --Leading & trailing--  ')).toBe('leading-trailing');
    expect(slugify('Ünïcode → <script>alert(1)</script>')).toMatch(/^[a-z0-9-]+$/);
  });

  it('AC-6: cut to at most 60 characters, with no trailing dash left by the cut', () => {
    const long = `${'a'.repeat(59)} bbbbbbbb`; // dash lands at index 59, cut at 60
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
    expect(slugify('x'.repeat(200))).toHaveLength(60);
  });

  it('AC-6: an empty slug falls back to eval-case', () => {
    expect(slugify('')).toBe('eval-case');
    expect(slugify('!!! ???')).toBe('eval-case');
    expect(slugify('日本語')).toBe('eval-case');
  });
});

describe('uniqueCaseName (AC-6)', () => {
  it('returns the base when it is free', () => {
    expect(uniqueCaseName('hardcoded-key', ['other'])).toBe('hardcoded-key');
  });

  it('AC-6: appends -2, -3, … when the name is taken', () => {
    expect(uniqueCaseName('k', ['k'])).toBe('k-2');
    expect(uniqueCaseName('k', ['k', 'k-2'])).toBe('k-3');
    expect(uniqueCaseName('k', ['k', 'k-3'])).toBe('k-2'); // first free number
  });

  it('AC-6: the suffix is added AFTER the 60-char cut, so the name may exceed 60 by the suffix only', () => {
    const base = slugify('y'.repeat(100));
    expect(base).toHaveLength(60);
    expect(uniqueCaseName(base, [base])).toBe(`${base}-2`);
  });
});

describe('expectationTypeFor (AC-2, AC-3, EC-1, EC-7)', () => {
  const t1 = new Date('2026-01-01T00:00:00Z');
  const t2 = new Date('2026-01-02T00:00:00Z');

  it('AC-2/AC-3: accepted → must_find, dismissed → must_not_flag', () => {
    expect(expectationTypeFor(t1, null)).toBe('must_find');
    expect(expectationTypeFor(null, t1)).toBe('must_not_flag');
  });

  it('EC-1: neither → null (finding_undecided upstream)', () => {
    expect(expectationTypeFor(null, null)).toBeNull();
  });

  it('both set → the later decision wins', () => {
    expect(expectationTypeFor(t2, t1)).toBe('must_find');
    expect(expectationTypeFor(t1, t2)).toBe('must_not_flag');
  });
});

describe('evalTaskLine (UI-2)', () => {
  it('builds the task line from the frozen title and the author-free guidance', () => {
    const line = evalTaskLine('Add rate limiting');
    expect(line).toBe(`Review pull request "Add rate limiting". ${EVAL_TASK_LINE}`);
    expect(line.toLowerCase()).not.toContain('author');
  });
});

describe('errors', () => {
  it('evalError carries the code, status and details', () => {
    const e = evalError(EVAL_ERROR.runInProgress, 409, { run_id: 'r1' });
    expect(e).toMatchObject({
      code: 'eval_run_in_progress',
      statusCode: 409,
      details: { run_id: 'r1' },
    });
    expect(e.message.length).toBeGreaterThan(0);
  });

  it('isUniqueViolation recognises a Postgres 23505 however the driver wraps it', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(new Error('x'))).toBe(false);
  });

  it('toErrorReason is a single line, capped, with a fallback', () => {
    expect(toErrorReason(new Error('a\n  b\tc'), 'fb')).toBe('a b c');
    expect(toErrorReason('not an error', 'fb')).toBe('fb');
    expect(toErrorReason(new Error(''), 'fb')).toBe('fb');
    const long = toErrorReason(new Error('x'.repeat(ERROR_REASON_MAX + 50)), 'fb');
    expect(long.length).toBe(ERROR_REASON_MAX + 1); // cap + ellipsis
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('run finalisation (AC-24, EC-13)', () => {
  const metrics = (over: Partial<EvalMetrics>): EvalMetrics => ({
    ...scoreRun([]),
    ...over,
  });

  it('AC-24: completed when nothing errored, partial when some case errored', () => {
    expect(finalStatus(metrics({ traces_total: 3, cases_errored: 0 }))).toBe('completed');
    expect(finalStatus(metrics({ traces_total: 3, cases_errored: 1 }))).toBe('partial');
  });

  it('EC-13: errored when nothing could be scored; the first errored case supplies the reason', () => {
    expect(finalStatus(metrics({ traces_total: 0, cases_errored: 2 }))).toBe('errored');
    const outcomes = [
      errorCaseOutcome('1', 'one', 'must_find', 'first reason', 1),
      errorCaseOutcome('2', 'two', 'must_find', 'second reason', 1),
    ];
    expect(firstErrorReason(outcomes)).toBe('first reason');
    expect(firstErrorReason([])).toBeNull();
  });
});

describe('toLatestResult (AC-12)', () => {
  const exp = { type: 'must_find' as const, file: 'a.ts', start_line: 1, end_line: 2 };
  const base = {
    caseId: 'c',
    name: 'c',
    expectation: exp,
    groundingKept: 0,
    groundingTotal: 0,
    durationMs: 12,
    costUsd: 0.1,
  };

  it('is null when the case was not in the run ("never run")', () => {
    expect(toLatestResult('r', undefined)).toBeNull();
  });

  it('maps passed / failed / errored with counts, duration, cost and reason', () => {
    const f = { file: 'a.ts', start_line: 1, end_line: 1, title: 't', severity: 'INFO', category: 'bug' };
    const passed = toLatestResult('r', scoreCase({ ...base, findings: [f] }));
    expect(passed).toMatchObject({ run_id: 'r', state: 'passed', expected_count: 1, got_count: 1, duration_ms: 12 });
    const failed = toLatestResult('r', scoreCase({ ...base, findings: [] }));
    expect(failed).toMatchObject({ state: 'failed', expected_count: 1, got_count: 0 });
    const errored = toLatestResult('r', errorCaseOutcome('c', 'c', 'must_find', 'boom', 3) as EvalCaseOutcome);
    expect(errored).toMatchObject({ state: 'errored', expected_count: null, got_count: null, error_reason: 'boom' });
  });
});

describe('toTrendPoint (EC-36)', () => {
  const run = (metrics: EvalMetrics | null): EvalRunSummary => ({
    id: 'r',
    agentId: 'a',
    status: 'completed',
    ranAt: new Date('2026-01-01T00:00:00Z'),
    finishedAt: new Date('2026-01-01T00:01:00Z'),
    agentVersion: 3,
    casesTotal: 1,
    casesDone: 1,
    metrics,
    durationMs: 1,
    costUsd: null,
    errorReason: null,
  });

  it('EC-36: a null metric is a gap (null), never 0', () => {
    expect(toTrendPoint(run(null))).toEqual({
      run_id: 'r',
      ran_at: '2026-01-01T00:00:00.000Z',
      agent_version: 3,
      recall: null,
      precision: null,
      citation_accuracy: null,
    });
    // zero-denominator metrics are null too
    const p = toTrendPoint(run(scoreRun([])));
    expect([p.recall, p.precision, p.citation_accuracy]).toEqual([null, null, null]);
  });

  it('carries real values through, including a genuine 0', () => {
    const m = { ...scoreRun([]), recall: { value: 0, num: 0, den: 2 }, precision: { value: 0.5, num: 1, den: 2 } };
    const p = toTrendPoint(run(m));
    expect(p.recall).toBe(0);
    expect(p.precision).toBe(0.5);
  });
});
