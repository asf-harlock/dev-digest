import type { AgentEstimate } from '@devdigest/shared';

/**
 * Estimates (AC-5): medians over an agent's last `done` runs. Pure — no model
 * call (NFR-1).
 */

export interface RunSample {
  durationMs: number | null;
  costUsd: number | null;
}

/** Median; for an even count the mean of the two middle values. `null` over zero values. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** One agent's estimate from its recent `done` runs; `runs_used` = how many runs were taken. */
export function estimateFor(agentId: string, runs: RunSample[]): AgentEstimate {
  const duration = median(runs.flatMap((r) => (r.durationMs === null ? [] : [r.durationMs])));
  // A null cost is "unknown", not zero — it never drags the median down.
  const cost = median(runs.flatMap((r) => (r.costUsd === null ? [] : [r.costUsd])));
  return {
    agent_id: agentId,
    // The contract carries an integer; the mean of two middle values can be .5.
    duration_ms: duration === null ? null : Math.round(duration),
    cost_usd: cost,
    runs_used: runs.length,
  };
}
