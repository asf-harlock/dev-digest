/* EvalsTab — the agent's eval set and its latest metrics (SPEC-08 AC-10..AC-39,
   SPEC-09 AC-43..AC-45, AC-55, AC-56; SPEC-10 AC-27, AC-28). The EVAL METRICS label with the
   dashboard link, the KPI cards of the latest finished run with their caption, the Metric
   trend chart, the case list (row or edit → Case Editor, delete → confirmation), "Run all
   evals" and the primary "New eval case". Data comes from hooks/eval.ts only. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentEvalCases, useAgentEvalOverview } from "@/lib/hooks/eval";
import { CaseEditor } from "@/components/eval-case-editor";
import { AgentMetricTrend } from "@/components/metric-trend";
import { EvalKpiCards } from "@/components/eval-kpi-cards";
import { DeleteCaseDialog } from "@/components/delete-case-dialog";
import { EvalCaseList } from "./_components/EvalCaseList";
import { RunAllEvals } from "./_components/RunAllEvals";
import { PULL_REQUESTS_HREF, dashboardHref } from "./constants";
import { passingCounts } from "./helpers";
import { s } from "./styles";

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const overview = useAgentEvalOverview(agent.id);
  const cases = useAgentEvalCases(agent.id);
  /** The Case Editor: `"new"` for a blank case, else the id of the stored case to open. */
  const [editing, setEditing] = React.useState<"new" | { caseId: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null);

  const list = cases.data ?? [];
  const { passed, scored } = passingCounts(list);
  const closeEditor = React.useCallback(() => setEditing(null), []);
  const closeDelete = React.useCallback(() => setDeleteTarget(null), []);
  const afterDelete = React.useCallback(() => {
    setDeleteTarget(null);
    setEditing(null);
  }, []);

  return (
    <div style={s.wrap}>
      <section style={s.section}>
        <div style={s.header}>
          <h2 style={s.title}>{t("evalsTab.metricsLabel")}</h2>
          <span style={s.spacer} />
          <Link href={dashboardHref(agent.id)} style={s.dashboardLink}>
            {t("evalsTab.viewDashboard")}
          </Link>
        </div>
        {overview.isError ? (
          <ErrorState
            title={t("states.error")}
            body={t("evalsTab.loadMetricsError")}
            onRetry={() => overview.refetch()}
          />
        ) : overview.isLoading || !overview.data ? (
          <Skeleton height={120} />
        ) : (
          <>
            <EvalKpiCards
              latest={overview.data.latest?.metrics ?? null}
              previous={overview.data.previous?.metrics ?? null}
            />
            <AgentMetricTrend trend={overview.data.trend} />
          </>
        )}
      </section>

      <section style={s.section}>
        <div style={s.sectionHead}>
          <h2 style={s.sectionTitle}>{t("evalsTab.casesHeading")}</h2>
          <span style={s.pill}>{t("evalsTab.passingSummary", { passed, scored })}</span>
          <span style={s.count}>{t("evalsTab.casesCount", { count: list.length })}</span>
          <span style={s.spacer} />
          {overview.data && (
            <RunAllEvals
              agentId={agent.id}
              casesTotal={overview.data.cases_total}
              runningRunId={overview.data.running_run_id}
            />
          )}
          <Button kind="primary" size="sm" icon="Plus" onClick={() => setEditing("new")}>
            {t("caseEditor.newCase")}
          </Button>
        </div>

        {cases.isError ? (
          <ErrorState
            title={t("states.error")}
            body={t("evalsTab.loadCasesError")}
            onRetry={() => cases.refetch()}
          />
        ) : cases.isLoading ? (
          <Skeleton height={64} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="FlaskConical"
            title={t("evalsTab.empty.title")}
            body={
              <>
                {t("evalsTab.empty.body")}{" "}
                <Link href={PULL_REQUESTS_HREF} style={s.emptyLink}>
                  {t("evalsTab.empty.link")}
                </Link>
              </>
            }
            cta={t("caseEditor.newCase")}
            onCta={() => setEditing("new")}
          />
        ) : (
          <EvalCaseList
            cases={list}
            onOpen={(caseId) => setEditing({ caseId })}
            onDelete={(id, name) => setDeleteTarget({ id, name })}
          />
        )}
      </section>

      {editing && (
        <CaseEditor
          owner={{ kind: "agent", id: agent.id }}
          caseId={editing === "new" ? null : editing.caseId}
          onClose={closeEditor}
          onRequestDelete={(id, name) => setDeleteTarget({ id, name })}
          escapeEnabled={deleteTarget === null}
        />
      )}
      {deleteTarget && (
        <DeleteCaseDialog
          caseId={deleteTarget.id}
          caseName={deleteTarget.name}
          onClose={closeDelete}
          onDeleted={afterDelete}
        />
      )}
    </div>
  );
}
