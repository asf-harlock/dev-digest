/* DetailHeader — back link, agent name + model, run count, agent switcher and
   **Run eval** (AC-40, EC-10, EC-15, EC-16, EC-28). The run is a background job: the
   button's request only confirms the start, and the run is followed with useEvalRun
   (polling) — `isPending` is never the loading state. Progress and the outcome are
   announced through one aria-live region. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Dropdown, Icon } from "@devdigest/ui";
import type { EvalOverview } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useAgents } from "@/lib/hooks/agents";
import { useEvalRun, useStartEvalRun } from "@/lib/hooks/eval";
import { agentHref } from "../../../../helpers";
import { currentCase, finishedTone } from "./helpers";
import { s } from "./styles";

export function DetailHeader({ overview }: { overview: EvalOverview }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const { agent } = overview;
  const { data: agents } = useAgents();
  const start = useStartEvalRun(agent.id);
  const [startedId, setStartedId] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const [startError, setStartError] = React.useState<string | null>(null);

  // A run seen by the server wins over the one this tab started.
  const followId = overview.running_run_id ?? startedId;
  const run = useEvalRun(followId, {
    onFinished: (r) => {
      const tone = finishedTone(r);
      setAnnounce(
        tone === "partial"
          ? t("runStatus.live.partial", { count: r.metrics?.cases_errored ?? 0 })
          : tone === "completed"
            ? t("runStatus.live.completed")
            : t("runStatus.live.errored"),
      );
    },
  });

  const waiting = !!followId && (run.isLoading || run.isRunning) && !run.timedOut && !run.pollFailed;
  const busy = start.isPending || waiting;
  const noCases = overview.cases_total === 0;
  const disabled = busy || noCases;
  const reason = busy ? t("tooltips.runInProgress") : noCases ? t("tooltips.noCases") : "";

  let status = announce;
  if (start.isPending || (waiting && !run.isRunning)) status = t("runStatus.starting");
  else if (run.isRunning && !run.timedOut && !run.pollFailed) {
    status = t("runStatus.progress", {
      k: currentCase(run.progress.done, run.progress.total),
      n: run.progress.total,
    });
  } else if (run.timedOut) status = t("runStatus.timeout");
  else if (run.pollFailed) status = t("runStatus.pollFailed");

  const onRun = () => {
    setAnnounce("");
    setStartError(null);
    start.mutate(undefined, {
      onSuccess: (r) => setStartedId(r.id),
      onError: (err) => {
        // Everything but "no cases" is already toasted once by the global handler.
        if (err instanceof ApiError && err.code === "no_eval_cases") setStartError(t("errors.startNoCases"));
      },
    });
  };

  return (
    <header>
      <Link href="/eval" style={s.back}>
        <Icon.ChevronLeft size={14} />
        {t("agentDetail.allAgents")}
      </Link>
      <div style={s.row}>
        <div>
          <div style={s.titleRow}>
            <h1 style={s.name} title={agent.name}>
              {agent.name}
            </h1>
            <Badge mono color="var(--text-secondary)">
              {agent.model}
            </Badge>
            {!agent.enabled && <Badge color="var(--text-secondary)">{t("dashboard.disabledBadge")}</Badge>}
          </div>
          <p style={s.subtitle}>
            {t("agentDetail.runsOnSet", { runs: overview.finished_runs, cases: overview.cases_total })}
          </p>
        </div>
        <div style={s.actions}>
          <Dropdown
            width={240}
            align="right"
            trigger={
              <Button
                kind="secondary"
                size="sm"
                icon="Cpu"
                iconRight="ChevronDown"
                aria-label={t("agentDetail.agentSwitcherLabel")}
                aria-haspopup="menu"
                title={t("agentDetail.agentSwitcherLabel")}
              >
                {agent.name}
              </Button>
            }
            items={(agents ?? []).map((a) => ({
              label: a.name,
              icon: "Cpu" as const,
              onClick: () => router.push(agentHref(a.id)),
            }))}
          />
          <span title={reason || undefined}>
            <Button
              kind="primary"
              size="sm"
              icon="Play"
              disabled={disabled}
              aria-describedby={reason ? "eval-run-reason" : undefined}
              onClick={onRun}
            >
              {t("agentDetail.runEval")}
            </Button>
          </span>
          {reason && (
            <span id="eval-run-reason" style={s.srOnly}>
              {reason}
            </span>
          )}
        </div>
      </div>
      <div role="status" aria-live="polite" style={s.live}>
        <span>{status}</span>
        {run.pollFailed && (
          <Button kind="ghost" size="sm" onClick={run.retry}>
            {t("runStatus.retry")}
          </Button>
        )}
        {startError && <span style={s.error}>{startError}</span>}
      </div>
    </header>
  );
}
