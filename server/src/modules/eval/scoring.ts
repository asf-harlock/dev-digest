import type {
  EvalActualFinding,
  EvalCaseOutcome,
  EvalCompareRatios,
  EvalExpectation,
  EvalFindingLabel,
  EvalMetrics,
  EvalRatio,
} from '@devdigest/shared';

/**
 * SPEC-08 scoring — pure, zero I/O, zero LLM (NFR-1). This file is the whole
 * scoring surface: matching is file equality + strict inclusive line-range
 * overlap, computed in code. No ±N tolerance window (Q-2).
 */

/** The subset of a kept finding that scoring reads. */
export interface ScoredFinding {
  file: string;
  start_line: number;
  end_line: number;
  title: string;
  severity: string;
  category: string;
}

/** AC-27/28: same file AND the two inclusive line ranges overlap. */
export function matches(
  finding: Pick<ScoredFinding, 'file' | 'start_line' | 'end_line'>,
  expectation: Pick<EvalExpectation, 'file' | 'start_line' | 'end_line'>,
): boolean {
  if (finding.file !== expectation.file) return false;
  const fLo = Math.min(finding.start_line, finding.end_line);
  const fHi = Math.max(finding.start_line, finding.end_line);
  const eLo = Math.min(expectation.start_line, expectation.end_line);
  const eHi = Math.max(expectation.start_line, expectation.end_line);
  return fLo <= eHi && eLo <= fHi;
}

/** AC-29: exactly one label per kept finding, against its own case's expectation only. */
export function labelFinding(
  finding: ScoredFinding,
  expectation: EvalExpectation,
): EvalFindingLabel {
  if (!matches(finding, expectation)) return 'unlabeled';
  return expectation.type === 'must_find' ? 'tp' : 'fp';
}

export interface ScoreCaseInput {
  caseId: string;
  name: string;
  expectation: EvalExpectation;
  /** KEPT (grounded) findings only; a dropped finding is never scored. */
  findings: ScoredFinding[];
  groundingKept: number;
  groundingTotal: number;
  durationMs: number;
  costUsd: number | null;
}

/** AC-27/28: `must_find` passes on >= 1 overlapping finding; `must_not_flag` on none. */
export function scoreCase(input: ScoreCaseInput): EvalCaseOutcome {
  const findings: EvalActualFinding[] = input.findings.map((f) => ({
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    title: f.title,
    severity: f.severity,
    category: f.category,
    label: labelFinding(f, input.expectation),
  }));
  const overlapping = findings.filter((f) => f.label !== 'unlabeled').length;
  const mustFind = input.expectation.type === 'must_find';
  return {
    case_id: input.caseId,
    name: input.name,
    expectation_type: input.expectation.type,
    status: 'scored',
    pass: mustFind ? overlapping > 0 : overlapping === 0,
    error_reason: null,
    // AC-12: n is 1 for must_find and 0 for must_not_flag; m is the overlapping kept findings.
    expected_count: mustFind ? 1 : 0,
    got_count: overlapping,
    findings,
    grounding_kept: input.groundingKept,
    grounding_total: input.groundingTotal,
    duration_ms: input.durationMs,
    cost_usd: input.costUsd,
  };
}

/** EC-12: a case whose review threw — `pass`/counts null, excluded from every metric. */
export function errorCaseOutcome(
  caseId: string,
  name: string,
  expectationType: EvalExpectation['type'],
  reason: string,
  durationMs: number,
): EvalCaseOutcome {
  return {
    case_id: caseId,
    name,
    expectation_type: expectationType,
    status: 'errored',
    pass: null,
    error_reason: reason,
    expected_count: null,
    got_count: null,
    findings: [],
    grounding_kept: 0,
    grounding_total: 0,
    duration_ms: durationMs,
    cost_usd: null,
  };
}

/** EC-19: a ratio whose denominator is 0 is `null`, never 0 or 1. */
export function ratio(num: number, den: number): EvalRatio {
  return { value: den > 0 ? num / den : null, num, den };
}

/**
 * AC-30..34 — set-level metrics over a run's outcomes. Errored cases
 * contribute to no numerator and no denominator.
 * - recall = passed must_find / scored must_find
 * - precision = 1 − FP / kept findings, as (kept − FP) / kept
 * - citation_accuracy = Σ grounding kept / Σ grounding total
 */
export function scoreRun(outcomes: EvalCaseOutcome[]): EvalMetrics {
  const scored = outcomes.filter((o) => o.status === 'scored');

  const mustFind = scored.filter((o) => o.expectation_type === 'must_find');
  const mustFindPassed = mustFind.filter((o) => o.pass === true).length;

  let tp = 0;
  let fp = 0;
  let unlabeled = 0;
  for (const o of scored) {
    for (const f of o.findings) {
      if (f.label === 'tp') tp++;
      else if (f.label === 'fp') fp++;
      else unlabeled++;
    }
  }
  const kept = tp + fp + unlabeled;

  const groundingKept = scored.reduce((n, o) => n + o.grounding_kept, 0);
  const groundingTotal = scored.reduce((n, o) => n + o.grounding_total, 0);

  return {
    recall: ratio(mustFindPassed, mustFind.length),
    precision: ratio(kept - fp, kept),
    citation_accuracy: ratio(groundingKept, groundingTotal),
    tp,
    fp,
    unlabeled,
    traces_passed: scored.filter((o) => o.pass === true).length,
    traces_total: scored.length,
    cases_errored: outcomes.length - scored.length,
  };
}

/** Compare (AC-46): the same formulas restricted to cases present in both runs. */
export function scoreCommon(
  oldOutcomes: EvalCaseOutcome[],
  newOutcomes: EvalCaseOutcome[],
  commonCaseIds: ReadonlySet<string>,
): { old: EvalCompareRatios; new: EvalCompareRatios } {
  const ratiosOf = (outcomes: EvalCaseOutcome[]): EvalCompareRatios => {
    const m = scoreRun(outcomes.filter((o) => commonCaseIds.has(o.case_id)));
    return {
      recall: m.recall.value,
      precision: m.precision.value,
      citation_accuracy: m.citation_accuracy.value,
    };
  };
  return { old: ratiosOf(oldOutcomes), new: ratiosOf(newOutcomes) };
}

/**
 * EC-21: the run's cost is the sum of its scored cases' costs, or `null` when
 * any scored case has none (model missing from the price table) — never a
 * partial sum shown as if it were complete. `null` when nothing was scored.
 */
export function runCost(outcomes: EvalCaseOutcome[]): number | null {
  const scored = outcomes.filter((o) => o.status === 'scored');
  if (scored.length === 0) return null;
  let sum = 0;
  for (const o of scored) {
    if (o.cost_usd == null) return null;
    sum += o.cost_usd;
  }
  return sum;
}
