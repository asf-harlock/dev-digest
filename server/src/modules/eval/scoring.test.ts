import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { EvalCaseOutcome, EvalExpectation } from '@devdigest/shared';
import {
  errorCaseOutcome,
  labelFinding,
  matches,
  ratio,
  runCost,
  scoreCase,
  scoreCommon,
  scoreRun,
  type ScoredFinding,
} from './scoring.js';

/**
 * SPEC-08 scoring — pure functions, no DB, no LLM (NFR-1). Fixtures use only
 * placeholder data (NFR-14).
 */

const FILE = 'src/config.ts';

const finding = (start: number, end = start, file = FILE): ScoredFinding => ({
  file,
  start_line: start,
  end_line: end,
  title: 'Hardcoded key sk_live_xxx',
  severity: 'CRITICAL',
  category: 'security',
});

const mustFind = (start: number, end = start): EvalExpectation => ({
  type: 'must_find',
  file: FILE,
  start_line: start,
  end_line: end,
});
const mustNotFlag = (start: number, end = start): EvalExpectation => ({
  type: 'must_not_flag',
  file: FILE,
  start_line: start,
  end_line: end,
});

function scored(
  caseId: string,
  expectation: EvalExpectation,
  findings: ScoredFinding[],
  grounding: { kept?: number; total?: number } = {},
  costUsd: number | null = 0.01,
): EvalCaseOutcome {
  return scoreCase({
    caseId,
    name: caseId,
    expectation,
    findings,
    groundingKept: grounding.kept ?? findings.length,
    groundingTotal: grounding.total ?? findings.length,
    durationMs: 10,
    costUsd,
  });
}

describe('matches — file equality + strict inclusive overlap (no tolerance window)', () => {
  it('AC-27: overlap is inclusive at both ends', () => {
    expect(matches(finding(10, 12), mustFind(12, 20))).toBe(true); // touches at 12
    expect(matches(finding(20, 25), mustFind(12, 20))).toBe(true); // touches at 20
    expect(matches(finding(15, 15), mustFind(12, 20))).toBe(true); // contained
    expect(matches(finding(1, 100), mustFind(12, 20))).toBe(true); // containing
  });

  it('AC-27: one line off is NOT a match (no ±N window)', () => {
    expect(matches(finding(10, 11), mustFind(12, 20))).toBe(false);
    expect(matches(finding(21, 30), mustFind(12, 20))).toBe(false);
  });

  it('AC-27: a different file never matches, even on identical lines', () => {
    expect(matches(finding(12, 20, 'src/other.ts'), mustFind(12, 20))).toBe(false);
    // exact equality — a path suffix is not the same file
    expect(matches(finding(12, 20, 'a/src/config.ts'), mustFind(12, 20))).toBe(false);
  });

  it('AC-27: a reversed range (end < start) is normalised, not treated as empty', () => {
    expect(matches(finding(20, 12), mustFind(15, 15))).toBe(true);
  });
});

describe('labelFinding / scoreCase', () => {
  it('AC-29: TP when overlapping a must_find, FP when overlapping a must_not_flag, else unlabeled', () => {
    expect(labelFinding(finding(11), mustFind(10, 12))).toBe('tp');
    expect(labelFinding(finding(11), mustNotFlag(10, 12))).toBe('fp');
    expect(labelFinding(finding(50), mustFind(10, 12))).toBe('unlabeled');
    expect(labelFinding(finding(50), mustNotFlag(10, 12))).toBe('unlabeled');
  });

  it('AC-27: must_find passes on >= 1 overlapping kept finding, fails on none', () => {
    const pass = scored('c1', mustFind(10, 12), [finding(11), finding(99)]);
    expect(pass).toMatchObject({ status: 'scored', pass: true, expected_count: 1, got_count: 1 });
    expect(pass.findings.map((f) => f.label)).toEqual(['tp', 'unlabeled']);

    const fail = scored('c2', mustFind(10, 12), [finding(99)]);
    expect(fail).toMatchObject({ pass: false, expected_count: 1, got_count: 0 });

    const none = scored('c3', mustFind(10, 12), []);
    expect(none).toMatchObject({ pass: false, got_count: 0 });
  });

  it('AC-28: must_not_flag passes only when nothing overlaps', () => {
    const pass = scored('c1', mustNotFlag(10, 12), [finding(99)]);
    expect(pass).toMatchObject({ pass: true, expected_count: 0, got_count: 0 });

    const empty = scored('c2', mustNotFlag(10, 12), []);
    expect(empty.pass).toBe(true);

    const fail = scored('c3', mustNotFlag(10, 12), [finding(11), finding(12)]);
    expect(fail).toMatchObject({ pass: false, expected_count: 0, got_count: 2 });
    expect(fail.findings.every((f) => f.label === 'fp')).toBe(true);
  });

  it('AC-29: a finding overlapping both a must_find and a must_not_flag region is judged only against its own case', () => {
    // The same finding (lines 10-20) lands in two different cases: one expects the
    // region 10-12 (must_find), the other forbids 18-20 (must_not_flag). Each case
    // sees it against its OWN expectation only, so it is a TP in one and an FP in
    // the other — never double-labelled within a case.
    const f = finding(10, 20);
    const inFindCase = scored('find', mustFind(10, 12), [f]);
    const inForbidCase = scored('forbid', mustNotFlag(18, 20), [f]);
    expect(inFindCase.findings).toHaveLength(1);
    expect(inFindCase.findings[0]!.label).toBe('tp');
    expect(inForbidCase.findings).toHaveLength(1);
    expect(inForbidCase.findings[0]!.label).toBe('fp');

    const m = scoreRun([inFindCase, inForbidCase]);
    expect(m.tp).toBe(1);
    expect(m.fp).toBe(1);
    expect(m.unlabeled).toBe(0);
    expect(m.tp + m.fp + m.unlabeled).toBe(2); // exactly one label per kept finding
  });

  it('AC-23: the outcome keeps grounding counts, duration and cost', () => {
    const o = scoreCase({
      caseId: 'c',
      name: 'n',
      expectation: mustFind(1, 2),
      findings: [finding(1)],
      groundingKept: 1,
      groundingTotal: 3,
      durationMs: 42,
      costUsd: 0.5,
    });
    expect(o).toMatchObject({
      grounding_kept: 1,
      grounding_total: 3,
      duration_ms: 42,
      cost_usd: 0.5,
      error_reason: null,
    });
  });
});

