"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MetricCard } from "@devdigest/ui";
import type { EvalMetrics } from "@devdigest/shared";
import { KPI_LABEL_KEY, buildKpis, type KpiModel } from "./helpers";
import { s } from "./styles";

/** Spoken form of a delta: the arrow glyph alone is not announced reliably (NFR-7). */
function deltaSentence(t: ReturnType<typeof useTranslations>, k: KpiModel): string {
  if (k.points === null) return t("format.deltaNone");
  if (k.direction === "up") return t("format.deltaUp", { points: k.points });
  if (k.direction === "down") return t("format.deltaDown", { points: Math.abs(k.points) });
  return t("format.deltaFlat");
}

/** Recall / Precision / Citation accuracy / Traces passed of the latest finished run, with
 *  the mechanical-scoring caption under the row (SPEC-10 AC-27, AC-31). Shared by the agent
 *  tab (`run.metrics`) and the skill tab (the with-skill arm). */
export function EvalKpiCards({
  latest,
  previous,
}: {
  latest: EvalMetrics | null;
  previous: EvalMetrics | null;
}) {
  const t = useTranslations("eval");
  const unit = t("format.pointsUnit");
  const kpis = React.useMemo(() => buildKpis(latest, previous, unit), [latest, previous, unit]);

  return (
    <div style={s.wrap}>
      <div role="group" aria-label={t("evalsTab.kpi.groupLabel")} style={s.grid}>
        {kpis.map((k) => (
          <div key={k.key} style={s.tile}>
            <MetricCard label={t(`evalsTab.kpi.${KPI_LABEL_KEY[k.key]}`)} value={k.value} />
            <div style={s.meta}>
              {k.deltaText !== null && (
                <span style={s.delta(k.direction)}>
                  <span aria-hidden="true">{k.deltaText}</span>
                  <span style={s.srOnly}>{deltaSentence(t, k)}</span>
                </span>
              )}
              {k.caption && <span style={s.caption}>{t(`evalsTab.${k.caption.key}`, k.caption.values)}</span>}
            </div>
          </div>
        ))}
      </div>
      <p style={s.scoring}>{t("evalsTab.scoringCaption")}</p>
    </div>
  );
}
