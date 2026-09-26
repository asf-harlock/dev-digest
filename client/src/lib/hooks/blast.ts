/* hooks/blast.ts — React Query hooks for Blast Radius (specs/lessons/L04).
   useBlastRadius mirrors smart-diff.ts's shape: a thin useQuery over one GET
   endpoint, keyed so BlastRadiusCard can read it without knowing the URL.
   useBlastResync mirrors intent.ts's useIntentClassification: a fire-and-
   forget POST tracked to completion via polling, not the mutation's own
   isPending. */
"use client";

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius } from "@devdigest/shared";
import { useRepoIntelStatus, useResyncRepoIntel } from "./repo-intel";

/** The changed-symbols → downstream-callers/endpoints/crons map for a PR. */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

/** How long to keep the "Rebuild index" CTA in its loading state waiting for
 *  a triggered resync to land, before giving up — mirrors intent.ts's
 *  CLASSIFY_TIMEOUT_MS. There is no push signal for "the reindex finished",
 *  only the index-state row (`lastIndexedSha`/`updatedAt`) advancing. */
export const BLAST_RESYNC_TIMEOUT_MS = 90_000;

export interface BlastResyncState {
  /** Triggers a resync and keeps the CTA loading until repo-intel's index
   *  state actually advances (or the wait times out). No-ops while a resync
   *  is already in flight or being tracked. */
  start: () => void;
  /** True from the click until the index state advances or the wait times
   *  out — NOT `useResyncRepoIntel`'s own `isPending`, which resolves in
   *  milliseconds while the real reindex runs in the background
   *  (client/INSIGHTS.md "What Doesn't Work", 2026-09-24). */
  isResyncing: boolean;
  /** Why the last tracked resync ended without the index advancing:
   *  `timeout` (nothing landed within BLAST_RESYNC_TIMEOUT_MS — e.g. the
   *  repo has no clone, so no index row is ever written) or `poll_failed`.
   *  null while idle, while running, and after a successful rebuild. */
  outcome: "timeout" | "poll_failed" | null;
}

/**
 * Tracks a repo-intel resync until its result actually lands, then
 * invalidates `["blast", prId]` so the stale map is replaced with the
 * rebuilt one. `POST /repos/:id/resync` returns 202 at once — its own
 * mutation `isPending` is not a loading state — so this instead captures a
 * baseline `lastIndexedSha`/`updatedAt` at click time, polls
 * `useRepoIntelStatus(repoId, true)` while waiting, and treats either value
 * advancing as "done" (repo-intel.ts: the status enum itself is
 * terminal-only, so completion is detected by watching the row advance).
 *
 * Stops (without a second toast) on the first failed poll tick since this
 * run started — every query failure is already toasted globally
 * (client/INSIGHTS.md "Codebase Patterns", 2026-09-24) — or after
 * BLAST_RESYNC_TIMEOUT_MS, whichever comes first.
 */
export function useBlastResync(
  prId: string | null | undefined,
  repoId: string | null | undefined,
): BlastResyncState {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  const [run, setRun] = React.useState<{
    startedAt: number;
    baseline: { sha: string; updatedAt: string } | null;
  } | null>(null);
  const [outcome, setOutcome] = React.useState<BlastResyncState["outcome"]>(null);
  const status = useRepoIntelStatus(repoId, run !== null);

  const start = React.useCallback(() => {
    if (run || resync.isPending) return;
    const current = status.data;
    const baseline = current ? { sha: current.lastIndexedSha, updatedAt: current.updatedAt } : null;
    // The POST itself failing is already toasted globally (MutationCache.onError).
    setOutcome(null);
    resync.mutate(undefined, {
      onSuccess: () => setRun({ startedAt: Date.now(), baseline }),
    });
  }, [run, resync, status.data]);

  // Done: the index state advanced past the baseline, or the poll itself
  // started failing after this run began.
  React.useEffect(() => {
    if (!run) return;
    if (status.errorUpdatedAt >= run.startedAt) {
      setRun(null);
      setOutcome("poll_failed");
      return;
    }
    const current = status.data;
    if (!current) return;
    // No baseline (index-state hadn't loaded at click time): only a row
    // written after the click counts, not the first poll result.
    const advanced = run.baseline
      ? current.lastIndexedSha !== run.baseline.sha || current.updatedAt !== run.baseline.updatedAt
      : Date.parse(current.updatedAt) >= run.startedAt;
    if (advanced) {
      setRun(null);
      if (prId) qc.invalidateQueries({ queryKey: ["blast", prId] });
    }
  }, [run, status.data, status.errorUpdatedAt, prId, qc]);

  // Give up after BLAST_RESYNC_TIMEOUT_MS if neither of the above fired.
  React.useEffect(() => {
    if (!run) return;
    const id = setTimeout(() => {
      setRun(null);
      setOutcome("timeout");
    }, BLAST_RESYNC_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [run]);

  return { start, isResyncing: resync.isPending || run !== null, outcome };
}
