/* AgentSummaryCard — one agent on the Eval Dashboard (AC-53, EC-24, EC-28, EC-29).
   The whole card opens the agent's detail page; the name is the real link, so the
   card is reachable and operable by keyboard. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { EvalAgentSummary } from "@devdigest/shared";
import { formatPercent } from "@/lib/eval-format";
import { METRIC_COLORS } from "../../constants";
import { agentHref, formatRanAt, metricValue, passParts } from "../../helpers";
import { GapSparkline } from "../GapSparkline";
import { s } from "./styles";

export function AgentSummaryCard({ summary }: { summary: EvalAgentSummary }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const { latest } = summary;
  const href = agentHref(summary.agent_id);
  const pass = passParts(latest);

  const metrics = [
    { key: "recall", label: t("dashboard.agentCard.recall"), color: METRIC_COLORS.recall, value: metricValue(latest, "recall") },
    { key: "precision", label: t("dashboard.agentCard.precision"), color: METRIC_COLORS.precision, value: metricValue(latest, "precision") },
    { key: "citation", label: t("dashboard.agentCard.citation"), color: METRIC_COLORS.citation, value: metricValue(latest, "citation_accuracy") },
  ];

  return (
    <li
      style={{ ...s.card, listStyle: "none", opacity: summary.enabled ? 1 : 0.85 }}
      onClick={(e) => {
        // The name link navigates by itself; don't navigate twice.
        if ((e.target as HTMLElement).closest("a")) return;
        router.push(href);
      }}
    >
      <div style={s.iconBox} aria-hidden="true">
        <Icon.Cpu size={18} />
      </div>
      <div style={s.main}>
        <div style={s.titleRow}>
          <Link
            href={href}
            style={s.name}
            title={summary.agent_name}
            aria-label={t("dashboard.agentCard.open", { name: summary.agent_name })}
          >
            {summary.agent_name}
          </Link>
          <Badge mono color="var(--text-secondary)">
            {summary.model}
          </Badge>
          {!summary.enabled && <Badge color="var(--text-secondary)">{t("dashboard.disabledBadge")}</Badge>}
        </div>
        <div style={s.lastRun}>
          {latest
            ? t("dashboard.agentCard.lastRun", {
                version: latest.agent_version,
                ranAt: formatRanAt(latest.started_at),
                passed: pass.passed,
                total: pass.total,
              })
            : t("dashboard.noRunsYet")}
        </div>
      </div>
      <GapSparkline
        data={summary.sparkline}
        color={METRIC_COLORS.recall}
        label={t("dashboard.agentCard.sparklineLabel", { count: summary.sparkline.length })}
        w={100}
        h={28}
      />
      <div style={s.metrics}>
        {metrics.map((m) => (
          <div key={m.key} style={s.metric}>
            <span style={s.metricLabel}>{m.label}</span>
            <span className="tnum" style={s.metricValue(m.value === null ? "var(--text-secondary)" : m.color)}>
              {formatPercent(m.value)}
            </span>
          </div>
        ))}
      </div>
      <Icon.ChevronRight size={18} style={s.chevron} />
    </li>
  );
}
