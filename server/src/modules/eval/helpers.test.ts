import { describe, it, expect } from 'vitest';
import type { EvalCaseOutcome, EvalMetrics } from '@devdigest/shared';
import { EVAL_ERROR, EVAL_TASK_LINE, ERROR_REASON_MAX } from './constants.js';
import {
  buildManualMeta,
  classifyEdit,
  effectiveExpectation,
  evalError,
  evalTaskLine,
  expectationTypeFor,
  finalStatus,
  firstErrorReason,
  hasUpdateFields,
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
    const f = { file: 'a.ts', start_line: 1, end_line: 1, title: 't', severity: 'SUGGESTION', category: 'bug' };
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
      cost_usd: null,
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

  it('EC-27: carries the stored cost; a missing price stays null, never 0', () => {
    expect(toTrendPoint({ ...run(null), costUsd: 0.0123 }).cost_usd).toBe(0.0123);
    expect(toTrendPoint({ ...run(null), costUsd: null }).cost_usd).toBeNull();
    expect(toTrendPoint({ ...run(null), costUsd: 0 }).cost_usd).toBe(0);
  });
});

// ---- SPEC-09 Case Editor ---------------------------------------------------------

describe('classifyEdit (AC-14, AC-15, EC-6, EC-41)', () => {
  const DIFF = [
    'diff --git a/src/config.ts b/src/config.ts',
    '--- a/src/config.ts',
    '+++ b/src/config.ts',
    '@@ -10,3 +10,4 @@',
    '   port: 3000,',
    '+  stripeKey: "sk_live_xxx",',
    '   redisUrl: x,',
  ].join('\n');
  const exp = {
    type: 'must_find' as const,
    file: 'src/config.ts',
    start_line: 11,
    end_line: 11,
    severity: 'CRITICAL' as const,
    category: 'security' as const,
  };
  const manual = {
    inputDiff: DIFF,
    inputMeta: { pr_number: null, repo_full_name: null, title: 'Add key', body: 'why' },
    expectedOutput: { ...exp, title: null },
    sourceFindingId: null,
  };
  const fromFinding = { ...manual, sourceFindingId: 'finding-1' };
  const meta = { title: 'Add key', body: 'why' };

  it('AC-14: name / notes alone are in place, for both manual and finding cases', () => {
    expect(classifyEdit(manual, { name: 'renamed' })).toBe('in_place');
    expect(classifyEdit(manual, { notes: 'n' })).toBe('in_place');
    expect(classifyEdit(fromFinding, { name: 'renamed', notes: 'n' })).toBe('in_place');
  });

  it('AC-14: severity / category changes on a manual case stay in place', () => {
    expect(classifyEdit(manual, { expectation: { ...exp, severity: 'SUGGESTION' } })).toBe('in_place');
    expect(classifyEdit(manual, { expectation: { ...exp, category: 'bug' } })).toBe('in_place');
  });

  it('AC-14: unchanged fields echoed back by the client do not count as an edit', () => {
    const echoed = {
      name: 'x',
      input_diff: DIFF,
      input_meta: meta,
      expectation: exp,
    };
    expect(classifyEdit(manual, echoed)).toBe('in_place');
    // a null body and an empty-string body are the same thing
    expect(classifyEdit({ ...manual, inputMeta: { ...manual.inputMeta, body: null } }, { input_meta: { title: 'Add key', body: '' } })).toBe('in_place');
    // CRLF paste of the stored diff is not a change (AC-46)
    expect(classifyEdit(manual, { input_diff: DIFF.replace(/\n/g, '\r\n') })).toBe('in_place');
  });

  it('AC-15: a changed diff, file, lines, type, title or description replaces a manual case', () => {
    expect(classifyEdit(manual, { input_diff: DIFF.replace('sk_live_xxx', 'sk_live_yyy') })).toBe('replace');
    expect(classifyEdit(manual, { expectation: { ...exp, file: 'src/other.ts' } })).toBe('replace');
    expect(classifyEdit(manual, { expectation: { ...exp, start_line: 10 } })).toBe('replace');
    expect(classifyEdit(manual, { expectation: { ...exp, end_line: 12 } })).toBe('replace');
    expect(classifyEdit(manual, { expectation: { ...exp, type: 'must_not_flag', severity: null, category: null } })).toBe('replace');
    expect(classifyEdit(manual, { input_meta: { ...meta, title: 'New title' } })).toBe('replace');
    expect(classifyEdit(manual, { input_meta: { ...meta, body: 'other' } })).toBe('replace');
  });

  it('AC-15: a replacing field mixed with name / notes is still a replace', () => {
    expect(classifyEdit(manual, { name: 'n', expectation: { ...exp, end_line: 13 } })).toBe('replace');
  });

  it('EC-6: any input or qualifier change on a finding-derived case is locked', () => {
    expect(classifyEdit(fromFinding, { input_diff: DIFF.replace('sk_live_xxx', 'sk_live_yyy') })).toBe('locked');
    expect(classifyEdit(fromFinding, { expectation: { ...exp, file: 'src/other.ts' } })).toBe('locked');
    expect(classifyEdit(fromFinding, { expectation: { ...exp, start_line: 10 } })).toBe('locked');
    expect(classifyEdit(fromFinding, { input_meta: { ...meta, title: 'New title' } })).toBe('locked');
    expect(classifyEdit(fromFinding, { expectation: { ...exp, severity: 'SUGGESTION' } })).toBe('locked');
    expect(classifyEdit(fromFinding, { expectation: { ...exp, category: 'bug' } })).toBe('locked');
  });

  it('EC-6: echoing a finding-derived case unchanged (plus a rename) is allowed', () => {
    expect(
      classifyEdit(fromFinding, { name: 'new', notes: 'n', input_diff: DIFF, input_meta: meta, expectation: exp }),
    ).toBe('in_place');
  });

  it('EC-41: a must_not_flag case stores null severity/category; undefined and null echoes are equal', () => {
    const notFlag = {
      ...fromFinding,
      expectedOutput: { type: 'must_not_flag' as const, file: 'src/config.ts', start_line: 11, end_line: 11, severity: null, category: null, title: null },
    };
    const echo = { type: 'must_not_flag' as const, file: 'src/config.ts', start_line: 11, end_line: 11 };
    expect(classifyEdit(notFlag, { expectation: echo })).toBe('in_place');
    expect(classifyEdit(notFlag, { expectation: { ...echo, severity: null, category: null } })).toBe('in_place');
    expect(classifyEdit(notFlag, { expectation: { ...echo, severity: 'SUGGESTION' } })).toBe('locked');
  });
});

