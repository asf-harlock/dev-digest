"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalCaseState } from "@/lib/eval-format";
import { STATE_VISUAL } from "./constants";
import { s } from "./styles";

/** A case's latest result: an icon that always carries the state as its accessible name, and —
 *  unless `showText` is off (the case row shows the icon alone, SPEC-10 AC-29) — the same text
 *  beside it, so the state is never colour alone (NFR-7, NFR-10). */
export function CaseStateLabel({ state, showText = true }: { state: EvalCaseState; showText?: boolean }) {
  const t = useTranslations("eval");
  const { icon, color } = STATE_VISUAL[state];
  const I = Icon[icon];
  const name = t(`evalsTab.case.state.${state}`);
  if (!showText) {
    return (
      <span style={s.wrap(color)} role="img" aria-label={name} title={name}>
        <I size={16} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span style={s.wrap(color)}>
      <I size={14} aria-hidden="true" />
      {name}
    </span>
  );
}
