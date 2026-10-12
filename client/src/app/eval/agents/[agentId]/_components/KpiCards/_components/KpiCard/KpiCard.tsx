/* KpiCard — one metric of the latest finished run: big percent, integer-point delta
   against the previous finished run, sparkline over the last 10 (AC-41, EC-20, EC-23, EC-36). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatPercent } from "@/lib/eval-format";
import { DeltaText } from "../../../../../../_components/DeltaText";
import { GapSparkline } from "../../../../../../_components/GapSparkline";
import { s } from "./styles";

export function KpiCard({
  label,
  color,
  value,
  previous,
  series,
}: {
  label: string;
  color: string;
  /** Latest finished run's ratio; null when there is no run or no scorable denominator. */
  value: number | null;
  /** Previous finished run's ratio; null when there is none. */
  previous: number | null;
  /** The last 10 finished runs, oldest first; null is a gap. */
  series: (number | null)[];
}) {
  const t = useTranslations("eval");
  return (
    <div role="group" aria-label={label} style={s.card}>
      <div style={s.top}>
        <span style={s.label}>{label}</span>
        <GapSparkline
          data={series}
          color={color}
          label={t("agentDetail.kpi.sparklineLabel", { metric: label, count: series.length })}
          w={64}
          h={22}
        />
      </div>
      <div style={s.bottom}>
        <span className="tnum" style={s.value(value === null ? "var(--text-secondary)" : "var(--text-primary)")}>
          {formatPercent(value)}
        </span>
        <DeltaText kind="points" newValue={value} oldValue={previous} />
      </div>
    </div>
  );
}
