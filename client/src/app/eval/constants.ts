/* Route-level constants for the Eval Dashboard (/eval and /eval/agents/:agentId). */

/** One colour per metric, reused by bars, sparklines, the trend chart and KPI numbers. */
export const METRIC_COLORS = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation: "var(--warn)",
} as const;

/** AC-41 / AC-53: a sparkline shows at most the last 10 finished runs. */
export const SPARKLINE_LIMIT = 10;

/** NFR-7: interactive targets are at least 24×24 px. */
export const MIN_TARGET_PX = 24;