describe('effectiveExpectation (EC-41)', () => {
  const base = { file: 'a.ts', start_line: 1, end_line: 2 };

  it('EC-41: must_find keeps severity and category', () => {
    expect(effectiveExpectation({ ...base, type: 'must_find', severity: 'WARNING', category: 'bug' })).toMatchObject({
      type: 'must_find',
      severity: 'WARNING',
      category: 'bug',
      title: null,
    });
  });

  it('EC-41: must_find without them stores nulls', () => {
    expect(effectiveExpectation({ ...base, type: 'must_find' })).toMatchObject({ severity: null, category: null });
  });

  it('EC-41: must_not_flag drops severity and category to null even when supplied', () => {
    expect(effectiveExpectation({ ...base, type: 'must_not_flag', severity: 'CRITICAL', category: 'security' })).toMatchObject({
      type: 'must_not_flag',
      severity: null,
      category: null,
    });
  });
});

describe('buildManualMeta (AC-11)', () => {
  it('AC-11: a manual case has no PR; an empty description is stored as null', () => {
    expect(buildManualMeta({ title: 'T', body: '' })).toEqual({ pr_number: null, repo_full_name: null, title: 'T', body: null });
    expect(buildManualMeta({ title: 'T', body: 'why' }).body).toBe('why');
    expect(buildManualMeta({ title: 'T' }).body).toBeNull();
  });
});

describe('hasUpdateFields (AC-14)', () => {
  it('AC-14: an empty body has nothing to update; any defined key counts (even a null notes)', () => {
    expect(hasUpdateFields({})).toBe(false);
    expect(hasUpdateFields({ name: undefined })).toBe(false);
    expect(hasUpdateFields({ name: 'x' })).toBe(true);
    expect(hasUpdateFields({ notes: null })).toBe(true);
  });
});
