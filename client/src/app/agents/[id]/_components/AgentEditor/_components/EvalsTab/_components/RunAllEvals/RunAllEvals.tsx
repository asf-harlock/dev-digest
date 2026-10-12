"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalAgentRunDetail } from "@devdigest/shared";
import { useEvalRun, useStartEvalRun } from "@/lib/hooks/eval";
import { currentCaseNumber, finishedMessageKey } from "./helpers";
import { s } from "./styles";

/** "Run all evals": starts `POST /agents/:id/eval-runs`, then follows the run by
 *  polling (never by the mutation's `isPending`). Disabled while a run is in flight
 *  (AC-25) or when the agent has no cases (EC-11). Progress and the final status are
 *  announced in an `aria-live="polite"` region (AC-26). */
export function RunAllEvals({
  agentId,
  casesTotal,
  runningRunId,
}: {
  agentId: string;
  casesTotal: number;
  /** `overview.running_run_id` — a run started elsewhere (another tab) is followed too. */
  runningRunId: string | null;
}) {
  const t = useTranslations("eval");
  const start = useStartEvalRun(agentId);
  const [startedRunId, setStartedRunId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState<string | null>(null);
  const [finishedRun, setFinishedRun] = React.useState<EvalAgentRunDetail | null>(null);

  const runId = runningRunId ?? startedRunId;
  const run = useEvalRun(runId, {
    onFinished: (r) => {
      setFinishedRun(r);
      const key = finishedMessageKey(r);
      setAnnouncement(
        key === "partial"
          ? t("runStatus.live.partial", { count: r.metrics?.cases_errored ?? 0 })
          : t(`runStatus.live.${key}`),
      );
    },
  });

  const noCases = casesTotal === 0;
  const busy = start.isPending || run.isRunning || runningRunId !== null;
  const disabled = busy || noCases;
  const hint = noCases ? t("tooltips.noCases") : busy ? t("tooltips.runInProgress") : undefined;

  const onClick = () =>
    start.mutate(undefined, {
      onSuccess: (r) => {
        setFinishedRun(null);
        setAnnouncement(t("runStatus.live.started"));
        setStartedRunId(r.id);
      },
    });

  let status: string | null = announcement;
  if (run.isRunning) {
    status = t("runStatus.progress", {
      k: currentCaseNumber(run.progress.done, run.progress.total || casesTotal),
      n: run.progress.total || casesTotal,
    });
  } else if (start.isPending || (runId !== null && !run.run && !run.pollFailed)) {
    status = t("runStatus.starting");
  }

  return (
    <div style={s.wrap}>
      <span title={hint}>
        <Button kind="secondary" size="sm" icon="Play" loading={start.isPending} disabled={disabled} onClick={onClick}>
          {start.isPending ? t("evalsTab.starting") : t("evalsTab.runAll")}
        </Button>
      </span>
      <div aria-live="polite" role="status" style={s.live}>
        {status}
      </div>
      {run.timedOut && (
        <>
          <span style={s.warn}>{t("runStatus.timeout")}</span>
          <Button kind="ghost" size="sm" onClick={run.retry}>
            {t("runStatus.retry")}
          </Button>
        </>
      )}
      {run.pollFailed && (
        <>
          <span style={s.warn}>{t("runStatus.pollFailed")}</span>
          <Button kind="ghost" size="sm" onClick={run.retry}>
            {t("runStatus.retry")}
          </Button>
        </>
      )}
      {finishedRun?.error_reason && (
        <span style={s.reason}>{t("runStatus.errorReason", { reason: finishedRun.error_reason })}</span>
      )}
    </div>
  );
}
