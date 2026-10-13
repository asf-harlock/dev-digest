/* AgentStatus — a column's run status as icon + text (never colour alone). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { SPIN_ANIMATION, STATUS_VIEW, type ColumnStatus } from "./constants";
import { s } from "./styles";

export function AgentStatus({ status }: { status: ColumnStatus }) {
  const t = useTranslations("runs");
  const view = STATUS_VIEW[status];
  const I = Icon[view.icon];
  return (
    <span style={s.wrap(view.color)} data-status={status}>
      <I size={13} style={status === "running" ? { animation: SPIN_ANIMATION } : undefined} />
      {t(`status.${status}`)}
    </span>
  );
}
