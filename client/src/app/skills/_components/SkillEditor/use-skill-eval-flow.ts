/* use-skill-eval-flow.ts — the one place the skill editor decides how a skill eval run
   behaves: overview, run dialog open state, which run is being followed, and why the two
   run buttons (header "Run on evals" and the tab's "Run all evals") are disabled. It lives
   at SkillEditor level so the header button and the Evals tab share a single state; the
   data itself comes from hooks/skill-eval.ts (SPEC-09: AC-20, AC-33, AC-34, EC-11, EC-13). */
"use client";

import React from "react";
import type { EvalSkillRunDetail } from "@devdigest/shared";
import { useSkillEvalOverview, useSkillEvalRun } from "@/lib/hooks/skill-eval";

/** Why the run buttons are disabled; `null` means a run may be started. */
export type RunBlock = "loading" | "running" | "no_agent" | "no_cases" | null;

/** The `skills.evals.runHint.*` key explaining a disabled run button (EC-11, EC-13, AC-33). */
export function runHintKey(block: RunBlock): "noAgent" | "noCases" | "running" | null {
  if (block === "no_agent") return "noAgent";
  if (block === "no_cases") return "noCases";
  if (block === "running") return "running";
  return null;
}

export function useSkillEvalFlow(skillId: string) {
  const overview = useSkillEvalOverview(skillId);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [startedRunId, setStartedRunId] = React.useState<string | null>(null);
  const [finished, setFinished] = React.useState<EvalSkillRunDetail | null>(null);

  // The editor stays mounted when the route switches to another skill, so the run this tab
  // started (and its outcome) must not follow along: reset during render, before the stale
  // run id reaches the polling hook (B1).
  const [flowSkillId, setFlowSkillId] = React.useState(skillId);
  if (flowSkillId !== skillId) {
    setFlowSkillId(skillId);
    setDialogOpen(false);
    setStartedRunId(null);
    setFinished(null);
  }

  const data = overview.data;
  const runningRunId = data?.running_run_id ?? null;
  // A run the server reports as running (another tab, a reload) wins over the one this tab started.
  const followId = runningRunId ?? startedRunId;
  const run = useSkillEvalRun(followId, { onFinished: setFinished });

  let block: RunBlock = null;
  if (!data) block = "loading";
  else if (runningRunId !== null || run.isRunning) block = "running";
  else if (data.carriers.length === 0) block = "no_agent";
  else if (data.cases_total === 0) block = "no_cases";

  const openDialog = React.useCallback(() => setDialogOpen(true), []);
  const closeDialog = React.useCallback(() => setDialogOpen(false), []);
  /** The dialog started (or joined) a run: follow it and forget the previous outcome. */
  const onStarted = React.useCallback((runId: string) => {
    setFinished(null);
    setStartedRunId(runId);
  }, []);

  return { overview, run, followId, finished, block, dialogOpen, openDialog, closeDialog, onStarted };
}

export type SkillEvalFlow = ReturnType<typeof useSkillEvalFlow>;
