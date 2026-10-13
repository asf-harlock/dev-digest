/* hooks/multi-agent.ts — React Query hooks for Multi-Agent Review (specs/11-multi-agent-review.md).
   `useMultiAgentEstimates` reads GET /multi-agent/estimates; `useMultiAgentRun` reads the
   latest GROUPED run of a PR (GET /pulls/:id/multi-agent) and polls it while a column is
   running; `useStartMultiAgentRun` fires POST /pulls/:id/multi-agent-run. Contracts are
   imported as TYPES only (client/INSIGHTS.md). */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MultiAgentEstimates,
  MultiAgentRun,
  MultiAgentRunRequest,
} from "@devdigest/shared";
import { api, ApiError } from "../api";

/** Re-read the grouped run this often while any column is `running`. */
export const MULTI_AGENT_POLL_MS = 4000;
/** Client give-up for one polling window (EC-15): after this the page shows "not up to date". */
export const MULTI_AGENT_POLL_MAX_MS = 20 * 60 * 1000;

const hasRunningColumn = (run: MultiAgentRun | null | undefined): boolean =>
  !!run && run.columns.some((c) => c.status === "running");

/** Per-agent median duration/cost over its last done runs (feeds the popover and Configure). */
export function useMultiAgentEstimates() {
  return useQuery({
    queryKey: ["multi-agent-estimates"],
    queryFn: () => api.get<MultiAgentEstimates>("/multi-agent/estimates"),
  });
}

/**
 * The latest multi-agent run of a PR. A 404 means "no run yet" and resolves to
 * `data: null` (neither an error nor a toast). Polls every 4 s while a column is
 * running; stops on a failed poll (EC-14, `error` is set — the page offers Retry) and
 * after MULTI_AGENT_POLL_MAX_MS (EC-15, `pollExpired` — the page offers `refresh()`).
 */
export function useMultiAgentRun(prId: string | null | undefined) {
  // `window` bumps on refresh() so a new polling window gets a fresh timeout.
  const [pollWindow, setPollWindow] = React.useState(0);
  const [expired, setExpired] = React.useState<{ runId: string; window: number } | null>(null);

  const query = useQuery<MultiAgentRun | null>({
    queryKey: ["multi-agent", prId],
    queryFn: async () => {
      try {
        return await api.get<MultiAgentRun>(`/pulls/${prId}/multi-agent`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: !!prId,
    // A failed poll must surface at once; the interval below decides to stop, not retry.
    retry: false,
    refetchInterval: (q) => {
      if (q.state.status === "error") return false;
      const run = q.state.data;
      const stale = !!run && expired?.runId === run.id && expired.window === pollWindow;
      return hasRunningColumn(run) && !stale ? MULTI_AGENT_POLL_MS : false;
    },
  });

  const run = query.data;
  const runId = run?.id;
  const running = hasRunningColumn(run);

  // Arm the give-up timer for this polling window; a finished run or a new window clears it.
  React.useEffect(() => {
    if (!running || !runId) return;
    const id = setTimeout(
      () => setExpired({ runId, window: pollWindow }),
      MULTI_AGENT_POLL_MAX_MS,
    );
    return () => clearTimeout(id);
  }, [running, runId, pollWindow]);

  const pollExpired =
    running && !!runId && expired?.runId === runId && expired.window === pollWindow;

  const { refetch } = query;
  const refresh = React.useCallback(() => {
    setPollWindow((w) => w + 1); // a fresh timeout window
    void refetch();
  }, [refetch]);

  return { ...query, pollExpired, refresh };
}

export interface StartMultiAgentRunInput extends MultiAgentRunRequest {
  prId: string;
}

/** Start one grouped run for the chosen agents. 409 (a grouped run is already running) is
    for the caller to branch on by `ApiError.status`. */
export function useStartMultiAgentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: StartMultiAgentRunInput) =>
      api.post<MultiAgentRun>(`/pulls/${prId}/multi-agent-run`, { agentIds }),
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: ["multi-agent", prId] });
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
    },
  });
}
