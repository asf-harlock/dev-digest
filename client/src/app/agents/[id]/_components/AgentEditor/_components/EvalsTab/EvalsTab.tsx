/* EvalsTab — the agent's eval set and its latest metrics (SPEC-08 AC-10..AC-39).
   KPI cards for the latest finished run, the case list (open → modal, delete →
   confirmation) and "Run all evals". Data comes from hooks/eval.ts only. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentEvalCases, useAgentEvalOverview } from "@/lib/hooks/eval";
import { CaseModal } from "./_components/CaseModal";
import { DeleteCaseDialog } from "./_components/DeleteCaseDialog";
import { EvalCaseList } from "./_components/EvalCaseList";
import { EvalKpiCards } from "./_components/EvalKpiCards";
import { RunAllEvals } from "./_components/RunAllEvals";
import { PULL_REQUESTS_HREF, dashboardHref } from "./constants";
import { passingCounts } from "./helpers";
import { s } from "./styles";

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const overview = useAgentEvalOverview(agent.id);
  const cases = useAgentEvalCases(agent.id);
  const [openCaseId, setOpenCaseId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null);

  const list = cases.data ?? [];
  const { passed, scored } = passingCounts(list);
  const hasFinishedRun = overview.data?.latest != null;
  const closeModal = React.useCallback(() => setOpenCaseId(null), []);
  const closeDelete = React.useCallback(() => setDeleteTarget(null), []);
  const afterDelete = React.useCallback(() => {
    setDeleteTarget(null);
    setOpenCaseId(null);
  }, []);

  return (
    <div style={s.wrap}>
      <section style={s.section}>
        <div style={s.header}>
          <div style={s.titleBlock}>
            <h2 style={s.title}>{t("evalsTab.metricsTitle")}</h2>
            <p style={s.subtitle}>{t("evalsTab.metricsSubtitle")}</p>
          </div>
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
          <EvalKpiCards latest={overview.data.latest} previous={overview.data.previous} />
        )}
      </section>

      <section style={s.section}>
        <div style={s.sectionHead}>
          <h2 style={s.sectionTitle}>{t("evalsTab.casesHeading")}</h2>
          <span style={s.passing}>
            {hasFinishedRun ? t("evalsTab.passingSummary", { passed, scored }) : t("evalsTab.noValue")}
          </span>
          <span style={{ flex: 1 }} />
          {overview.data && (
            <RunAllEvals
              agentId={agent.id}
              casesTotal={overview.data.cases_total}
              runningRunId={overview.data.running_run_id}
            />
          )}
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
          />
        ) : (
          <EvalCaseList
            cases={list}
            onOpen={setOpenCaseId}
            onDelete={(id, name) => setDeleteTarget({ id, name })}
          />
        )}
      </section>

      {openCaseId && (
        <CaseModal
          caseId={openCaseId}
          onClose={closeModal}
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
