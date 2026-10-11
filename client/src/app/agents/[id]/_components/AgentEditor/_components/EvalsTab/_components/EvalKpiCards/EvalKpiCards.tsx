"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MetricCard } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared";
import { KPI_LABEL_KEY, buildKpis, type KpiModel } from "./helpers";
import { s } from "./styles";

/** Spoken form of a delta: the arrow glyph alone is not announced reliably (NFR-7). */
function deltaSentence(t: ReturnType<typeof useTranslations>, k: KpiModel): string {
  if (k.points === null) return t("format.deltaNone");
  if (k.direction === "up") return t("format.deltaUp", { points: k.points });
  if (k.direction === "down") return t("format.deltaDown", { points: Math.abs(k.points) });
  return t("format.deltaFlat");
}

/** Recall / Precision / Citation accuracy / Traces passed for the latest finished run. */
export function EvalKpiCards({
  latest,
  previous,
}: {
  latest: EvalRunRecord | null;
  previous: EvalRunRecord | null;
}) {
  const t = useTranslations("eval");
  const unit = t("format.pointsUnit");
  const kpis = React.useMemo(() => buildKpis(latest, previous, unit), [latest, previous, unit]);

  return (
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
  );
}
