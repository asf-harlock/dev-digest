/* PrContextFooter — token total (aria-live) and save failure (aria-live). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "./styles";

/** Tokens the agent and skill documents keep per review call (16,000 − 10,000). */
const AGENT_DOC_RESERVE = 6000;

export function PrContextFooter({
  used,
  limit,
  saveFailed,
  saving,
  mapReduce,
}: {
  used: number;
  limit: number;
  saveFailed: boolean;
  saving: boolean;
  mapReduce: boolean;
}) {
  const t = useTranslations("prContext");
  return (
    <div style={s.wrap}>
      <div aria-live="polite" role="status" style={used > limit ? s.over : s.total}>
        {t("footer.total", { used, limit })}
        {saving ? ` · ${t("footer.saving")}` : ""}
      </div>
      <div style={s.hint}>{t("footer.reserve", { min: AGENT_DOC_RESERVE })}</div>
      <div aria-live="polite" role="status">
        {saveFailed && <span style={s.error}>{t("footer.saveFailed")}</span>}
      </div>
      {mapReduce && <div style={s.hint}>{t("footer.mapReduce")}</div>}
    </div>
  );
}
