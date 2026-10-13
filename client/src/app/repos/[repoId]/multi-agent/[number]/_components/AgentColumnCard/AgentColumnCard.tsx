/* AgentColumnCard — one agent's column in the Columns view: name, status, score ring,
   duration and cost, the findings (dismissed ones muted, not counted), the failure text,
   and "View trace" (which opens the existing RunTraceDrawer via the page). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CircularScore, SeverityBadge, type Severity } from "@devdigest/ui";
import type { AgentColumn } from "@devdigest/shared";
import { EM_DASH, formatCostUsd, formatDuration } from "@/lib/eval-format";
import { AgentStatus } from "../AgentStatus";
import { STATUS_VIEW } from "../AgentStatus/constants";
import { SCORE_SIZE } from "./constants";
import { activeFindingCount, fileLine, sortedFindings } from "./helpers";
import { s } from "./styles";

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
};

export function AgentColumnCard({
  column,
  onOpenTrace,
}: {
  column: AgentColumn;
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("runs");
  const name = column.agent_name ?? t("deletedAgent");
  const failed = column.status === "failed" || column.status === "cancelled";
  const showFindings = column.status === "done";
  const findings = sortedFindings(column.findings);
  const heading = `agent-${column.run_id}`;

  return (
    <section style={s.card(STATUS_VIEW[column.status].color)} aria-labelledby={heading} data-run-id={column.run_id}>
      <div style={s.header}>
        <div style={s.headerMain}>
          <div id={heading} style={{ ...s.name, ...(column.agent_name ? null : s.deletedName) }} title={name}>
            {name}
          </div>
          <div style={s.metaRow}>
            <AgentStatus status={column.status} />
            {column.status === "done" && (
              <span className="mono tnum">
                {formatDuration(column.duration_ms)} · {column.cost_usd == null ? EM_DASH : formatCostUsd(column.cost_usd)}
              </span>
            )}
          </div>
        </div>
        {column.status === "done" && column.score != null && (
          <div role="img" aria-label={t("column.score", { score: column.score })}>
            <CircularScore score={column.score} size={SCORE_SIZE} />
          </div>
        )}
      </div>

      <div style={s.body}>
        {failed && column.error && (
          <p style={s.error} title={column.error}>
            {column.error}
          </p>
        )}
        {showFindings && findings.length === 0 && <div style={s.empty}>{t("column.noFindings")}</div>}
        {showFindings && findings.length > 0 && (
          <ul style={s.list} aria-label={t("column.findingsLabel", { agent: name })}>
            {findings.map((f) => {
              const dismissed = !!f.dismissed_at;
              return (
                <li key={f.id} style={s.finding(SEV_COLOR[f.severity] ?? "var(--text-muted)", dismissed)}>
                  <div style={s.findingHead}>
                    <SeverityBadge severity={f.severity as Severity} />
                    {dismissed && <span style={s.dismissedTag}>{t("column.dismissed")}</span>}
                  </div>
                  <span style={s.findingTitle(dismissed)}>{f.title}</span>
                  <span className="mono" style={s.fileLine} title={fileLine(f)}>
                    {fileLine(f)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div style={s.footer}>
        <Button
          type="button"
          kind="ghost"
          size="sm"
          aria-label={t("viewTraceFor", { agent: name })}
          onClick={() => onOpenTrace(column.run_id)}
        >
          {t("viewTrace")}
        </Button>
        {showFindings && <span className="tnum">{t("column.findingsCount", { count: activeFindingCount(column.findings) })}</span>}
      </div>
    </section>
  );
}
