/* reviews.test.tsx — direct unit coverage for useDeleteRun/useDeleteReview's
   cache invalidation (pr-self-review round 2 fix). Both mutations must also
   drop the ["smart-diff", prId] cache — a review/run's findings feed Smart
   Diff's group/dot counts, same reasoning as useFindingAction. Mirrors the
   fetch-mock + QueryClientProvider pattern from `intent.test.tsx`. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDeleteRun, useDeleteReview } from "./reviews";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockFetch() {
  const fetchMock = vi.fn(async () => {
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
}

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useDeleteRun", () => {
  it("invalidates pr-runs, reviews, AND smart-diff on success", async () => {
    mockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useDeleteRun("pr1"), { wrapper: wrapper(qc) });
    await act(() => result.current.mutateAsync("run1"));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["pr-runs", "pr1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["reviews", "pr1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["smart-diff", "pr1"] });
  });
});

describe("useDeleteReview", () => {
  it("invalidates reviews AND smart-diff on success", async () => {
    mockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useDeleteReview("pr1"), { wrapper: wrapper(qc) });
    await act(() => result.current.mutateAsync("review1"));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["reviews", "pr1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["smart-diff", "pr1"] });
  });
});
