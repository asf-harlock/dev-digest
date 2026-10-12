/* use-case-run.ts — the one place that decides how a single-case run behaves for an owner
   (SPEC-10 AC-35, AC-39..AC-42, AC-49, EC-18, EC-19, EC-23, EC-24): which case is running, why
   every run control is disabled, the run being followed and its final status. The Evals tabs
   (row **Run**) and the Case Editor (**Run case**, **Run on save**) each call it for their owner;
   the overview (`running_run_id`, `running_case_run`) is the shared truth, so a run started in
   one place shows in the other. A skill-owned case starts through the carrier dialog
   (`components/carrier-run-dialog`), which reports the started run back via `onStarted`. */
"use client";

import React from "react";
import {
  EVAL_CASE_RUN_TIMEOUT_MS,
  useAgentEvalOverview,
  useEvalRun,
  useStartEvalCaseRun,
} from "@/lib/hooks/eval";
import { SKILL_EVAL_CASE_RUN_TIMEOUT_MS, useSkillEvalOverview, useSkillEvalRun } from "@/lib/hooks/skill-eval";
import type { CaseOwner } from "./helpers";

/** How a followed case run ended; `partial` is kept for the shared status sentences. */
export type CaseRunFinal = "completed" | "partial" | "errored";

const asFinal = (status: string): CaseRunFinal =>
  status === "partial" ? "partial" : status === "errored" ? "errored" : "completed";

export function useCaseRun(owner: CaseOwner | null) {
  const kind = owner?.kind ?? null;
  const ownerId = owner?.id ?? null;
  const agentOverview = useAgentEvalOverview(kind === "agent" ? ownerId : null);
  const skillOverview = useSkillEvalOverview(kind === "skill" ? ownerId : null);
  const overview = kind === "skill" ? skillOverview.data : agentOverview.data;
  const { mutate: startCase, isPending: starting } = useStartEvalCaseRun();

  const [started, setStarted] = React.useState<{ runId: string; caseId: string } | null>(null);
  const [finished, setFinished] = React.useState<CaseRunFinal | null>(null);

  // The editor stays mounted when the picked owner changes: a run followed for the previous
  // owner must not follow along. Reset during render, before the stale id reaches the pollers.
  const key = `${kind}:${ownerId}`;
  const [seenKey, setSeenKey] = React.useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    setStarted(null);
    setFinished(null);
  }

  const runningSetRunId = overview?.running_run_id ?? null;
  const runningCase = overview?.running_case_run ?? null;
  // A run the server reports (another tab, a reload, the other surface) wins over the local one.
  const followId = runningCase?.run_id ?? started?.runId ?? null;
  const onFinished = React.useCallback((r: { status: string }) => setFinished(asFinal(r.status)), []);
  const agentRun = useEvalRun(kind === "agent" ? followId : null, { onFinished }, { timeoutMs: EVAL_CASE_RUN_TIMEOUT_MS });
  const skillRun = useSkillEvalRun(
    kind === "skill" ? followId : null,
    { onFinished },
    { timeoutMs: SKILL_EVAL_CASE_RUN_TIMEOUT_MS },
  );
  const run = kind === "skill" ? skillRun : agentRun;

  const inFlight = started !== null && (run.isRunning || (!run.run && !run.pollFailed && !run.timedOut));
  const runningCaseId = runningCase?.case_id ?? (inFlight ? started.caseId : null);
  /** AC-49: any run of the owner — a set run or a case run — disables every run control. */
  const busy = runningSetRunId !== null || runningCaseId !== null || starting;
  /** Polling of the followed run stopped (the 3 / 6 minute cap, EC-23, or a failed poll, EC-24)
   *  while its last known status is still `running`. */
  const stalled = run.timedOut || run.pollFailed;
  /** `busy` for the Case Editor: a stalled case run no longer counts, so its **Run case** hint does
   *  not say "A run is in progress" for ever when there is no tab behind the editor to retry from.
   *  Retry resumes following (`stalled` clears). Set runs and a start in flight still count. */
  const busyLive = runningSetRunId !== null || starting || (!stalled && runningCaseId !== null);
  /** EC-19: a skill with no linked agent cannot run a case. Unknown until the overview loads. */
  const noAgent = kind === "skill" && skillOverview.data?.carriers.length === 0;

  /** A run was started (here, or by the carrier dialog): follow it and forget the last outcome. */
  const onStarted = React.useCallback((runId: string, caseId: string) => {
    setFinished(null);
    setStarted({ runId, caseId });
  }, []);

  /** Starts the run of an agent-owned case; a skill-owned one goes through the carrier dialog. */
  const startAgentCase = React.useCallback(
    (caseId: string) => {
      startCase(
        { caseId },
        {
          onSuccess: (result) => {
            if (result.kind === "started") onStarted(result.run.id, caseId);
          },
        },
      );
    },
    [startCase, onStarted],
  );

  return {
    kind,
    /** The case being run right now, wherever the run was started. */
    runningCaseId,
    busy,
    busyLive,
    stalled,
    noAgent,
    starting,
    startAgentCase,
    onStarted,
    /** The skill's overview (carriers) for the carrier dialog; undefined for an agent owner. */
    skillOverview: skillOverview.data,
    finished,
    timedOut: run.timedOut,
    pollFailed: run.pollFailed,
    retry: run.retry,
  };
}

export type CaseRunFlow = ReturnType<typeof useCaseRun>;
