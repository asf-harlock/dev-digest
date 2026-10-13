"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { PILL, type PillStatus } from "./constants";

/** Status pill: icon + text, so the state is never conveyed by colour alone. */
export function StatusPill({ status, title }: { status: PillStatus; title?: string }) {
  const t = useTranslations("ci");
  const p = PILL[status];
  return (
    <span title={title}>
      <Badge color={p.color} bg={p.bg} icon={p.icon}>
        {t(`ciTab.status.${p.key}`)}
      </Badge>
    </span>
  );
}
