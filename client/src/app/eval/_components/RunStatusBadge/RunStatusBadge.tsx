/* RunStatusBadge — run status as icon + text, never colour alone. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { EvalRunStatus } from "@devdigest/shared";
import { STATUS_STYLE } from "./constants";

export function RunStatusBadge({ status }: { status: EvalRunStatus }) {
  const t = useTranslations("eval");
  const st = STATUS_STYLE[status];
  return (
    <Badge icon={st.icon} color={st.color} bg={st.bg}>
      {t(`runStatus.${status}`)}
    </Badge>
  );
}
