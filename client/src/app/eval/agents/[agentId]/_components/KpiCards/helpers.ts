/* Pure helpers for KpiCards. */
import type { EvalTrendPoint } from "@devdigest/shared";
import { SPARKLINE_LIMIT } from "../../../../constants";
import type { MetricKey } from "../../../../helpers";

/** One metric over the last 10 finished runs, oldest first. */
export function metricSeries(trend: EvalTrendPoint[], key: MetricKey): (number | null)[] {
  return trend.slice(-SPARKLINE_LIMIT).map((p) => p[key]);
}
