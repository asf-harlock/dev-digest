/* hooks/intent.ts — React Query hook for the Intent Layer (specs/03-intent-layer.md).
   Mirrors reviews.ts's useRunReview: a fire-and-forget mutation hitting
   POST /pulls/:id/intent. There is no SSE for classification (D11) — the
   result shows up the next time GET /pulls/:id is read, so a re-run
   invalidates the pull detail query immediately, then again after a short
   delay to pick up the background classification once it finishes. */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/** How long to wait before the follow-up refetch that picks up a completed
 *  background classification (it's a single cheap model call, D2). */
const CLASSIFY_FOLLOWUP_DELAY_MS = 4000;

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
