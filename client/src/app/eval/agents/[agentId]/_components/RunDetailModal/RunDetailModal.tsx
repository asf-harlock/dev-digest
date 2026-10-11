/* RunDetailModal — a run's per-case results (AC-37). Read once with useEvalRunDetail;
   nothing in here is polled. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Modal, Skeleton } from "@devdigest/ui";
import { EM_DASH, formatCostUsd, formatDuration } from "@/lib/eval-format";
import { useEvalRunDetail } from "@/lib/hooks/eval";
import { formatRanAt } from "../../../../helpers";
import { useModalA11y } from "../../../../hooks";
import { CaseResultRow } from "./_components/CaseResultRow";
import { s } from "./styles";

export function RunDetailModal({ runId, onClose }: { runId: string; onClose: () => void }) {
  const t = useTranslations("eval");
  const bodyRef = useModalA11y(onClose);
  const { data: run, isLoading, isError, refetch } = useEvalRunDetail(runId);

  const title = run
    ? t("runDetail.title", { version: run.agent_version, ranAt: formatRanAt(run.started_at) })
    : t("runDetail.loading");

  return (
    <Modal width={900} title={title} onClose={onClose}>
      <div ref={bodyRef} tabIndex={-1} style={s.body}>
        {isLoading && (
          <div role="status" aria-label={t("runDetail.loading")} style={{ display: "grid", gap: 10 }}>
            <Skeleton height={20} />
            <Skeleton height={80} />
            <Skeleton height={80} />
          </div>
        )}
        {isError && <ErrorState title={t("runDetail.loadError")} onRetry={() => refetch()} />}
        {run && (
          <>
            <div style={s.summary}>
              <span>{t("runDetail.summary.cases", { done: run.cases_done, total: run.cases_total })}</span>
              <span>
                {t("runDetail.summary.duration")}: {formatDuration(run.duration_ms)}
              </span>
              <span>
                {t("runDetail.summary.cost")}: {formatCostUsd(run.cost_usd)}
              </span>
            </div>
            {run.error_reason && <p style={s.error}>{t("runStatus.errorReason", { reason: run.error_reason })}</p>}
            {run.metrics === null && run.status !== "running" && (
              <p style={s.mutedText}>{t("runStatus.noMetrics")}</p>
            )}

            <h3 style={s.sectionHeading}>{t("runDetail.snapshotHeading")}</h3>
            <dl style={s.settings}>
              <dt style={s.settingKey}>{t("runDetail.snapshot.model")}</dt>
              <dd className="mono" style={s.settingVal}>{run.snapshot.model}</dd>
              <dt style={s.settingKey}>{t("runDetail.snapshot.strategy")}</dt>
              <dd style={s.settingVal}>{run.snapshot.strategy}</dd>
              <dt style={s.settingKey}>{t("runDetail.snapshot.skills")}</dt>
              <dd style={s.settingVal}>
                {run.snapshot.skills.length === 0
                  ? t("runDetail.snapshot.noSkills")
                  : run.snapshot.skills.map((sk) => sk.name).join(", ") || EM_DASH}
              </dd>
            </dl>

            <h3 style={s.sectionHeading}>{t("runDetail.resultsHeading")}</h3>
            <ul style={s.list}>
              {run.case_results.map((outcome) => (
                <CaseResultRow key={outcome.case_id} outcome={outcome} />
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
