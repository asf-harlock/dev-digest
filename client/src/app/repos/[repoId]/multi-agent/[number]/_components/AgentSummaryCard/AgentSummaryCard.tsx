/* AgentSummaryCard — the head of a Tabs-view panel: score ring, agent name and status,
   the agent's summary (or its failure text), duration, cost and "View trace". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CircularScore } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { EM_DASH, formatCostUsd, formatDuration } from "@/lib/eval-format";
import { AgentStatus } from "../AgentStatus";
import { STATUS_VIEW } from "../AgentStatus/constants";
import { s } from "./styles";

export function AgentSummaryCard({
  column,
  onOpenTrace,
}: {
  column: AgentColumn;
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("runs");
  const name = column.agent_name ?? t("deletedAgent");
  const failed = column.status === "failed" || column.status === "cancelled";

  return (
    <div style={s.card(STATUS_VIEW[column.status].color)}>
      {column.status === "done" && column.score != null && (
        <div role="img" aria-label={t("column.score", { score: column.score })}>
          <CircularScore score={column.score} size={52} />
        </div>
      )}
      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={{ ...s.name, ...(column.agent_name ? null : s.deletedName) }}>{name}</span>
          <AgentStatus status={column.status} />
        </div>
        {failed && column.error && (
          <p style={s.summary} title={column.error}>
            {column.error}
          </p>
        )}
        {column.status === "done" && <p style={s.summary}>{column.summary || t("tabs.noSummary")}</p>}
      </div>
      <div style={s.side}>
        <Button
          type="button"
          kind="ghost"
          size="sm"
          aria-label={t("viewTraceFor", { agent: name })}
          onClick={() => onOpenTrace(column.run_id)}
        >
          {t("viewTrace")}
        </Button>
        {column.status === "done" && (
          <span className="mono tnum">
            {formatDuration(column.duration_ms)} · {column.cost_usd == null ? EM_DASH : formatCostUsd(column.cost_usd)}
          </span>
        )}
      </div>
    </div>
  );
}
