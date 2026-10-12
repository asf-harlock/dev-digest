import type { EvalCaseEffect, EvalCaseOutcome, EvalLift, EvalMetrics } from '@devdigest/shared';
import type { RenderableSkill } from '../_shared/skill-render.js';
import { PAIRED_ARM_FAILED_REASON } from './constants.js';
import { errorCaseOutcome, runCost } from './scoring.js';

/**
 * SPEC-09 skill runs — the arms' skill lists and the arm-pairing maths. Pure.
 *
 * AC-24 / AC-25 — the two skill lists of a skill eval run.
 *
 * The without arm is the carrier's skills as a live review would inject them
 * (link AND skill enabled, link order) minus the skill under test. The with
 * arm is built FROM it, so the other skills' relative order is identical in
 * both arms, then splices in the skill under test at its link position —
 * regardless of both enable flags — AFTER every other skill with the same
 * link `order` (the tie rule).
 */

export interface CarrierLink {
  skillId: string;
  name: string;
  body: string;
  /** `agent_skills.order`. */
  order: number;
  linkEnabled: boolean;
  skillEnabled: boolean;
}

export interface SkillUnderTest extends RenderableSkill {
  id: string;
}

export function buildArms(
  carrierLinks: readonly CarrierLink[],
  skillUnderTest: SkillUnderTest,
  /** The skill under test's `agent_skills.order` on the carrier; `null` appends it last. */
  linkOrder: number | null,
): { withArm: RenderableSkill[]; withoutArm: RenderableSkill[] } {
  // Array#sort is stable: equal `order` keeps the repository's deterministic tie order.
  const survivors = carrierLinks
    .filter((l) => l.skillId !== skillUnderTest.id && l.linkEnabled && l.skillEnabled)
    .slice()
    .sort((a, b) => a.order - b.order);

  const withoutArm: RenderableSkill[] = survivors.map(({ name, body }) => ({ name, body }));

  const withArm = withoutArm.slice();
  const sut: RenderableSkill = { name: skillUnderTest.name, body: skillUnderTest.body };
  if (linkOrder === null) {
    withArm.push(sut);
  } else {
    // `<=`: the skill under test goes after every other skill with the same order.
    withArm.splice(survivors.filter((l) => l.order <= linkOrder).length, 0, sut);
  }
  return { withArm, withoutArm };
}

// ---- pairing, lift and effect over the two arms (pure) ---------------------------

/**
 * EC-16 — a case that errored in EITHER arm is `errored` in BOTH, so it drops
 * out of both arms' metrics, the lifts and the effect counts and the two arms
 * always score the same set of cases. Both arms carry the failing arm's real
 * reason. The healthy arm's own result and cost are not kept (known, spec'd
 * trade-off: the run cost excludes that spend). A case missing from the
 * without arm counts as errored.
 */
export function pairArms(
  withOutcomes: EvalCaseOutcome[],
  withoutOutcomes: EvalCaseOutcome[],
): { with: EvalCaseOutcome[]; without: EvalCaseOutcome[] } {
  const withoutById = new Map(withoutOutcomes.map((o) => [o.case_id, o]));
  const pairedWith: EvalCaseOutcome[] = [];
  const pairedWithout: EvalCaseOutcome[] = [];

  for (const w of withOutcomes) {
    const wo = withoutById.get(w.case_id);
    if (w.status === 'scored' && wo?.status === 'scored') {
      pairedWith.push(w);
      pairedWithout.push(wo);
      continue;
    }
    const reason =
      (w.status === 'errored' ? w.error_reason : wo?.error_reason) ?? PAIRED_ARM_FAILED_REASON;
    pairedWith.push(
      errorCaseOutcome(w.case_id, w.name, w.expectation_type, reason, w.duration_ms),
    );
    pairedWithout.push(
      errorCaseOutcome(w.case_id, w.name, w.expectation_type, reason, wo?.duration_ms ?? 0),
    );
  }
  return { with: pairedWith, without: pairedWithout };
}

const liftOf = (a: number | null, b: number | null): number | null =>
  a == null || b == null ? null : a - b;

/** AC-30, EC-26 — raw with − without fraction per metric; `null` when either side is `null`. */
export function computeLift(withMetrics: EvalMetrics, withoutMetrics: EvalMetrics): EvalLift {
  return {
    recall: liftOf(withMetrics.recall.value, withoutMetrics.recall.value),
    precision: liftOf(withMetrics.precision.value, withoutMetrics.precision.value),
    citation_accuracy: liftOf(
      withMetrics.citation_accuracy.value,
      withoutMetrics.citation_accuracy.value,
    ),
  };
}

/** AC-31 — one case's effect from its two arms; `errored` when either arm errored. */
export function classifyEffect(
  withOutcome: EvalCaseOutcome,
  withoutOutcome: EvalCaseOutcome,
): EvalCaseEffect {
  if (
    withOutcome.status !== 'scored' ||
    withoutOutcome.status !== 'scored' ||
    withOutcome.pass === null ||
    withoutOutcome.pass === null
  ) {
    return 'errored';
  }
  if (withOutcome.pass) return withoutOutcome.pass ? 'no_effect_pass' : 'helped';
  return withoutOutcome.pass ? 'hurt' : 'no_effect_fail';
}

/** AC-31 — every case of the (paired) arms, with its effect. */
export function classifyEffects(
  withOutcomes: EvalCaseOutcome[],
  withoutOutcomes: EvalCaseOutcome[],
): { case_id: string; effect: EvalCaseEffect }[] {
  const withoutById = new Map(withoutOutcomes.map((o) => [o.case_id, o]));
  return withOutcomes.flatMap((w) => {
    const wo = withoutById.get(w.case_id);
    return wo ? [{ case_id: w.case_id, effect: classifyEffect(w, wo) }] : [];
  });
}

/**
 * EC-27 — the run's cost over both arms of the cases scored in both, or
 * `null` when either arm of any such case has no cost (never a partial sum).
 * `null` when nothing was scored.
 */
export function skillRunCost(
  withOutcomes: EvalCaseOutcome[],
  withoutOutcomes: EvalCaseOutcome[],
): number | null {
  const withCost = runCost(withOutcomes);
  const withoutCost = runCost(withoutOutcomes);
  return withCost == null || withoutCost == null ? null : withCost + withoutCost;
}
