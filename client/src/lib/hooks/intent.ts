/* hooks/intent.ts — React Query hook for the Intent Layer (specs/03-intent-layer.md).
   Mirrors reviews.ts's useRunReview: a fire-and-forget mutation hitting
   POST /pulls/:id/intent. There is no SSE for classification (D11) — the
   result shows up the next time GET /pulls/:id is read, so a re-run
   invalidates the pull detail query immediately, then again after a short
   delay to pick up the background classification once it finishes. */
"use client";

import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/** How long to wait before the follow-up refetch that picks up a completed
 *  background classification (it's a single cheap model call, D2). */
const CLASSIFY_FOLLOWUP_DELAY_MS = 4000;

/** While a classification runs in the background, re-read the PR this often… */
export const CLASSIFY_POLL_MS = 2000;
/** …and give up waiting after this long. The server only logs a background
 *  failure (no status endpoint, D11), so a timeout is the only honest way to
 *  stop showing "classifying" when the job never lands. */
export const CLASSIFY_TIMEOUT_MS = 90_000;

export interface ClassifyIntentResponse {
  status: "running";
}

/** Triggers (re-)classification of a PR's intent. Fire-and-forget on the
 *  server — this only confirms the job started. */
export function useClassifyIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ClassifyIntentResponse>(`/pulls/${prId}/intent`),
    onSuccess: () => {
      if (!prId) return;
      qc.invalidateQueries({ queryKey: ["pull", prId] });
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["pull", prId] });
      }, CLASSIFY_FOLLOWUP_DELAY_MS);
    },
  });
}

export interface IntentClassificationCallbacks {
  /** The server accepted the job (POST returned). */
  onStarted?: () => void;
  /** A new classification landed (`classified_at` changed). */
  onDone?: () => void;
  /** Nothing landed within CLASSIFY_TIMEOUT_MS. */
  onTimeout?: () => void;
  /** The POST itself failed. (The global MutationCache already toasts it.) */
  onError?: (err: Error) => void;
  /** Polling stopped because re-reading the PR failed. (The global
   *  QueryCache already toasted that failure once.) */
  onPollFailed?: () => void;
}

/**
 * Starts a classification and tracks it until the result actually lands.
 *
 * `POST /pulls/:id/intent` is fire-and-forget, so the mutation's own
 * `isPending` lasts only as long as the request — milliseconds — while the
 * model call runs for seconds in the background. This hook keeps
 * `isClassifying` true from the click until the PR's `classified_at` changes
 * (polling the pull query every CLASSIFY_POLL_MS), or until CLASSIFY_TIMEOUT_MS.
 *
 * @param classifiedAt the PR's current `intent.classified_at` (null/undefined
 *   when never classified); a change from its value at start means "done".
 */
export function useIntentClassification(
  prId: string | null | undefined,
  classifiedAt: string | null | undefined,
  callbacks: IntentClassificationCallbacks = {},
) {
  const qc = useQueryClient();
  const { mutate, isPending } = useClassifyIntent(prId);
  const [run, setRun] = React.useState<{ startedAt: number; baseline: string | null } | null>(null);
  const cb = React.useRef(callbacks);
  cb.current = callbacks;

  const start = React.useCallback(() => {
    if (run || isPending) return;
    const baseline = classifiedAt ?? null;
    mutate(undefined, {
      onSuccess: () => {
        setRun({ startedAt: Date.now(), baseline });
        cb.current.onStarted?.();
      },
      onError: (err) => cb.current.onError?.(err as Error),
    });
  }, [run, isPending, mutate, classifiedAt]);

  // Done: the persisted classification changed since we started.
  React.useEffect(() => {
    if (run && (classifiedAt ?? null) !== run.baseline) {
      setRun(null);
      cb.current.onDone?.();
    }
  }, [run, classifiedAt]);

  // Poll the pull query while waiting; stop on timeout.
  React.useEffect(() => {
    if (!run || !prId) return;
    const id = setInterval(() => {
      if (Date.now() - run.startedAt >= CLASSIFY_TIMEOUT_MS) {
        // Stop in this tick: the effect cleanup only runs after the re-render,
        // and more ticks could fire before it (→ duplicate timeout toasts).
        clearInterval(id);
        setRun(null);
        cb.current.onTimeout?.();
        return;
      }
      // Stop instead of retrying into an outage: every failed refetch would
      // raise another global error toast (~45 over the timeout window).
      if (qc.getQueryState(["pull", prId])?.status === "error") {
        clearInterval(id);
        setRun(null);
        cb.current.onPollFailed?.();
        return;
      }
      qc.invalidateQueries({ queryKey: ["pull", prId] });
    }, CLASSIFY_POLL_MS);
    return () => clearInterval(id);
  }, [run, prId, qc]);

  return { start, isClassifying: isPending || run !== null };
}
