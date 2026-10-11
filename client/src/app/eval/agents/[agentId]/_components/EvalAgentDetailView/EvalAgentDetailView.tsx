/* EvalAgentDetailView — /eval/agents/:agentId (AC-40..AC-50). Header, KPI cards,
   trend chart (shared, with the AC-56 tooltip, AC-57) and the runs table; the run-detail and Compare modals open from here.
   Loading, error, not-found and "no runs yet" (EC-23) each have their own state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { AgentMetricTrend } from "@/components/metric-trend";
import { ApiError } from "@/lib/api";
import { useAgentEvalOverview } from "@/lib/hooks/eval";
import { AgentRunsTable } from "../AgentRunsTable";
import { CompareModal } from "../CompareModal";
import { DetailHeader } from "../DetailHeader";
import { KpiCards } from "../KpiCards";
import { RunDetailModal } from "../RunDetailModal";
import { s } from "./styles";

export function EvalAgentDetailView({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const { data: overview, isLoading, isError, error, refetch } = useAgentEvalOverview(agentId);
  const [openRunId, setOpenRunId] = React.useState<string | null>(null);
  const [compare, setCompare] = React.useState<{ a: string; b: string } | null>(null);

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval" },
    { label: overview?.agent.name ?? "…" },
  ];

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page} role="status" aria-label={t("states.loading")}>
          <Skeleton height={28} width={260} />
          <Skeleton height={90} style={{ marginTop: 22 }} />
          <Skeleton height={240} style={{ marginTop: 18 }} />
        </div>
      </AppShell>
    );
  }

  if (isError || !overview) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <AppShell crumb={crumb}>
        {notFound ? (
          <EmptyState icon="Cpu" title={t("agentDetail.notFoundTitle")} body={t("agentDetail.notFoundBody")} />
        ) : (
          <ErrorState title={t("agentDetail.loadError")} onRetry={() => refetch()} />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <DetailHeader overview={overview} />
        <KpiCards overview={overview} />
        <AgentMetricTrend trend={overview.trend} style={{ marginTop: 18 }} />
        {overview.runs.length === 0 ? (
          <div style={{ ...s.mutedText, marginTop: 28, fontSize: 14 }}>{t("agentDetail.noRunsYet")}</div>
        ) : (
          <AgentRunsTable
            runs={overview.runs}
            onOpenRun={setOpenRunId}
            onCompare={(a, b) => setCompare({ a, b })}
          />
        )}
      </div>
      {openRunId && <RunDetailModal runId={openRunId} onClose={() => setOpenRunId(null)} />}
      {compare && <CompareModal runA={compare.a} runB={compare.b} onClose={() => setCompare(null)} />}
    </AppShell>
  );
}
