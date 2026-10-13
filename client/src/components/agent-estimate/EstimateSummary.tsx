"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EstimateAggregate } from "./helpers";
import { formatEstimateCost, formatEstimateDuration } from "./helpers";
import { s } from "./styles";

/** The estimate of a whole selection: `≈ 8.2s · $0.20 · parallel` (+ `partial` when a cost is unknown). */
export function EstimateSummary({ aggregate }: { aggregate: EstimateAggregate }) {
  const t = useTranslations("prReview");
  return (
    <span className="mono" style={s.summary}>
      <span>
        {t("multiAgent.estimate.approx", {
          duration: formatEstimateDuration(aggregate.durationMs),
          cost: formatEstimateCost(aggregate.costUsd),
        })}
      </span>
      <span>{t("multiAgent.estimate.parallel")}</span>
      {aggregate.partial && <span>{t("multiAgent.estimate.partial")}</span>}
    </span>
  );
}

export default EstimateSummary;
