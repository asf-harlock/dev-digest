"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalCaseState } from "@/lib/eval-format";
import { STATE_VISUAL } from "./constants";
import { s } from "./styles";

/** A case's latest result: icon + text, never colour alone (AC-12, NFR-7). */
export function CaseStateLabel({ state }: { state: EvalCaseState }) {
  const t = useTranslations("eval");
  const { icon, color } = STATE_VISUAL[state];
  const I = Icon[icon];
  return (
    <span style={s.wrap(color)}>
      <I size={14} aria-hidden="true" />
      {t(`evalsTab.case.state.${state}`)}
    </span>
  );
}
