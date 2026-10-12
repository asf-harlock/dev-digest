/* SkillMetricTrend — the shared MetricTrend wired to a skill's eval trend (AC-36, AC-37,
   EC-28, EC-30): the with-skill arm's recall / precision / citation per finished run
   (≤ 100), x-axis v{skill version}, tooltip with carrier, model, lifts and total cost.
   "No runs yet" comes from the chart itself when `trend` is empty. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSkillTrendPoint } from "@devdigest/shared";
import { MetricTrend } from "@/components/metric-trend";
import { skillTooltipValues } from "./helpers";

export function SkillMetricTrend({ trend }: { trend: EvalSkillTrendPoint[] }) {
  const t = useTranslations("eval");
  return (
    <MetricTrend
      points={trend}
      getKey={(p) => p.run_id}
      getVersion={(p) => p.skill_version}
      getValue={(p, metric) => p[metric]}
      tooltipText={(p) => t("trend.tooltip.skill", skillTooltipValues(p))}
    />
  );
}