describe('ratio / zero denominators (EC-19)', () => {
  it('EC-19: a ratio with denominator 0 is null, never 0 or 1', () => {
    expect(ratio(0, 0)).toEqual({ value: null, num: 0, den: 0 });
    expect(ratio(5, 0).value).toBeNull();
    expect(ratio(1, 2)).toEqual({ value: 0.5, num: 1, den: 2 });
    expect(ratio(0, 3).value).toBe(0); // a real zero is still 0
  });

  it('EC-19: no outcomes at all → every metric null, counts zero', () => {
    const m = scoreRun([]);
    expect(m.recall.value).toBeNull();
    expect(m.precision.value).toBeNull();
    expect(m.citation_accuracy.value).toBeNull();
    expect(m).toMatchObject({ tp: 0, fp: 0, unlabeled: 0, traces_passed: 0, traces_total: 0 });
  });

  it('EC-19: no must_find case → recall null; precision/citation still computed', () => {
    const m = scoreRun([scored('a', mustNotFlag(1, 2), [finding(50)])]);
    expect(m.recall).toEqual({ value: null, num: 0, den: 0 });
    expect(m.precision).toEqual({ value: 1, num: 1, den: 1 });
    expect(m.citation_accuracy.value).toBe(1);
  });

  it('EC-19: no kept finding → precision null', () => {
    const m = scoreRun([scored('a', mustFind(1, 2), [])]);
    expect(m.precision).toEqual({ value: null, num: 0, den: 0 });
    expect(m.recall).toEqual({ value: 0, num: 0, den: 1 });
  });

  it('EC-19: no grounding candidate → citation_accuracy null', () => {
    const m = scoreRun([scored('a', mustFind(1, 2), [], { kept: 0, total: 0 })]);
    expect(m.citation_accuracy).toEqual({ value: null, num: 0, den: 0 });
  });
});

describe('scoreRun aggregation', () => {
  const outcomes = [
    // must_find passed: 1 TP + 1 unlabeled; grounding 2/3
    scored('a', mustFind(10, 12), [finding(11), finding(99)], { kept: 2, total: 3 }),
    // must_find failed: 1 unlabeled; grounding 1/1
    scored('b', mustFind(10, 12), [finding(99)]),
    // must_not_flag failed: 1 FP; grounding 1/2
    scored('c', mustNotFlag(10, 12), [finding(10)], { kept: 1, total: 2 }),
    // must_not_flag passed, no findings
    scored('d', mustNotFlag(10, 12), [], { kept: 0, total: 0 }),
  ];

  it('AC-30: recall = passed must_find / scored must_find', () => {
    expect(scoreRun(outcomes).recall).toEqual({ value: 0.5, num: 1, den: 2 });
  });

  it('AC-31: precision = (kept − FP) / kept over all scored cases', () => {
    // kept = 4 (2 + 1 + 1), FP = 1
    expect(scoreRun(outcomes).precision).toEqual({ value: 0.75, num: 3, den: 4 });
  });

  it('AC-32: citation_accuracy = Σ grounding kept / Σ grounding total', () => {
    // kept 2+1+1+0 = 4, total 3+1+2+0 = 6
    expect(scoreRun(outcomes).citation_accuracy).toEqual({ value: 4 / 6, num: 4, den: 6 });
  });

  it('AC-33/AC-34: pass counts, tp/fp/unlabeled and numerator/denominator are returned', () => {
    const m = scoreRun(outcomes);
    expect(m).toMatchObject({
      traces_passed: 2,
      traces_total: 4,
      cases_errored: 0,
      tp: 1,
      fp: 1,
      unlabeled: 2,
    });
  });

  it('EC-12: errored cases are excluded from every numerator and denominator', () => {
    const withErrors = [
      ...outcomes,
      errorCaseOutcome('e1', 'e1', 'must_find', 'provider error', 5),
      errorCaseOutcome('e2', 'e2', 'must_not_flag', 'missing key', 5),
    ];
    const m = scoreRun(withErrors);
    const base = scoreRun(outcomes);
    expect(m.recall).toEqual(base.recall);
    expect(m.precision).toEqual(base.precision);
    expect(m.citation_accuracy).toEqual(base.citation_accuracy);
    expect(m.traces_total).toBe(4);
    expect(m.cases_errored).toBe(2);
  });

  it('EC-12: an errored outcome carries null pass/counts and the reason', () => {
    const e = errorCaseOutcome('e', 'name', 'must_find', 'boom', 7);
    expect(e).toMatchObject({
      status: 'errored',
      pass: null,
      expected_count: null,
      got_count: null,
      error_reason: 'boom',
      cost_usd: null,
      findings: [],
      duration_ms: 7,
    });
  });

  it('EC-12/EC-13: only errored cases → all ratios null, traces_total 0', () => {
    const m = scoreRun([errorCaseOutcome('e', 'e', 'must_find', 'x', 1)]);
    expect(m.recall.value).toBeNull();
    expect(m.precision.value).toBeNull();
    expect(m.citation_accuracy.value).toBeNull();
    expect(m).toMatchObject({ traces_total: 0, cases_errored: 1 });
  });
});

