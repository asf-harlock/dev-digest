/* Route-level constants for the Eval Dashboard (/eval and /eval/agents/:agentId). */

/** One colour per metric — defined with the shared trend chart, re-exported for the bars, sparklines and KPI numbers. */
export { METRIC_COLORS } from "@/components/metric-trend";

/** AC-41 / AC-53: a sparkline shows at most the last 10 finished runs. */
export const SPARKLINE_LIMIT = 10;

/** NFR-7: interactive targets are at least 24×24 px. */
export const MIN_TARGET_PX = 24;
