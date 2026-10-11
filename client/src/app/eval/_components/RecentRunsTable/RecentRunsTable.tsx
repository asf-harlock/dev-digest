/* RecentRunsTable — the workspace's last runs across all agents (AC-54). A row opens
   that agent's detail page; the agent name is the keyboard-reachable link. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import { EM_DASH } from "@/lib/eval-format";
import { METRIC_COLORS } from "../../constants";
import { agentHref, formatRanAt, metricValue, passParts } from "../../helpers";
import { MetricBar } from "../MetricBar";
import { RunStatusBadge } from "../RunStatusBadge";
import { s } from "./styles";

export function RecentRunsTable({ runs }: { runs: EvalRunRecord[] }) {
  const t = useTranslations("eval");
  const router = useRouter();
  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <caption style={s.srOnly}>{t("dashboard.recentRunsAll")}</caption>
        <thead>
          <tr>
            <th scope="col" style={s.th}>{t("dashboard.table.agent")}</th>
            <th scope="col" style={s.th}>{t("dashboard.table.ranAt")}</th>
            <th scope="col" style={s.th}>{t("dashboard.table.version")}</th>
            <th scope="col" style={s.th}>{t("dashboard.table.recall")}</th>
            <th scope="col" style={s.th}>{t("dashboard.table.precision")}</th>
            <th scope="col" style={s.th}>{t("dashboard.table.citation")}</th>
            <th scope="col" style={s.th}>{t("dashboard.table.pass")}</th>
            <th scope="col" style={s.th}>{t("dashboard.table.status")}</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const href = agentHref(run.agent_id);
            const name = run.agent_name ?? EM_DASH;
            const pass = passParts(run);
            return (
              <tr
                key={run.id}
                style={s.clickableRow}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) return;
                  router.push(href);
                }}
              >
                <td style={s.td}>
                  <Link
                    href={href}
                    style={s.agentName}
                    title={name}
                    aria-label={t("dashboard.table.openRun", { name, version: run.agent_version })}
                  >
                    {name}
                  </Link>
                </td>
                <td style={s.td}>
                  <span className="mono" style={s.mono}>{formatRanAt(run.started_at)}</span>
                </td>
                <td style={s.td}>
                  <span className="mono" style={{ ...s.mono, color: "var(--accent-text)" }}>
                    v{run.agent_version}
                  </span>
                </td>
                <td style={s.td}><MetricBar value={metricValue(run, "recall")} color={METRIC_COLORS.recall} /></td>
                <td style={s.td}><MetricBar value={metricValue(run, "precision")} color={METRIC_COLORS.precision} /></td>
                <td style={s.td}><MetricBar value={metricValue(run, "citation_accuracy")} color={METRIC_COLORS.citation} /></td>
                <td style={s.td}>
                  <span className="tnum" style={s.pass}>
                    {run.metrics ? `${pass.passed}/${pass.total}` : EM_DASH}
                  </span>
                </td>
                <td style={s.td}><RunStatusBadge status={run.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
