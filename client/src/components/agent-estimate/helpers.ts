import type { AgentEstimate as AgentEstimateData } from "@devdigest/shared";
import { formatRunCost } from "@/components/run-cost-badge";
import { NO_ESTIMATE } from "./constants";

/** Estimates keyed by agent id, for O(1) lookup per row. */
export function indexEstimates(
  agents: readonly AgentEstimateData[] | undefined,
): Map<string, AgentEstimateData> {
  return new Map((agents ?? []).map((a) => [a.agent_id, a]));
}

/** `8.2s` (one decimal); `—` when there is no completed run to estimate from. */
export function formatEstimateDuration(ms: number | null | undefined): string {
  return ms == null ? NO_ESTIMATE : `${(ms / 1000).toFixed(1)}s`;
}

/** The existing run-cost formatter; `—` for an unknown cost. */
export function formatEstimateCost(costUsd: number | null | undefined): string {
  return costUsd == null ? NO_ESTIMATE : formatRunCost(costUsd);
}

/** One row's label: `8.2s · $0.06`, or a lone `—` when the agent has no estimate at all. */
export function formatAgentEstimate(
  estimate: Pick<AgentEstimateData, "duration_ms" | "cost_usd"> | null | undefined,
): string {
  if (!estimate || (estimate.duration_ms == null && estimate.cost_usd == null)) return NO_ESTIMATE;
  return `${formatEstimateDuration(estimate.duration_ms)} · ${formatEstimateCost(estimate.cost_usd)}`;
}

export interface EstimateAggregate {
  /** Longest checked agent (they run in parallel); null when no checked agent has a duration. */
  durationMs: number | null;
  /** Sum of the known costs; null when no checked agent has one. */
  costUsd: number | null;
  /** At least one checked agent has no cost estimate, so the total is a lower bound (EC-7). */
  partial: boolean;
}

/** The run estimate of a selection: max duration, sum of known costs, `partial` (AC-7, EC-7). */
export function aggregateEstimates(
  selectedIds: readonly string[],
  byAgent: ReadonlyMap<string, AgentEstimateData>,
): EstimateAggregate {
  let durationMs: number | null = null;
  let costUsd: number | null = null;
  let partial = false;
  for (const id of selectedIds) {
    const e = byAgent.get(id);
    if (e?.duration_ms != null) durationMs = Math.max(durationMs ?? 0, e.duration_ms);
    if (e?.cost_usd != null) costUsd = (costUsd ?? 0) + e.cost_usd;
    else partial = true;
  }
  return { durationMs, costUsd, partial };
}
