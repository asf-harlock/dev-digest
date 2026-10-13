/* CiRunsTable — stored CI runs, newest first (AC-46). Verdict and status are shown as
   icon + text, never colour alone (NFR-13). The agent name is the one stored on the
   installation (UI-9); the PR link is built from repo + number (UI-12); the job link
   only for a trusted github.com run URL (UI-11, AC-49). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared";
import { EM_DASH, formatRanAt } from "@/lib/eval-format";
import { useRelativeTime } from "@/lib/relative-time";
import { COLUMN_WIDTHS, FAILURE_KEY, STATUS_KEY, STATUS_STYLE, VERDICT_KEY, VERDICT_STYLE } from "./constants";
import { formatCost, isTrustedJobUrl } from "@/lib/ci-format";
import { formatDuration, prUrl, severityTotals } from "./helpers";
import { s } from "./styles";

const COLUMNS = ["repository", "pullRequest", "agent", "verdict", "findings", "cost", "duration", "ranAt", "job"] as const;

function RunOutcome({ run }: { run: CiRun }) {
  const t = useTranslations("ci");
  if (run.verdict) {
    const st = VERDICT_STYLE[run.verdict];
    return (
      <Badge icon={st.icon} color={st.color} bg={st.bg}>
        {t(`runs.verdict.${VERDICT_KEY[run.verdict]}`)}
      </Badge>
    );
  }
  const st = STATUS_STYLE[run.status];
  const reason = run.status === "failed" && run.failure_reason ? t(`runs.failure.${FAILURE_KEY[run.failure_reason]}`) : null;
  return (
    <div style={s.outcome}>
      <Badge icon={st.icon} color={st.color} bg={st.bg}>
        {t(`runs.status.${STATUS_KEY[run.status]}`)}
      </Badge>
      {reason && <span style={s.reason}>{reason}</span>}
    </div>
  );
}

function RunRow({ run }: { run: CiRun }) {
  const t = useTranslations("ci");
  const relative = useRelativeTime();
  const pr = prUrl(run);
  const totals = severityTotals(run);
  const findingsTitle = t("runs.findingsTitle", { critical: totals.critical, warning: totals.warning, suggestion: totals.suggestion });
  const jobUrl = isTrustedJobUrl(run.job_url, run.repo) ? run.job_url : null;

  return (
    <tr>
      <td style={s.td}>
        <span style={{ ...s.ellipsis, ...s.repo }} title={run.repo}>
          {run.repo}
        </span>
      </td>
      <td style={s.td}>
        {pr && run.pr_number != null ? (
          <a
            href={pr}
            target="_blank"
            rel="noopener noreferrer"
            style={s.link}
            aria-label={t("runs.prLabel", { number: run.pr_number, repo: run.repo })}
          >
            #{run.pr_number}
          </a>
        ) : (
          <span style={s.muted}>{EM_DASH}</span>
        )}
      </td>
      <td style={s.td}>
        <span style={s.ellipsis} title={run.agent_name}>
          {run.agent_name}
        </span>
      </td>
      <td style={s.td}>
        <RunOutcome run={run} />
      </td>
      <td style={s.td}>
        {run.findings_count == null ? (
          <span style={s.muted}>{EM_DASH}</span>
        ) : (
          <span className="tnum" title={findingsTitle} style={s.num}>
            {run.findings_count}
            <span style={s.srOnly}>{` (${findingsTitle})`}</span>
          </span>
        )}
      </td>
      <td style={s.td}>
        <span className="mono" style={s.num}>
          {formatCost(run.cost_usd)}
        </span>
      </td>
      <td style={s.td}>
        <span className="mono" style={s.num}>
          {formatDuration(run.duration_ms)}
        </span>
      </td>
      <td style={s.td}>
        {run.ran_at ? (
          <time dateTime={run.ran_at} title={formatRanAt(run.ran_at)} style={s.time}>
            {relative(run.ran_at)}
          </time>
        ) : (
          <span style={s.muted}>{EM_DASH}</span>
        )}
      </td>
      <td style={s.td}>
        {jobUrl ? (
          <a
            href={jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={s.link}
            aria-label={t("runs.jobLabel", { repo: run.repo, agent: run.agent_name })}
          >
            {t("runs.job")}
          </a>
        ) : (
          <span style={s.muted}>{EM_DASH}</span>
        )}
      </td>
    </tr>
  );
}

export function CiRunsTable({ runs }: { runs: CiRun[] }) {
  const t = useTranslations("ci");
  return (
    <div style={s.wrap}>
      <table style={s.table}>
        <caption style={s.srOnly}>{t("runs.table.caption")}</caption>
        <colgroup>
          {COLUMN_WIDTHS.map((w, i) => (
            <col key={COLUMNS[i]} style={{ width: `${w}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} scope="col" style={s.th}>
                {t(`runs.table.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <RunRow key={run.id} run={run} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
