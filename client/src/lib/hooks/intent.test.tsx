/* intent.test.tsx — direct unit coverage for useClassifyIntent (specs/03-intent-layer.md
   §11/§12 work-item 9). Mirrors the fetch-mock + QueryClientProvider pattern used by
   LinkToAgentPanel.test.tsx: the previous IntentCard.test.tsx only exercised the hook
   through a mock, so nothing asserted the actual request it sends or the invalidation
   it triggers — this file does. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useClassifyIntent,
  useIntentClassification,
  CLASSIFY_POLL_MS,
  CLASSIFY_TIMEOUT_MS,
} from "./intent";

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

describe("useIntentClassification", () => {
  it("stays 'classifying' after the POST returns, until classified_at changes, then reports done", async () => {
    const calls = mockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onStarted = vi.fn();
    const onDone = vi.fn();

    const { result, rerender } = renderHook(
      ({ at }: { at: string | null }) => useIntentClassification("pr1", at, { onStarted, onDone }),
      { wrapper: wrapper(qc), initialProps: { at: "2026-09-20T00:00:00.000Z" } },
    );
    expect(result.current.isClassifying).toBe(false);

    await act(async () => {
      result.current.start();
    });
    await vi.waitFor(() => expect(onStarted).toHaveBeenCalled());
    expect(calls.some((c) => c.method === "POST" && /\/pulls\/pr1\/intent$/.test(c.url))).toBe(true);
    // The POST has resolved, but the background job hasn't landed yet.
    expect(result.current.isClassifying).toBe(true);
    expect(onDone).not.toHaveBeenCalled();

    rerender({ at: "2026-09-24T12:00:00.000Z" });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.isClassifying).toBe(false);
  });

  it("polls the pull query while waiting and gives up with onTimeout after CLASSIFY_TIMEOUT_MS", async () => {
    vi.useFakeTimers();
    mockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const onTimeout = vi.fn();

    const { result } = renderHook(() => useIntentClassification("pr1", null, { onTimeout }), {
      wrapper: wrapper(qc),
    });
    await act(async () => {
      result.current.start();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isClassifying).toBe(true);

    // Over 10s the interval must fire ~5 times; useClassifyIntent's own one-off
    // 4s follow-up refetch alone would add just 1, so this proves polling.
    const before = invalidateSpy.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(CLASSIFY_POLL_MS * 5));
    expect(invalidateSpy.mock.calls.length - before).toBeGreaterThanOrEqual(5);

    await act(() => vi.advanceTimersByTimeAsync(CLASSIFY_TIMEOUT_MS));
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.isClassifying).toBe(false);
  });

  it("reports a failed POST through onError and does not stay 'classifying'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) }) as Response),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const onError = vi.fn();

    const { result } = renderHook(() => useIntentClassification("pr1", null, { onError }), {
      wrapper: wrapper(qc),
    });
    await act(async () => {
      result.current.start();
    });
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(result.current.isClassifying).toBe(false);
  });

  it("stops polling (once) when re-reading the PR fails, instead of retrying into an outage", async () => {
    vi.useFakeTimers();
    mockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onPollFailed = vi.fn();

    const { result } = renderHook(() => useIntentClassification("pr1", null, { onPollFailed }), {
      wrapper: wrapper(qc),
    });
    await act(async () => {
      result.current.start();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isClassifying).toBe(true);

    // The pull query is now in an error state (e.g. the API went down).
    vi.spyOn(qc, "getQueryState").mockReturnValue({
      status: "error",
      errorUpdatedAt: Date.now() + 1,
    } as ReturnType<QueryClient["getQueryState"]>);
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    await act(() => vi.advanceTimersByTimeAsync(CLASSIFY_POLL_MS * 5));

    expect(onPollFailed).toHaveBeenCalledTimes(1);
    expect(result.current.isClassifying).toBe(false);
    expect(invalidateSpy.mock.calls.filter(([arg]) => JSON.stringify(arg) === JSON.stringify({ queryKey: ["pull", "pr1"] })).length).toBeLessThanOrEqual(1);
  });

  it("ignores an error left on the pull query from before the run and keeps polling", async () => {
    vi.useFakeTimers();
    mockFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onPollFailed = vi.fn();
    vi.spyOn(qc, "getQueryState").mockReturnValue({
      status: "error",
      errorUpdatedAt: Date.now() - 60_000,
    } as ReturnType<QueryClient["getQueryState"]>);

    const { result } = renderHook(() => useIntentClassification("pr1", null, { onPollFailed }), {
      wrapper: wrapper(qc),
    });
    await act(async () => {
      result.current.start();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(() => vi.advanceTimersByTimeAsync(CLASSIFY_POLL_MS * 3));

    expect(onPollFailed).not.toHaveBeenCalled();
    expect(result.current.isClassifying).toBe(true);
  });
});
