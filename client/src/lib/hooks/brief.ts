/* hooks/brief.ts — React Query hooks for the PR Brief (specs/06-pr-brief.md).
   `useBrief` reads GET /pulls/:id/brief. `useBriefGeneration` fires
   POST /pulls/:id/brief (202, fire-and-forget) and tracks it by polling the
   GET until `generated_at` or `last_error_at` moves past a baseline captured
   BEFORE the POST — so a 409 (another tab, an earlier run) tracks the
   existing run instead of failing (F12). */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BriefResponse } from "@devdigest/shared";
import { api, ApiError } from "../api";

export const BRIEF_POLL_MS = 2000;
/** Client give-up. The server deadline is 90 s; this leaves ~30 s of margin. */
export const BRIEF_TIMEOUT_MS = 120_000;

export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["brief", prId],
    queryFn: () => api.get<BriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    // A reload mid-generation: keep re-reading until the server settles.
    refetchInterval: (q) => (q.state.data?.generating ? BRIEF_POLL_MS : false),
  });
}

export function useGenerateBrief(prId: string | null | undefined) {
  return useMutation({
    mutationFn: () => api.post<{ status: "running" }>(`/pulls/${prId}/brief`),
  });
}

export type BriefOutcome = "done" | "error" | "timeout" | "poll_failed" | "config_error" | null;

export interface BriefBaseline {
  generatedAt: string | null;
  lastErrorAt: string | null;
}

export function baselineOf(data: BriefResponse | undefined): BriefBaseline {
  return {
    generatedAt: data?.meta?.generated_at ?? null,
    lastErrorAt: data?.meta?.last_error_at ?? null,
  };
}

/** True once either timestamp differs from the baseline. */
export function hasAdvanced(data: BriefResponse | undefined, baseline: BriefBaseline): boolean {
  const cur = baselineOf(data);
  return cur.generatedAt !== baseline.generatedAt || cur.lastErrorAt !== baseline.lastErrorAt;
}

export function useBriefGeneration(prId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useBrief(prId);
  const generate = useGenerateBrief(prId);
  const [run, setRun] = React.useState<{ startedAt: number; baseline: BriefBaseline } | null>(null);
  const [outcome, setOutcome] = React.useState<BriefOutcome>(null);

  const start = React.useCallback(() => {
    if (run || generate.isPending || !prId) return;
    // Baseline first: a 409 must track the run that is already going.
    const baseline = baselineOf(query.data);
    setOutcome(null);
    generate.mutate(undefined, {
      onSuccess: () => setRun({ startedAt: Date.now(), baseline }),
      onError: (err) => {
        if (err instanceof ApiError && err.status === 409) {
          setRun({ startedAt: Date.now(), baseline });
        } else if (err instanceof ApiError && err.code === "config_error") {
          setOutcome("config_error");
        }
        // Other failures are already toasted by the global MutationCache.
      },
    });
  }, [run, generate, prId, query.data]);

  // Done: a timestamp moved and the server is no longer generating.
  React.useEffect(() => {
    if (!run || !query.data || query.data.generating) return;
    if (hasAdvanced(query.data, run.baseline)) {
      setRun(null);
      const m = query.data.meta;
      const failed = !!m?.last_error_at && m.last_error_at !== run.baseline.lastErrorAt;
      setOutcome(failed ? "error" : "done");
    }
  }, [run, query.data]);

  // Poll while waiting; stop on timeout or after the first failed re-read.
  React.useEffect(() => {
    if (!run || !prId) return;
    const id = setInterval(() => {
      if (Date.now() - run.startedAt >= BRIEF_TIMEOUT_MS) {
        clearInterval(id);
        setRun(null);
        setOutcome("timeout");
        return;
      }
      const state = qc.getQueryState(["brief", prId]);
      if (state?.status === "error" && state.errorUpdatedAt >= run.startedAt) {
        clearInterval(id);
        setRun(null);
        setOutcome("poll_failed");
        return;
      }
      qc.invalidateQueries({ queryKey: ["brief", prId] });
    }, BRIEF_POLL_MS);
    return () => clearInterval(id);
  }, [run, prId, qc]);

  return {
    query,
    start,
    outcome,
    /** True from the click until the result lands, or while the server says so. */
    isGenerating: generate.isPending || run !== null || !!query.data?.generating,
  };
}
