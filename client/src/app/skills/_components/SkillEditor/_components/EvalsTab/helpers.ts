import type { EvalSkillRunRecord } from "@devdigest/shared";
import { EM_DASH, formatDeltaPoints } from "@/lib/eval-format";

/** `{passed, scored}` of the latest finished run (AC-2): the with-skill arm's passed
 *  traces over the cases scored in both arms. `null` when there is nothing to count. */
export function passingCounts(latest: EvalSkillRunRecord | null | undefined) {
  const withArm = latest?.with;
  if (!withArm) return null;
  return { passed: withArm.traces_passed, scored: withArm.traces_total };
}

/** The three lifts of the latest finished run as NFR-9 signed points ("▲ 4 pt"),
 *  `round(with·100) − round(without·100)`; "—" when either arm's value is missing (EC-26).
 *  Computed from the two arms' ratios, not from the raw `lift` (rounding the difference
 *  can differ from the difference of the rounded values). */
export function liftParts(latest: EvalSkillRunRecord | null | undefined) {
  const w = latest?.with;
  const wo = latest?.without;
  if (!w || !wo) return { recall: EM_DASH, precision: EM_DASH, citation: EM_DASH };
  return {
    recall: formatDeltaPoints(w.recall.value, wo.recall.value),
    precision: formatDeltaPoints(w.precision.value, wo.precision.value),
    citation: formatDeltaPoints(w.citation_accuracy.value, wo.citation_accuracy.value),
  };
}
