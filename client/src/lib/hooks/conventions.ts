/* hooks/conventions.ts — React Query hooks for the Conventions page
   (/conventions). Imported directly by its route, like `skills.ts` —
   not re-exported from the `lib/hooks` barrel. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionDraftGrouping,
  ConventionExtractionMode,
  ConventionsSnapshot,
  SkillDraft,
} from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionsSnapshot>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * Runs the (synchronous) extraction. `mode` picks the source: `local` (config
 * files parsed into rules, no model call), `ai` (sampled files through the
 * cheap model), or `both` (pools both — callers default to this). The
 * response is the full fresh snapshot, so it's written straight into the
 * cache instead of triggering a refetch — this is also what makes a re-scan
 * replace the displayed list.
 */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: ConventionExtractionMode) =>
      api.post<ConventionsSnapshot>(`/repos/${repoId}/conventions/extract`, { mode }),
    onSuccess: (data) => {
      qc.setQueryData(["conventions", repoId], data);
    },
  });
}

export interface PatchConventionInput {
  id: string;
  patch: Partial<Pick<ConventionCandidate, "rule" | "category" | "status">> & {
    evidence?: Partial<ConventionCandidate["evidence"]>;
  };
}

/** Patches one candidate in place in the cached snapshot — accept/reject/edit
 *  should feel instant, and a full refetch mid bulk-accept would otherwise
 *  race N parallel PATCHes against each other. */
export function usePatchConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: PatchConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (updated) => {
      qc.setQueryData<ConventionsSnapshot>(["conventions", repoId], (prev) =>
        prev
          ? { ...prev, candidates: prev.candidates.map((c) => (c.id === updated.id ? updated : c)) }
          : prev,
      );
    },
  });
}

/** Pure preview — computes N skill drafts from accepted candidates without
 *  writing anything; nothing to invalidate. */
export function useDraftSkills(repoId: string | null | undefined) {
  return useMutation({
    mutationFn: (input: { candidate_ids: string[]; grouping: ConventionDraftGrouping }) =>
      api.post<SkillDraft[]>(`/repos/${repoId}/conventions/draft-skills`, input),
  });
}
