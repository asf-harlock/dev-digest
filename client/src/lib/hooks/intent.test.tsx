/* intent.test.tsx — direct unit coverage for useClassifyIntent (specs/03-intent-layer.md
   §11/§12 work-item 9). Mirrors the fetch-mock + QueryClientProvider pattern used by
   LinkToAgentPanel.test.tsx: the previous IntentCard.test.tsx only exercised the hook
   through a mock, so nothing asserted the actual request it sends or the invalidation
   it triggers — this file does. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useClassifyIntent } from "./intent";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

interface Call {
  method: string;
  url: string;
}

function mockFetch(): Call[] {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url: String(input) });
    return { ok: true, status: 200, json: async () => ({ status: "running" }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useClassifyIntent", () => {
  it("POSTs to /pulls/:id/intent and invalidates the pull query on success", async () => {
    const calls = mockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useClassifyIntent("pr1"), { wrapper: wrapper(qc) });
    // `mutateAsync` (unlike `mutate`) returns a promise, so awaiting it inside
    // `act()` resolves the whole mutation lifecycle deterministically — no
    // arbitrary polling/`waitFor` needed for the success path itself.
    await act(() => result.current.mutateAsync());

    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toMatch(/\/pulls\/pr1\/intent$/);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["pull", "pr1"] });
  });

  it("schedules a follow-up invalidate to pick up the background classification (no SSE, D11)", async () => {
    vi.useFakeTimers();
    mockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useClassifyIntent("pr1"), { wrapper: wrapper(qc) });
    await act(() => result.current.mutateAsync());
    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(invalidateSpy).toHaveBeenCalledTimes(2);
  });

  it("skips invalidation (but still doesn't crash) when prId is null", async () => {
    mockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useClassifyIntent(null), { wrapper: wrapper(qc) });
    await act(() => result.current.mutateAsync());

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
