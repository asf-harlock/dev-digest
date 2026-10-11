/* KpiCards — Recall / Precision / Citation accuracy of the latest finished run (AC-41). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalOverview } from "@devdigest/shared";
import { METRIC_COLORS } from "../../../../constants";
import { metricValue } from "../../../../helpers";
import { KpiCard } from "./_components/KpiCard";
import { metricSeries } from "./helpers";
import { s } from "./styles";

export function KpiCards({ overview }: { overview: EvalOverview }) {
  const t = useTranslations("eval");
  const { latest, previous, trend } = overview;
  return (
    <div style={s.row}>
      <KpiCard
        label={t("agentDetail.kpi.recall")}
        color={METRIC_COLORS.recall}
        value={metricValue(latest, "recall")}
        previous={metricValue(previous, "recall")}
        series={metricSeries(trend, "recall")}
      />
      <KpiCard
        label={t("agentDetail.kpi.precision")}
        color={METRIC_COLORS.precision}
        value={metricValue(latest, "precision")}
        previous={metricValue(previous, "precision")}
        series={metricSeries(trend, "precision")}
      />
      <KpiCard
        label={t("agentDetail.kpi.citation")}
        color={METRIC_COLORS.citation}
        value={metricValue(latest, "citation_accuracy")}
        previous={metricValue(previous, "citation_accuracy")}
        series={metricSeries(trend, "citation_accuracy")}
      />
    </div>
  );
}
