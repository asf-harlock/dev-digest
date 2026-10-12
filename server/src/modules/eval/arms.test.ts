import { describe, it, expect } from 'vitest';
import type { EvalCaseOutcome, EvalExpectation } from '@devdigest/shared';
import {
  buildArms,
  classifyEffect,
  classifyEffects,
  computeLift,
  pairArms,
  skillRunCost,
  type CarrierLink,
  type SkillUnderTest,
} from './arms.js';
import { PAIRED_ARM_FAILED_REASON } from './constants.js';
import { errorCaseOutcome, scoreCase, scoreRun } from './scoring.js';

/**
 * SPEC-09 skill-run pure maths: the arms' skill lists (AC-24, AC-25), pairing
 * (EC-16, EC-17), lift (AC-30, EC-25, EC-26), effect (AC-31), cost (EC-27).
 * No I/O, no LLM (NFR-1). Fixtures carry placeholder text only.
 */

// ---- buildArms ------------------------------------------------------------------

const link = (
  name: string,
  order: number,
  over: Partial<CarrierLink> = {},
): CarrierLink => ({
  skillId: `id-${name}`,
  name,
  body: `body of ${name}`,
  order,
  linkEnabled: true,
  skillEnabled: true,
  ...over,
});

const SUT: SkillUnderTest = { id: 'id-sut', name: 'sut', body: 'body of sut' };
const names = (skills: { name: string }[]) => skills.map((s) => s.name);

