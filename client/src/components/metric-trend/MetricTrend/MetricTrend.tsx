/* MetricTrend — recall / precision / citation accuracy per finished run, the x-axis
   labelled with each run's v{version} (SPEC-08 AC-42, SPEC-09 AC-36..AC-39, AC-55..AC-57).
   Generic over the point type: the caller supplies the series accessors and the tooltip
   text; the agent tab, the skill tab and the dashboard detail page share this chart.
   Drawn as custom SVG rather than the kit LineChart: that one turns a missing value into
   0 and fixes the y-range to 0.6–1.0 (EC-28 — a null metric is a gap, never 0).
   Each run has ONE native <button> (Tab-reachable, >= 24 px wide, NFR-8) laid over the
   SVG; its accessible name is the tooltip text. The tooltip opens on hover and focus and
   closes on Escape (however it opened), blur and pointer-leave of that run's target
   (AC-38, AC-39). Pointer-leave closes even a keyboard-focused run's tooltip: AC-39 says
   focus OR pointer moving away closes it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { CHART, SERIES, Y_TICKS } from "../constants";
import { labelIndexes, seriesGeometry, xFor, xPercent, yFor } from "../helpers";
import { s, targetStyle, tooltipStyle } from "../styles";
import { formatPercent } from "@/lib/eval-format";

export type MetricKey = (typeof SERIES)[number]["key"];

export interface MetricTrendProps<P> {
  /** Finished runs, chronological. */
  points: P[];
  getKey: (point: P) => string;
  getVersion: (point: P) => number;
  /** A null value leaves a gap in that series at that run. */
  getValue: (point: P, metric: MetricKey) => number | null;
  /** The single string shown in the tooltip AND used as the target's accessible name. */
  tooltipText: (point: P) => string;
  style?: React.CSSProperties;
}

export function MetricTrend<P>({ points, getKey, getVersion, getValue, tooltipText, style }: MetricTrendProps<P>) {
  const t = useTranslations("eval");
  const headingId = React.useId();
  const [active, setActive] = React.useState<number | null>(null);
  const seriesLabel = {
    recall: t("trend.recall"),
    precision: t("trend.precision"),
    citation_accuracy: t("trend.citation"),
  } as const;
  const count = points.length;

  // Escape closes an open tooltip however it was opened (hover or focus). The listener
  // exists only while a tooltip is open and runs in the capture phase, so that one Escape
  // is consumed here and does not also close a surrounding dialog; with no tooltip open
  // nothing is registered and Escape passes through untouched.
  const isOpen = active !== null;
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setActive(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isOpen]);
  const activePoint = active !== null ? points[active] : undefined;

  return (
    <section aria-labelledby={headingId} style={{ ...s.card, ...style }}>
      <div style={s.head}>
        <h2 id={headingId} style={s.sectionTitle}>
          <Icon.TrendingUp size={14} />
          {t("trend.title")}
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

      {count === 0 ? (
        <div style={s.empty}>{t("trend.noRunsYet")}</div>
      ) : (
        <div style={s.plot}>
          <svg
            role="img"
            aria-label={t("trend.chartLabel", { count })}
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
            {labelIndexes(count).map((i) => {
              const p = points[i];
              return (
                <text
                  key={p ? getKey(p) : i}
                  x={xFor(i, count)}
                  y={CHART.height - 8}
                  textAnchor="middle"
                  fontSize={12}
                  fill="var(--text-secondary)"
                >
                  {t("trend.versionLabel", { version: p ? getVersion(p) : 0 })}
                </text>
              );
            })}
            {active !== null && (
              <line
                x1={xFor(active, count)}
                x2={xFor(active, count)}
                y1={CHART.top}
                y2={CHART.height - CHART.bottom}
                stroke="var(--text-secondary)"
                strokeDasharray="3 3"
              />
            )}
            {SERIES.map((ser) => {
              const geo = seriesGeometry(points.map((p) => getValue(p, ser.key)));
              return (
                <g key={ser.key}>
                  {geo.path && (
                    <path d={geo.path} fill="none" stroke={ser.color} strokeWidth={2} strokeDasharray={ser.dash} strokeLinejoin="round" />
                  )}
                  {geo.points.map((pt) => (
                    <circle key={`${pt.x}-${pt.y}`} cx={pt.x} cy={pt.y} r={3} fill={ser.color} />
                  ))}
                </g>
              );
            })}
          </svg>

          <div style={s.targets}>
            {points.map((p, i) => (
              <button
                key={getKey(p)}
                type="button"
                data-run-target=""
                aria-label={tooltipText(p)}
                style={targetStyle(xPercent(i, count))}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive((cur) => (cur === i ? null : cur))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((cur) => (cur === i ? null : cur))}
              />
            ))}
          </div>

          {activePoint !== undefined && active !== null && (
            <div role="tooltip" style={tooltipStyle(xPercent(active, count))}>
              {tooltipText(activePoint)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
