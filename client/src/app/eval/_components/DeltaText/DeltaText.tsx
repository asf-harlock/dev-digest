/* DeltaText — a signed delta as arrow + number (colour is secondary, NFR-7) with the
   same fact spelled out for screen readers. Metric deltas are integer points (AC-41);
   cost deltas are dollars (AC-46). A missing side is "—" (EC-20). Cost is not judged
   good/bad, so it stays neutral. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  deltaDirection,
  deltaPoints,
  formatCostDeltaUsd,
  formatDeltaPoints,
} from "@/lib/eval-format";
import { shared } from "../../styles";
import { costDirection, stripArrow, TONE_COLOR } from "./helpers";

export function DeltaText({
  kind,
  newValue,
  oldValue,
}: {
  kind: "points" | "cost";
  newValue: number | null | undefined;
  oldValue: number | null | undefined;
}) {
  const t = useTranslations("eval");
  const visible =
    kind === "points"
      ? formatDeltaPoints(newValue, oldValue, t("format.pointsUnit"))
      : formatCostDeltaUsd(newValue, oldValue);
  const points = kind === "points" ? deltaPoints(newValue, oldValue) : null;
  const direction = kind === "points" ? deltaDirection(points) : costDirection(newValue, oldValue);

  let spoken: string;
  if (direction === "none") spoken = t("format.deltaNone");
  else if (direction === "flat") spoken = t("format.deltaFlat");
  else if (kind === "points") {
    const n = Math.abs(points ?? 0);
    spoken =
      direction === "up" ? t("format.deltaUp", { points: n }) : t("format.deltaDown", { points: n });
  } else {
    const amount = stripArrow(visible);
    spoken =
      direction === "up"
        ? t("compare.cards.deltaUp", { delta: amount })
        : t("compare.cards.deltaDown", { delta: amount });
  }

  const color = kind === "cost" ? "var(--text-secondary)" : TONE_COLOR[direction];
  return (
    <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color }}>
      <span aria-hidden="true">{visible}</span>
      <span style={shared.srOnly}>{spoken}</span>
    </span>
  );
}
