import type { EvalSkillTrendPoint } from "@devdigest/shared";
import { formatCostUsd, formatLiftPoints, formatPercent, formatRanAt } from "@/lib/eval-format";

/** ICU values of the skill trend tooltip (AC-37): run date, v{skill version}, carrier name and
 *  version, carrier model, the with-skill metrics as integer percentages, each metric's lift as
 *  NFR-9 signed points and the total cost over both arms. Null → "—" (EC-26, EC-27). */
export function skillTooltipValues(p: EvalSkillTrendPoint) {
  return {
    version: `v${p.skill_version}`,
    date: formatRanAt(p.ran_at),
    carrier: p.carrier_name,
    carrierVersion: `v${p.carrier_version}`,
    model: p.model,
    recall: formatPercent(p.recall),
    precision: formatPercent(p.precision),
    citation: formatPercent(p.citation_accuracy),
    liftRecall: formatLiftPoints(p.recall, p.lift.recall),
    liftPrecision: formatLiftPoints(p.precision, p.lift.precision),
    liftCitation: formatLiftPoints(p.citation_accuracy, p.lift.citation_accuracy),
    cost: formatCostUsd(p.cost_usd),
  };
}
