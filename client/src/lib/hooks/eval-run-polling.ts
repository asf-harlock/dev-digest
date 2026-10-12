/* hooks/eval-run-polling.ts — the polling loop shared by agent runs (`useEvalRun`,
   SPEC-08) and skill runs (`useSkillEvalRun`, SPEC-09): one place for "re-read a
   running run every N ms, stop on a timeout or a failed poll, refresh once on finish".
   The callers differ only in the endpoint, the query key, the timeout and what a
   finished run invalidates. Contracts are imported as TYPES only (client/INSIGHTS.md). */
"use client";

import React from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

/** The slice of a run record the loop reads; agent and skill run details both satisfy it. */
export interface PolledRun {
  id: string;
  status: string;
  cases_done: number;
  cases_total: number;
}

export interface RunPollingCallbacks<TRun> {
  /** The run left `running` (completed / partial / errored). Fires once per run. */
  onFinished?: (run: TRun) => void;
  /** Still `running` after the timeout; polling stopped. */
  onTimeout?: () => void;
  /** Polling stopped because a poll request failed — the global QueryCache already
   *  toasted it once; do not toast again. */
  onPollFailed?: () => void;
}

export interface RunPollingOptions<TRun> {
  runId: string | null | undefined;
  /** Cache key of the run query; the loop invalidates it on every tick. */
  queryKey: readonly unknown[];
  fetchRun: (runId: string) => Promise<TRun>;
  pollMs: number;
  timeoutMs: number;
  /** Invalidate whatever the finished run changed (overview, case list, dashboard…). */
  onSettled: (run: TRun, qc: QueryClient) => void;
  callbacks?: RunPollingCallbacks<TRun>;
}

export function useRunPolling<TRun extends PolledRun>({
  runId,
  queryKey,
  fetchRun,
  pollMs,
  timeoutMs,
  onSettled,
  callbacks = {},
}: RunPollingOptions<TRun>) {
  const qc = useQueryClient();
  const cb = React.useRef({ callbacks, onSettled, queryKey });
  // Keep the latest callbacks and key without writing a ref during render.
  React.useLayoutEffect(() => {
    cb.current = { callbacks, onSettled, queryKey };
  });

  const query = useQuery({
    queryKey,
    queryFn: () => fetchRun(runId as string),
    enabled: !!runId,
    // Surface a failed poll at once; the interval below decides to stop, not retry.
    retry: false,
  });

  const [halt, setHalt] = React.useState<{ runId: string; reason: "timeout" | "failed" } | null>(
    null,
  );
  const halted = halt && halt.runId === runId ? halt.reason : null;
  const pollStart = React.useRef<{ runId: string; at: number } | null>(null);

  const run = query.data;
  const status = run?.status;
  const isRunning = status === "running";
  const polling = !!runId && isRunning && halted === null;

  // Poll while running; stop on timeout or a failed poll.
  React.useEffect(() => {
    if (!polling || !runId) return;
    if (pollStart.current?.runId !== runId) pollStart.current = { runId, at: Date.now() };
    const startedAt = pollStart.current.at;
    const id = setInterval(() => {
      if (Date.now() - startedAt >= timeoutMs) {
        // Stop in this tick: the effect cleanup only runs after the re-render,
        // and more ticks could fire before it (→ duplicate timeout callbacks).
        clearInterval(id);
        setHalt({ runId, reason: "timeout" });
        cb.current.callbacks.onTimeout?.();
        return;
      }
      // Stop instead of retrying into an outage — every failed refetch would raise
      // another global error toast. Only a failure since this window started counts.
      const state = qc.getQueryState(cb.current.queryKey);
      if (state?.status === "error" && state.errorUpdatedAt >= startedAt) {
        clearInterval(id);
        setHalt({ runId, reason: "failed" });
        cb.current.callbacks.onPollFailed?.();
        return;
      }
      qc.invalidateQueries({ queryKey: cb.current.queryKey });
    }, pollMs);
    return () => clearInterval(id);
  }, [polling, runId, qc, pollMs, timeoutMs]);

  // Finished: refresh everything the run changed, once per run.
  const finishedFor = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!run) return;
    if (run.status === "running" || finishedFor.current === run.id) return;
    finishedFor.current = run.id;
    cb.current.onSettled(run, qc);
    cb.current.callbacks.onFinished?.(run);
  }, [run, qc]);

  const retry = React.useCallback(() => {
    pollStart.current = null; // a fresh timeout window
    setHalt(null);
    void query.refetch();
  }, [query]);

  // The first fetch can fail before any data exists (`status` is still undefined).
  const firstFetchFailed = query.isError && !run;

  return {
    /** The run record; undefined until the first response. */
    run,
    /** First load only — not the polling refetches. */
    isLoading: query.isLoading,
    /** `status === "running"` (the polling state). */
    isRunning,
    /** `{done, total}` for "Running case {k} of {n}" (k = done + 1). */
    progress: { done: run?.cases_done ?? 0, total: run?.cases_total ?? 0 },
    /** Still running after the timeout. */
    timedOut: halted === "timeout",
    /** A poll request failed and polling stopped. Show a Retry action. */
    pollFailed: halted === "failed" || firstFetchFailed,
    /** Resume polling after a failed poll (or re-check after a timeout). */
    retry,
    error: query.error,
  };
}
