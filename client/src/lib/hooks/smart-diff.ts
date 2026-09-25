/* hooks/smart-diff.ts — React Query hook for Smart Diff (specs/lessons/L03).
   Mirrors intent.ts's shape: a thin useQuery over one GET endpoint, keyed so
   DiffTab / SmartDiffGroups can read it without knowing the URL. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiffResponse } from "@devdigest/shared";

/** The persisted files-by-role grouping + finding counts for a PR's diff. */
export function useSmartDiff(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["smart-diff", prId],
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId,
  });
}
