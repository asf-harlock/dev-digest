/* MetricTrend — recall / precision / citation over the agent's last 30 finished runs,
   x-axis labelled with each run's v{version} (AC-42, EC-23, EC-36). Drawn here rather
   than with the kit LineChart: that one turns a missing value into 0 and fixes the
   y-range to 0.6–1.0, which would hide low scores. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalTrendPoint } from "@devdigest/shared";
import { formatPercent } from "@/lib/eval-format";
import { CHART, SERIES, Y_TICKS } from "./constants";
import { labelIndexes, seriesGeometry, xFor, yFor } from "./helpers";
import { s } from "./styles";

export function MetricTrend({ trend }: { trend: EvalTrendPoint[] }) {
  const t = useTranslations("eval");
  const seriesLabel = {
    recall: t("agentDetail.trend.recall"),
    precision: t("agentDetail.trend.precision"),
    citation_accuracy: t("agentDetail.trend.citation"),
  } as const;

  return (
    <section aria-labelledby="eval-trend-heading" style={s.card}>
      <div style={s.head}>
        <h2 id="eval-trend-heading" style={{ ...s.sectionTitle, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon.TrendingUp size={14} />
          {t("agentDetail.trend.title")}
        </h2>
        <ul style={s.legend}>
          {SERIES.map((ser) => (
            <li key={ser.key} style={s.legendItem}>
              <svg width={22} height={8} aria-hidden="true">
                <line x1={0} y1={4} x2={22} y2={4} stroke={ser.color} strokeWidth={2} strokeDasharray={ser.dash} />
              </svg>
              {seriesLabel[ser.key]}
            </li>
          ))}
        </ul>
      </div>

      {trend.length === 0 ? (
        <div style={s.empty}>{t("agentDetail.noRunsYet")}</div>
      ) : (
        <svg
          role="img"
          aria-label={t("agentDetail.trend.chartLabel", { count: trend.length })}
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          style={s.svg}
        >
          {Y_TICKS.map((tick) => (
            <g key={tick}>
              <line x1={CHART.left} x2={CHART.width - CHART.right} y1={yFor(tick)} y2={yFor(tick)} stroke="var(--border)" />
              <text x={CHART.left - 8} y={yFor(tick) + 4} textAnchor="end" fontSize={12} fill="var(--text-secondary)">
                {formatPercent(tick)}
              </text>
            </g>
          ))}
          {labelIndexes(trend.length).map((i) => (
            <text
              key={trend[i]?.run_id ?? i}
              x={xFor(i, trend.length)}
              y={CHART.height - 8}
              textAnchor="middle"
              fontSize={12}
              fill="var(--text-secondary)"
            >
              {t("agentDetail.trend.versionLabel", { version: trend[i]?.agent_version ?? 0 })}
            </text>
          ))}
          {SERIES.map((ser) => {
            const geo = seriesGeometry(trend.map((p) => p[ser.key]));
            return (
              <g key={ser.key}>
                {geo.path && (
                  <path d={geo.path} fill="none" stroke={ser.color} strokeWidth={2} strokeDasharray={ser.dash} strokeLinejoin="round" />
                )}
                {geo.points.map((p) => (
                  <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r={3} fill={ser.color} />
                ))}
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
}
