/* CompareCard — "{old} → {new}" with a signed delta (AC-46). The caller formats the
   two values so the same card serves percent ratios and dollar cost. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { DeltaText } from "../../../../../../_components/DeltaText";
import { s } from "./styles";

export function CompareCard({
  label,
  oldText,
  newText,
  kind,
  oldValue,
  newValue,
  scope,
}: {
  label: string;
  oldText: string;
  newText: string;
  kind: "points" | "cost";
  oldValue: number | null;
  newValue: number | null;
  /** What the numbers cover, e.g. "over cases in both runs". */
  scope: string;
}) {
  const t = useTranslations("eval");
  return (
    <div role="group" aria-label={label} style={s.card}>
      <div style={s.label}>{label}</div>
      <div style={s.values}>
        <span className="tnum" style={s.next}>
          {t("compare.cards.fromTo", { old: oldText, new: newText })}
        </span>
        <DeltaText kind={kind} newValue={newValue} oldValue={oldValue} />
      </div>
      <div style={s.scope}>{scope}</div>
    </div>
  );
}