describe('scoreCommon (compare, AC-46/AC-60)', () => {
  it('AC-46: ratios are computed over the cases present in both runs only', () => {
    const oldRun = [
      scored('shared', mustFind(10, 12), [finding(99)]), // fail
      scored('shared-forbid', mustNotFlag(10, 12), [finding(11)]), // fail, 1 FP
      scored('only-old', mustFind(10, 12), [finding(11)]), // pass — must be ignored
    ];
    const newRun = [
      scored('shared', mustFind(10, 12), [finding(11)]), // pass
      scored('shared-forbid', mustNotFlag(10, 12), [finding(50)]), // pass, no FP
      scored('only-new', mustFind(10, 12), []), // fail — must be ignored
    ];
    const r = scoreCommon(oldRun, newRun, new Set(['shared', 'shared-forbid']));
    expect(r.old.recall).toBe(0);
    expect(r.new.recall).toBe(1);
    expect(r.old.precision).toBe(0.5); // 1 unlabeled + 1 FP → (2 − 1) / 2
    expect(r.new.precision).toBe(1);
  });

  it('EC-26: no common case → every ratio null', () => {
    const r = scoreCommon(
      [scored('a', mustFind(1, 2), [])],
      [scored('b', mustFind(1, 2), [])],
      new Set(),
    );
    expect(r.old).toEqual({ recall: null, precision: null, citation_accuracy: null });
    expect(r.new).toEqual({ recall: null, precision: null, citation_accuracy: null });
  });
});

describe('runCost (EC-21)', () => {
  it('sums the scored cases costs', () => {
    expect(runCost([scored('a', mustFind(1, 2), [], {}, 0.25), scored('b', mustFind(1, 2), [], {}, 0.5)])).toBe(0.75);
  });

  it('EC-21: any scored case without a cost → null, never a partial sum', () => {
    expect(
      runCost([scored('a', mustFind(1, 2), [], {}, 0.25), scored('b', mustFind(1, 2), [], {}, null)]),
    ).toBeNull();
  });

  it('EC-21: nothing scored → null; errored cases do not poison the sum', () => {
    expect(runCost([])).toBeNull();
    expect(runCost([errorCaseOutcome('e', 'e', 'must_find', 'x', 1)])).toBeNull();
    expect(
      runCost([scored('a', mustFind(1, 2), [], {}, 0.25), errorCaseOutcome('e', 'e', 'must_find', 'x', 1)]),
    ).toBe(0.25);
  });
});

describe('NFR-1: scoring makes zero LLM calls', () => {
  // Robust form: the scoring module must not import any LLM/provider/adapter
  // module at all — it can then not reach a model, whatever its callers pass.
  it('NFR-1: scoring.ts imports only contract types (no LLM, adapter, reviewer-core or container module)', () => {
    const src = readFileSync(fileURLToPath(new URL('./scoring.ts', import.meta.url)), 'utf8');
    const specifiers = [...src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gms)].map(
      (m) => m[1]!,
    );
    expect(specifiers.length).toBeGreaterThan(0);
    for (const spec of specifiers) {
      expect(spec).toBe('@devdigest/shared');
    }
    // and every one of those is a type-only import (erased at runtime)
    expect(src).not.toMatch(/^import\s+(?!type\b)/m);
    expect(src).not.toMatch(/completeStructured|\.complete\(/);
  });
});