describe('buildArms (AC-24, AC-25)', () => {
  it('AC-25: the without arm is the carrier\'s enabled linked skills in link order, minus the skill under test', () => {
    const { withoutArm } = buildArms(
      [link('c', 2), link('a', 0), link('sut', 1, { skillId: SUT.id }), link('b', 1)],
      SUT,
      1,
    );
    expect(names(withoutArm)).toEqual(['a', 'b', 'c']);
    expect(withoutArm[0]).toEqual({ name: 'a', body: 'body of a' }); // render shape only
  });

  it('AC-24: a skill off by its own flag or by its link flag is not in either arm (as a live review)', () => {
    const { withArm, withoutArm } = buildArms(
      [
        link('on', 0),
        link('skill-off', 1, { skillEnabled: false }),
        link('link-off', 2, { linkEnabled: false }),
      ],
      SUT,
      3,
    );
    expect(names(withoutArm)).toEqual(['on']);
    expect(names(withArm)).toEqual(['on', 'sut']);
  });

  it('AC-24: the with arm splices the skill under test at its link position, regardless of both enable flags', () => {
    const links = [
      link('a', 0),
      link('sut', 1, { skillId: SUT.id, linkEnabled: false, skillEnabled: false }),
      link('c', 2),
    ];
    const { withArm, withoutArm } = buildArms(links, SUT, 1);
    expect(names(withArm)).toEqual(['a', 'sut', 'c']);
    expect(names(withoutArm)).toEqual(['a', 'c']);
  });

  it('AC-25: the other skills keep the same relative order in both arms', () => {
    const { withArm, withoutArm } = buildArms(
      [link('z', 5), link('m', 3), link('a', 1)],
      SUT,
      4,
    );
    expect(names(withArm).filter((n) => n !== 'sut')).toEqual(names(withoutArm));
    expect(names(withArm)).toEqual(['a', 'm', 'sut', 'z']);
  });

  it('AC-24 tie rule: the skill under test goes AFTER every other linked skill with the same order', () => {
    const { withArm } = buildArms(
      [link('a', 0), link('b', 1), link('c', 1), link('d', 2)],
      SUT,
      1,
    );
    expect(names(withArm)).toEqual(['a', 'b', 'c', 'sut', 'd']);
  });

  it('AC-24 tie rule: a tie at order 0 and a tie with every skill still puts it last of the tie', () => {
    expect(names(buildArms([link('a', 0), link('b', 0)], SUT, 0).withArm)).toEqual(['a', 'b', 'sut']);
    expect(names(buildArms([link('a', 7), link('b', 7)], SUT, 7).withArm)).toEqual(['a', 'b', 'sut']);
  });

  it('AC-25: skills with equal order keep the given (repository: name, then id) order in the without arm', () => {
    // `EvalRepository.carrierLinks` hands the links over ordered by (order, name, id);
    // the stable sort must not reshuffle a tie.
    const { withoutArm } = buildArms([link('alpha', 1), link('beta', 1), link('gamma', 1)], SUT, 0);
    expect(names(withoutArm)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('AC-24: a skill under test with no link order (not linked as stored) is appended last', () => {
    const { withArm, withoutArm } = buildArms([link('a', 0), link('b', 9)], SUT, null);
    expect(names(withArm)).toEqual(['a', 'b', 'sut']);
    expect(names(withoutArm)).toEqual(['a', 'b']);
  });

  it('AC-24: a carrier with no other skills — the without arm is empty and the with arm is the skill alone', () => {
    const { withArm, withoutArm } = buildArms([link('sut', 0, { skillId: SUT.id })], SUT, 0);
    expect(withoutArm).toEqual([]);
    expect(withArm).toEqual([{ name: 'sut', body: 'body of sut' }]);
  });

  it('AC-23/EC-21: the with arm carries the skill under test\'s body as given, not the link row\'s copy', () => {
    const { withArm } = buildArms(
      [link('sut', 0, { skillId: SUT.id, body: 'stale body' })],
      { ...SUT, body: 'fresh body' },
      0,
    );
    expect(withArm).toEqual([{ name: 'sut', body: 'fresh body' }]);
  });
});

// ---- outcomes ----------------------------------------------------------------------

const EXP: EvalExpectation = { type: 'must_find', file: 'src/config.ts', start_line: 10, end_line: 12 };
const NOT_FLAG: EvalExpectation = { type: 'must_not_flag', file: 'src/config.ts', start_line: 10, end_line: 12 };

const finding = (line: number) => ({
  file: 'src/config.ts',
  start_line: line,
  end_line: line,
  title: 't',
  severity: 'INFO',
  category: 'bug',
});

/** A scored outcome. `hit` = a kept finding overlapping the expectation. */
function scored(
  id: string,
  opts: { exp?: EvalExpectation; hit?: boolean; cost?: number | null; ms?: number; grounding?: [number, number] } = {},
): EvalCaseOutcome {
  const exp = opts.exp ?? EXP;
  const findings = opts.hit ? [finding(11)] : [];
  return scoreCase({
    caseId: id,
    name: `n-${id}`,
    expectation: exp,
    findings,
    groundingKept: opts.grounding?.[0] ?? findings.length,
    groundingTotal: opts.grounding?.[1] ?? findings.length,
    durationMs: opts.ms ?? 10,
    costUsd: opts.cost === undefined ? 0.01 : opts.cost,
  });
}
const errored = (id: string, reason = 'provider boom', exp: EvalExpectation = EXP) =>
  errorCaseOutcome(id, `n-${id}`, exp.type, reason, 5);

// ---- pairArms --------------------------------------------------------------------------

describe('pairArms (EC-16, EC-17)', () => {
  it('EC-16: two scored arms pass through untouched', () => {
    const w = [scored('c1', { hit: true })];
    const wo = [scored('c1', { hit: false })];
    const paired = pairArms(w, wo);
    expect(paired.with).toEqual(w);
    expect(paired.without).toEqual(wo);
  });

  it('EC-16: errored in the with arm only → errored in BOTH arms, carrying the real reason', () => {
    const paired = pairArms([errored('c1', 'key missing')], [scored('c1', { hit: true })]);
    for (const o of [paired.with[0]!, paired.without[0]!]) {
      expect(o).toMatchObject({
        case_id: 'c1',
        status: 'errored',
        pass: null,
        expected_count: null,
        got_count: null,
        cost_usd: null,
        error_reason: 'key missing',
        findings: [],
      });
    }
  });

  it('EC-16: errored in the without arm only → errored in both arms, with the without arm\'s reason', () => {
    const paired = pairArms([scored('c1', { hit: true })], [errored('c1', 'structured output failed')]);
    expect(paired.with[0]).toMatchObject({ status: 'errored', error_reason: 'structured output failed' });
    expect(paired.without[0]).toMatchObject({ status: 'errored', error_reason: 'structured output failed' });
  });

  it('EC-16: errored in both arms keeps the with arm\'s reason', () => {
    const paired = pairArms([errored('c1', 'with boom')], [errored('c1', 'without boom')]);
    expect(paired.with[0]!.error_reason).toBe('with boom');
    expect(paired.without[0]!.error_reason).toBe('with boom');
  });

  it('EC-16: a case missing from the without arm counts as errored, with a stable fallback reason', () => {
    const paired = pairArms([scored('c1', { hit: true })], []);
    expect(paired.with[0]).toMatchObject({ status: 'errored', error_reason: PAIRED_ARM_FAILED_REASON });
    expect(paired.without[0]).toMatchObject({ status: 'errored', error_reason: PAIRED_ARM_FAILED_REASON });
  });

  it('EC-16: both arms always hold the same case ids in the same order, healthy cases keep their own result', () => {
    const w = [scored('c1', { hit: true }), errored('c2'), scored('c3', { hit: false })];
    const wo = [scored('c1', { hit: false }), scored('c2', { hit: true }), scored('c3', { hit: true })];
    const paired = pairArms(w, wo);
    expect(paired.with.map((o) => o.case_id)).toEqual(['c1', 'c2', 'c3']);
    expect(paired.without.map((o) => o.case_id)).toEqual(['c1', 'c2', 'c3']);
    expect(paired.with[0]).toEqual(w[0]);
    expect(paired.without[2]).toEqual(wo[2]);
    expect(paired.with[1]!.status).toBe('errored');
    expect(paired.without[1]!.status).toBe('errored');
  });

  it('EC-16: an errored case leaves both arms\' metrics (only the healthy cases count)', () => {
    const w = [scored('c1', { hit: true }), scored('c2', { hit: true })];
    const wo = [scored('c1', { hit: false }), errored('c2')];
    const paired = pairArms(w, wo);
    const withM = scoreRun(paired.with);
    const withoutM = scoreRun(paired.without);
    expect(withM.cases_errored).toBe(1);
    expect(withoutM.cases_errored).toBe(1);
    // the same single case is scored in both arms
    expect(withM.traces_total).toBe(1);
    expect(withoutM.traces_total).toBe(1);
    expect(withM.recall).toEqual({ value: 1, num: 1, den: 1 });
    expect(withoutM.recall).toEqual({ value: 0, num: 0, den: 1 });
  });

  it('EC-17: every case errored → no scored case in either arm, so nothing to lift', () => {
    const paired = pairArms([errored('c1'), errored('c2')], [errored('c1'), scored('c2')]);
    const withM = scoreRun(paired.with);
    expect(withM.traces_total).toBe(0);
    expect(withM.cases_errored).toBe(2);
    expect(computeLift(withM, scoreRun(paired.without))).toEqual({
      recall: null,
      precision: null,
      citation_accuracy: null,
    });
    expect(skillRunCost(paired.with, paired.without)).toBeNull();
    expect(classifyEffects(paired.with, paired.without).map((e) => e.effect)).toEqual(['errored', 'errored']);
  });
});

// ---- computeLift ------------------------------------------------------------------------

describe('computeLift (AC-30, EC-25, EC-26)', () => {
  it('AC-30: the lift is the raw with − without fraction, unrounded', () => {
    // with: recall 2/3, precision 1, citation 2/3 ; without: recall 1/3, precision 1/2, citation 1/3
    const withM = scoreRun([
      scored('a', { hit: true, grounding: [1, 1] }),
      scored('b', { hit: true, grounding: [1, 1] }),
      scored('c', { hit: false, grounding: [0, 1] }),
    ]);
    const withoutM = scoreRun([
      scored('a', { hit: true, grounding: [1, 3] }),
      scored('b', { hit: false, grounding: [0, 0] }),
      scored('c', { hit: false, grounding: [0, 0] }),
    ]);
    const lift = computeLift(withM, withoutM);
    expect(lift.recall).toBeCloseTo(2 / 3 - 1 / 3, 12);
    expect(lift.precision).toBeCloseTo(0, 12);
    expect(lift.citation_accuracy).toBeCloseTo(2 / 3 - 1 / 3, 12);
    // raw fraction, NOT integer points (NFR-9 is display only)
    expect(Number.isInteger(lift.recall! * 100)).toBe(false);
  });

  it('AC-30: a negative lift is stored as a negative fraction', () => {
    const lift = computeLift(
      scoreRun([scored('a', { hit: false })]),
      scoreRun([scored('a', { hit: true })]),
    );
    expect(lift.recall).toBe(-1);
  });

  it('EC-25/EC-26: a metric with a null side gives a null lift for that metric only', () => {
    // with arm: no must_find case → recall null; without arm has recall
    const withM = scoreRun([scored('a', { exp: NOT_FLAG, hit: false })]);
    const withoutM = scoreRun([scored('a', { exp: EXP, hit: true })]);
    const lift = computeLift(withM, withoutM);
    expect(withM.recall.value).toBeNull();
    expect(lift.recall).toBeNull();
    // precision: with arm has no kept findings → null too; citation likewise
    expect(lift.precision).toBe(null);
    expect(lift.citation_accuracy).toBe(null);
  });

  it('EC-26: either side null → null, in both directions; both sides present → a number (zero is not null)', () => {
    const present = scoreRun([scored('a', { hit: true })]);
    const none = scoreRun([scored('a', { exp: NOT_FLAG, hit: false })]);
    expect(computeLift(present, none).recall).toBeNull();
    expect(computeLift(none, present).recall).toBeNull();
    expect(computeLift(present, present).recall).toBe(0);
  });

  it('EC-25: a zero-denominator metric stays null, never 0 — empty arms lift to all null', () => {
    const empty = scoreRun([]);
    expect(empty.recall.value).toBeNull();
    expect(computeLift(empty, empty)).toEqual({ recall: null, precision: null, citation_accuracy: null });
  });
});

// ---- classifyEffects ----------------------------------------------------------------------

describe('classifyEffect(s) (AC-31)', () => {
  const pass = (id: string) => scored(id, { hit: true });
  const fail = (id: string) => scored(id, { hit: false });

  it('AC-31: all five values', () => {
    const w = [pass('helped'), fail('hurt'), pass('nep'), fail('nef'), pass('err')];
    const wo = [fail('helped'), pass('hurt'), pass('nep'), fail('nef'), errored('err')];
    expect(classifyEffects(w, wo)).toEqual([
      { case_id: 'helped', effect: 'helped' },
      { case_id: 'hurt', effect: 'hurt' },
      { case_id: 'nep', effect: 'no_effect_pass' },
      { case_id: 'nef', effect: 'no_effect_fail' },
      { case_id: 'err', effect: 'errored' },
    ]);
  });

  it('AC-31: errored in the with arm is errored too, and the verdict is about pass/fail, not the finding count', () => {
    expect(classifyEffect(errored('x'), pass('x'))).toBe('errored');
    // must_not_flag: a case with no findings PASSES
    expect(classifyEffect(scored('x', { exp: NOT_FLAG, hit: false }), scored('x', { exp: NOT_FLAG, hit: true }))).toBe('helped');
  });

  it('AC-31: a case with no counterpart in the without arm is left out, not guessed', () => {
    expect(classifyEffects([pass('a'), pass('b')], [pass('a')])).toEqual([{ case_id: 'a', effect: 'no_effect_pass' }]);
  });
});

// ---- skillRunCost ----------------------------------------------------------------------------

describe('skillRunCost (EC-27)', () => {
  it('EC-27: the run cost is the sum over BOTH arms of every scored case', () => {
    const w = [scored('a', { cost: 0.01 }), scored('b', { cost: 0.02 })];
    const wo = [scored('a', { cost: 0.03 }), scored('b', { cost: 0.04 })];
    expect(skillRunCost(w, wo)).toBeCloseTo(0.1, 12);
  });

  it('EC-27: a null cost in either arm of any scored case makes the whole run cost null — never a partial sum', () => {
    const ok = [scored('a', { cost: 0.01 }), scored('b', { cost: 0.01 })];
    const noCost = [scored('a', { cost: 0.01 }), scored('b', { cost: null })];
    expect(skillRunCost(noCost, ok)).toBeNull();
    expect(skillRunCost(ok, noCost)).toBeNull();
  });

  it('EC-27: an errored (paired) case carries no cost and does not null the run cost', () => {
    const w = [scored('a', { cost: 0.01 }), scored('b', { cost: 0.01 })];
    const wo = [scored('a', { cost: 0.02 }), errored('b')];
    const paired = pairArms(w, wo);
    expect(skillRunCost(paired.with, paired.without)).toBeCloseTo(0.03, 12);
  });

  it('EC-27: nothing scored → null (not 0)', () => {
    expect(skillRunCost([], [])).toBeNull();
  });
});
