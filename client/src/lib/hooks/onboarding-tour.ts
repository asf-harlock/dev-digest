/* hooks/onboarding-tour.ts — SPEC-05 onboarding tour: GET the tour (skeleton
   or stored), POST generate, and the poll that waits for a generation to land.
   Polling ends when a read taken after the POST reports `generating: false`,
   or gives up after TOUR_POLL_TIMEOUT_MS (EC-5). A failed poll stops the loop
   (EC-6) — the global error handler already toasts, so no second toast here. */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OnboardingTourGenerateRequest, OnboardingTourResponse } from "@devdigest/shared";
import { api, ApiError } from "../api";

export const TOUR_POLL_MS = 3000;
/** Server ceiling is 180 s; give up 20 s after it (Q-2). */
export const TOUR_POLL_TIMEOUT_MS = 200_000;

export const tourKey = (repoId: string | null | undefined) => ["onboarding-tour", repoId] as const;

export function useOnboardingTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  const [pollSince, setPollSince] = React.useState<number | null>(null);
  const [gaveUp, setGaveUp] = React.useState(false);

  const query = useQuery({
    queryKey: tourKey(repoId),
    queryFn: () => api.get<OnboardingTourResponse>(`/repos/${repoId}/onboarding-tour`),
    enabled: !!repoId,
    refetchInterval: (q) => {
      if (gaveUp || q.state.status === "error") return false;
      return pollSince != null || q.state.data?.generating ? TOUR_POLL_MS : false;
    },
  });

  const serverGenerating = query.data?.generating === true;
  const waiting = !gaveUp && (pollSince != null || serverGenerating);

  // Done: a read completed after the POST and the server is no longer generating.
  React.useEffect(() => {
    if (pollSince == null || !query.data) return;
    if (!query.data.generating && query.dataUpdatedAt >= pollSince) setPollSince(null);
  }, [pollSince, query.data, query.dataUpdatedAt]);

  // The generation landed (or was never running) — clear a previous give-up.
  React.useEffect(() => {
    if (query.data && !query.data.generating && pollSince == null) setGaveUp(false);
  }, [query.data, pollSince]);

  // EC-5: stop polling after the ceiling.
  React.useEffect(() => {
    if (!waiting) return;
    const id = setTimeout(() => {
      setGaveUp(true);
      setPollSince(null);
    }, TOUR_POLL_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [waiting]);

  const start = React.useCallback(() => {
    setGaveUp(false);
    setPollSince(Date.now());
    void qc.invalidateQueries({ queryKey: tourKey(repoId) });
  }, [qc, repoId]);

  const generateMutation = useMutation({
    mutationFn: (req: OnboardingTourGenerateRequest) =>
      api.post<{ status: "running" }>(`/repos/${repoId}/onboarding-tour/generate`, req),
    onSuccess: start,
    // 409: a generation is already running — just follow it.
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) start();
    },
  });

  return {
    query,
    /** A generation is in flight and we are (still) polling for it. */
    generating: waiting,
    /** EC-5: polled for TOUR_POLL_TIMEOUT_MS without the generation landing. */
    timedOut: gaveUp,
    /** EC-6: a poll read failed; polling has stopped. */
    pollFailed: query.isError && query.data != null,
    generate: (req: OnboardingTourGenerateRequest = {}) => generateMutation.mutate(req),
    isStarting: generateMutation.isPending,
  };
}
