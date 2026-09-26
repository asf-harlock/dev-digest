/* hooks/blast.ts — React Query hook for Blast Radius (specs/lessons/L04).
   Mirrors smart-diff.ts's shape: a thin useQuery over one GET endpoint, keyed
   so BlastRadiusCard can read it without knowing the URL. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius } from "@devdigest/shared";

/** The changed-symbols → downstream-callers/endpoints/crons map for a PR. */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
