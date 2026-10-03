/* hooks/pr-context.ts — React Query hooks for the per-PR Context tab
   (specs/07-pr-context.md). `usePrContext` reads GET /pulls/:id/context,
   `useSavePrContext` fires PUT /pulls/:id/context (full ordered list, last
   completed save wins) and `usePrContextPreview` reads one document on demand. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrContextEntry, PrContextPreview, PrContextResponse } from "@devdigest/shared";
import { api } from "../api";

export function usePrContext(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-context", prId],
    queryFn: () => api.get<PrContextResponse>(`/pulls/${prId}/context`),
    enabled: !!prId,
  });
}

export interface SavePrContextInput {
  /** The FULL ordered list of attached repo-relative paths (last save wins). */
  paths: string[];
}

/** Saves the PR's attached context paths. No Save button: callers fire it on
 *  every toggle/move. Optimistic — the cached list shows the new order at once
 *  and is restored on failure (EC-15). Callers disable controls while
 *  `isPending` (EC-14), so saves do not overlap. */
export function useSavePrContext(prId: string | null | undefined) {
  const qc = useQueryClient();
  const key = ["pr-context", prId];
  const mutationKey = ["save-pr-context", prId];
  return useMutation({
    mutationKey,
    mutationFn: ({ paths }: SavePrContextInput) =>
      api.put<PrContextResponse>(`/pulls/${prId}/context`, { paths }),
    onMutate: async ({ paths }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<PrContextResponse>(key);
      if (previous) {
        const known = new Map<string, PrContextEntry>(previous.entries.map((e) => [e.path, e]));
        const attachable = new Map(previous.attachable.map((a) => [a.path, a]));
        const entries: PrContextEntry[] = [];
        for (const path of paths) {
          const existing = known.get(path);
          if (existing) {
            entries.push(existing);
            continue;
          }
          const a = attachable.get(path);
          if (a) {
            entries.push({ path, kind: a.kind, origin: a.origin, status: "attached", tokens: 0, warnings: [] });
          }
        }
        qc.setQueryData<PrContextResponse>(key, { ...previous, entries });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (data) => {
      if (qc.isMutating({ mutationKey }) <= 1) qc.setQueryData(key, data);
    },
    onSettled: () => {
      if (qc.isMutating({ mutationKey }) <= 1) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function usePrContextPreview(prId: string | null | undefined, path: string | null) {
  return useQuery({
    queryKey: ["pr-context-preview", prId, path],
    queryFn: () =>
      api.get<PrContextPreview>(`/pulls/${prId}/context/preview?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!prId && !!path,
    retry: false,
  });
}

/** True when a stored fingerprint exists and differs from the current one.
 *  A null/absent stored fingerprint is "no PR context then", never stale
 *  (AC-39); an unloaded current fingerprint (undefined) is "unknown". */
export function isContextStale(
  stored: string | null | undefined,
  current: string | null | undefined,
): boolean {
  if (!stored || current === undefined) return false;
  return stored !== current;
}
