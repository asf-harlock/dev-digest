/* AgentMetricTrend — the shared MetricTrend wired to an agent's eval trend (AC-55..AC-57):
   x-axis v{agent version}, tooltip = version, run date, recall / precision / citation and
   cost. Used by the agent Evals tab and the dashboard detail page. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalTrendPoint } from "@devdigest/shared";
import { MetricTrend } from "../MetricTrend";
import { agentTooltipValues } from "./helpers";

export function AgentMetricTrend({ trend, style }: { trend: EvalTrendPoint[]; style?: React.CSSProperties }) {
  const t = useTranslations("eval");
  return (
    <MetricTrend
      points={trend}
      getKey={(p) => p.run_id}
      getVersion={(p) => p.agent_version}
      getValue={(p, metric) => p[metric]}
      tooltipText={(p) => t("trend.tooltip.agent", agentTooltipValues(p))}
      style={style}
    />
  );
}
