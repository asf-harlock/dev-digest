/* AgentRunsTable — the agent's last 50 runs, newest first (AC-43, AC-44, EC-27).
   Select exactly two finished runs to enable Compare; a row opens that run's per-case
   results. The version button is the keyboard route into a row. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared";
import { EM_DASH, formatCostUsd } from "@/lib/eval-format";
import { METRIC_COLORS } from "../../../../constants";
import { formatRanAt, isComparableStatus, metricValue, passParts } from "../../../../helpers";
import { MetricBar } from "../../../../_components/MetricBar";
import { RunStatusBadge } from "../../../../_components/RunStatusBadge";
import { COMPARE_SIZE, toggleSelection } from "./helpers";
import { s } from "./styles";

export function AgentRunsTable({
  runs,
  onOpenRun,
  onCompare,
}: {
  runs: EvalRunRecord[];
  onOpenRun: (runId: string) => void;
  /** Called with the two selected run ids when Compare is pressed. */
  onCompare: (a: string, b: string) => void;
}) {
  const t = useTranslations("eval");
  const [picked, setPicked] = React.useState<string[]>([]);
  // Drop picks whose run left the list or stopped being comparable after a refetch.
  const selected = picked.filter((id) =>
    runs.some((r) => r.id === id && isComparableStatus(r.status)),
  );
  const ready = selected.length === COMPARE_SIZE;

  return (
    <section aria-labelledby="eval-runs-heading" style={{ marginTop: 28 }}>
      <div style={s.head}>
        <h2 id="eval-runs-heading" style={s.sectionTitle}>
          {t("agentDetail.runs.title")}
        </h2>
        {selected.length > 0 && (
          <span role="status" style={s.selected}>
            {t("agentDetail.runs.selectedCount", { count: selected.length })}
          </span>
        )}
        <span style={s.compare} title={ready ? undefined : t("tooltips.selectTwo")}>
          <Button
            kind="primary"
            size="sm"
            icon="Layers"
            disabled={!ready}
            onClick={() => {
              const [a, b] = selected;
              if (a && b) onCompare(a, b);
            }}
          >
            {t("agentDetail.runs.compare")}
          </Button>
        </span>
      </div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <caption style={s.srOnly}>{t("agentDetail.runs.title")}</caption>
          <thead>
            <tr>
              <th scope="col" style={s.th}>
                <span style={s.srOnly}>{t("agentDetail.runs.columns.select")}</span>
              </th>
              <th scope="col" style={s.th}>{t("agentDetail.runs.columns.ranAt")}</th>
              <th scope="col" style={s.th}>{t("agentDetail.runs.columns.version")}</th>
              <th scope="col" style={s.th}>{t("agentDetail.runs.columns.recall")}</th>
              <th scope="col" style={s.th}>{t("agentDetail.runs.columns.precision")}</th>
              <th scope="col" style={s.th}>{t("agentDetail.runs.columns.citation")}</th>
              <th scope="col" style={s.th}>{t("agentDetail.runs.columns.pass")}</th>
              <th scope="col" style={s.th}>{t("agentDetail.runs.columns.cost")}</th>
              <th scope="col" style={s.th}>{t("agentDetail.runs.columns.status")}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const comparable = isComparableStatus(run.status);
              const isSelected = selected.includes(run.id);
              const pass = passParts(run);
              return (
                <tr
                  key={run.id}
                  style={{ ...s.clickableRow, ...(isSelected ? s.rowSelected : null) }}
                  onClick={() => onOpenRun(run.id)}
                >
                  <td style={s.checkCell} onClick={(e) => e.stopPropagation()}>
                    <label
                      style={s.checkLabel(!comparable)}
                      title={comparable ? undefined : t("tooltips.compareUnfinished")}
                    >
                      <input
                        type="checkbox"
                        style={s.checkbox}
                        checked={isSelected}
                        disabled={!comparable}
                        aria-label={t("agentDetail.runs.selectRun", { version: run.agent_version })}
                        onChange={() => setPicked(toggleSelection(selected, run.id))}
                      />
                    </label>
                  </td>
                  <td style={s.td}>
                    <span className="mono" style={s.mono}>{formatRanAt(run.started_at)}</span>
                  </td>
                  <td style={s.td}>
                    <button
                      type="button"
                      className="mono"
                      style={s.versionBtn}
                      aria-label={t("agentDetail.runs.openRun", { version: run.agent_version })}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenRun(run.id);
                      }}
                    >
                      v{run.agent_version}
                    </button>
                  </td>
                  <td style={s.td}><MetricBar value={metricValue(run, "recall")} color={METRIC_COLORS.recall} /></td>
                  <td style={s.td}><MetricBar value={metricValue(run, "precision")} color={METRIC_COLORS.precision} /></td>
                  <td style={s.td}><MetricBar value={metricValue(run, "citation_accuracy")} color={METRIC_COLORS.citation} /></td>
                  <td style={s.td}>
                    <span className="tnum" style={s.pass}>
                      {run.metrics ? `${pass.passed}/${pass.total}` : EM_DASH}
                    </span>
                  </td>
                  <td style={s.td}>
                    <span className="mono tnum" style={s.mono}>{formatCostUsd(run.cost_usd)}</span>
                  </td>
                  <td style={s.td}><RunStatusBadge status={run.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
