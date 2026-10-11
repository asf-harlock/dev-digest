import type { EvalTrendPoint } from "@devdigest/shared";
import { formatCostUsd, formatPercent, formatRanAt } from "@/lib/eval-format";

/** ICU values of the agent trend tooltip (AC-56): version, run date, the three metrics as
 *  integer percentages and the run's cost. A null metric or cost is "—", never 0% / $0.00 (EC-27). */
export function agentTooltipValues(p: EvalTrendPoint) {
  return {
    version: `v${p.agent_version}`,
    date: formatRanAt(p.ran_at),
    recall: formatPercent(p.recall),
    precision: formatPercent(p.precision),
    citation: formatPercent(p.citation_accuracy),
    cost: formatCostUsd(p.cost_usd),
  };
}
