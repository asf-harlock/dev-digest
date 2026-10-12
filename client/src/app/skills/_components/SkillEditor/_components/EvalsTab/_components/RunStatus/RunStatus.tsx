"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { SkillEvalFlow } from "../../../../use-skill-eval-flow";
import { currentCaseNumber, finishedMessageKey } from "./helpers";
import { s } from "./styles";

/** Progress and outcome of the skill's run. One `aria-live="polite"` region carries
 *  "Running case {k} of {n}" (k = `cases_done` + 1) and then the final status (AC-33,
 *  AC-34); a timeout (EC-19) and a failed poll with **Retry** (EC-20) sit beside it. The
 *  region is rendered even when idle so a screen reader hears the first change. Wording is
 *  shared with the agent run (`eval.runStatus.*`). */
export function RunStatus({
  flow,
  casesTotal,
}: {
  flow: Pick<SkillEvalFlow, "run" | "followId" | "finished">;
  casesTotal: number;
}) {
  const t = useTranslations("eval");
  const { run, followId, finished } = flow;

  let status: string | null = null;
  if (run.isRunning) {
    const total = run.progress.total || casesTotal;
    status = t("runStatus.progress", { k: currentCaseNumber(run.progress.done, total), n: total });
  } else if (followId !== null && !run.run && !run.pollFailed) {
    status = t("runStatus.starting");
  } else if (finished) {
    const key = finishedMessageKey(finished);
    status =
      key === "partial"
        ? t("runStatus.live.partial", { count: finished.with?.cases_errored ?? 0 })
        : t(`runStatus.live.${key}`);
  }

  return (
    <div style={s.wrap}>
      <div aria-live="polite" role="status" style={s.live}>
        {status}
      </div>
      {run.timedOut && <span style={s.warn}>{t("runStatus.timeout")}</span>}
      {run.pollFailed && (
        <>
          <span style={s.warn}>{t("runStatus.pollFailed")}</span>
          <Button kind="ghost" size="sm" onClick={run.retry}>
            {t("runStatus.retry")}
          </Button>
        </>
      )}
      {!run.isRunning && finished?.error_reason && (
        <span style={s.reason}>{t("runStatus.errorReason", { reason: finished.error_reason })}</span>
      )}
    </div>
  );
}
