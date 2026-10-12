/* EvalDashboardView — /eval (AC-52..AC-54, EC-24, EC-28). One card per agent plus the
   workspace's recent runs. Loading, error, no-agents and no-runs are separate states. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useEvalDashboard } from "@/lib/hooks/eval";
import { AgentSummaryCard } from "../AgentSummaryCard";
import { RecentRunsTable } from "../RecentRunsTable";
import { s } from "./styles";

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const { data, isLoading, isError, refetch } = useEvalDashboard();
  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <h1 style={s.h1}>{t("dashboard.title")}</h1>
          <p style={s.subtitle}>{t("dashboard.subtitle")}</p>
        </div>

        {isLoading && (
          <div role="status" aria-label={t("dashboard.loading")} style={s.list}>
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        )}

        {isError && (
          <ErrorState
            title={t("dashboard.loadErrorTitle")}
            body={t("dashboard.loadErrorBody")}
            onRetry={() => refetch()}
          />
        )}

        {data && data.agents.length === 0 && (
          <EmptyState icon="Cpu" title={t("dashboard.noAgentsTitle")} body={t("dashboard.noAgentsBody")} />
        )}

        {data && data.agents.length > 0 && (
          <section aria-labelledby="eval-agents-heading">
            <div style={s.sectionHead}>
              <Icon.Cpu size={14} style={s.mutedText} />
              <h2 id="eval-agents-heading" style={s.sectionTitle}>
                {t("dashboard.agentsHeading")}
              </h2>
            </div>
            <ul style={s.list}>
              {data.agents.map((agent) => (
                <AgentSummaryCard key={agent.agent_id} summary={agent} />
              ))}
            </ul>
          </section>
        )}

        {data && data.agents.length > 0 && (
          <section aria-labelledby="eval-recent-heading" style={s.section}>
            <div style={s.sectionHead}>
              <Icon.History size={14} style={s.mutedText} />
              <h2 id="eval-recent-heading" style={s.sectionTitle}>
                {t("dashboard.recentRunsAll")}
              </h2>
            </div>
            {data.recent_runs.length === 0 ? (
              <div style={s.empty}>{t("dashboard.noEvalRunsYet")}</div>
            ) : (
              <RecentRunsTable runs={data.recent_runs} />
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}
