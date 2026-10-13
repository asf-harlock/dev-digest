"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { CiInstallation, CiRun } from "@devdigest/shared";
import { formatCost, isTrustedJobUrl } from "@/lib/ci-format";
import { useCiRuns } from "@/lib/hooks/ci";
import { githubPrUrl } from "@/lib/github-urls";
import { useRelativeTime } from "@/lib/relative-time";
import { StatusPill } from "../StatusPill";
import { HISTORY_LIMIT } from "../../constants";
import { FAILURE_REASON_KEY, NO_VALUE } from "./constants";
import { s } from "./styles";

/** The 50 newest CI runs of the selected installation, newest first (AC-40). Reads stored rows only (AC-63). */
export function RunHistory({ installation }: { installation: CiInstallation }) {
  const t = useTranslations("ci");
  const relativeTime = useRelativeTime();
  const { data: runs, isLoading, isError, refetch } = useCiRuns({
    installation_id: installation.id,
    limit: HISTORY_LIMIT,
  });

  const title = t("ciTab.history.title", { repo: installation.repo });

  if (isLoading) {
    return (
      <div style={s.wrap} aria-busy="true">
        <h3 style={s.title}>{title}</h3>
        <Skeleton height={36} />
        <Skeleton height={36} />
      </div>
    );
  }
  if (isError || !runs) {
    return (
      <ErrorState title={t("ciTab.history.errorTitle")} onRetry={() => refetch()} />
    );
  }

  return (
    <section style={s.wrap} aria-label={title}>
      <h3 style={s.title}>{title}</h3>
      {runs.length === 0 ? (
        <p style={s.empty}>{t("ciTab.history.empty")}</p>
      ) : (
        <div style={s.scroll}>
          <table style={s.table}>
            <thead>
              <tr>
                <th scope="col" style={s.th}>{t("ciTab.history.columns.pullRequest")}</th>
                <th scope="col" style={s.th}>{t("ciTab.history.columns.status")}</th>
                <th scope="col" style={s.th}>{t("ciTab.history.columns.findings")}</th>
                <th scope="col" style={s.th}>{t("ciTab.history.columns.cost")}</th>
                <th scope="col" style={s.th}>{t("ciTab.history.columns.ran")}</th>
                <th scope="col" style={s.th}>{t("ciTab.history.columns.job")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, HISTORY_LIMIT).map((run) => (
                <RunRow key={run.id} run={run} repo={installation.repo} relativeTime={relativeTime} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RunRow({
  run,
  repo,
  relativeTime,
}: {
  run: CiRun;
  repo: string;
  relativeTime: (date: string) => string;
}) {
  const t = useTranslations("ci");
  const reason = run.failure_reason ? t(`ciTab.history.failureReason.${FAILURE_REASON_KEY[run.failure_reason]}`) : undefined;
  const counts =
    run.findings_count == null
      ? undefined
      : t("ciTab.history.findingsTitle", {
          critical: run.critical ?? 0,
          warning: run.warning ?? 0,
          suggestion: run.suggestion ?? 0,
        });
  return (
    <tr>
      <td style={s.td}>
        {run.pr_number == null ? (
          <span style={s.muted}>{NO_VALUE}</span>
        ) : (
          <a href={githubPrUrl(repo, run.pr_number)} target="_blank" rel="noopener noreferrer" style={s.link}>
            #{run.pr_number}
          </a>
        )}
      </td>
      <td style={s.td}>
        <StatusPill status={run.status} title={reason} />
      </td>
      <td style={s.td}>
        {run.findings_count == null ? (
          <span style={s.muted}>{NO_VALUE}</span>
        ) : (
          <span className="tnum" title={counts}>
            {run.findings_count}
            <span style={s.srOnly}> ({counts})</span>
          </span>
        )}
      </td>
      <td style={s.td} className="tnum">
        {formatCost(run.cost_usd)}
      </td>
      <td style={s.td}>{run.ran_at ? relativeTime(run.ran_at) : <span style={s.muted}>{NO_VALUE}</span>}</td>
      <td style={s.td}>
        {isTrustedJobUrl(run.job_url, repo) ? (
          <a href={run.job_url} target="_blank" rel="noopener noreferrer" style={s.link}>
            {t("ciTab.history.viewJob")}
          </a>
        ) : (
          <span style={s.muted}>{NO_VALUE}</span>
        )}
      </td>
    </tr>
  );
}
