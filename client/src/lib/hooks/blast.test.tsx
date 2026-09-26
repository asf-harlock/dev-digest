/* blast.test.tsx — direct unit coverage for useBlastRadius (specs/lessons/L04),
   mirroring smart-diff.test.tsx's fetch-mock + QueryClientProvider pattern.
   useBlastResync's polling/timeout orchestration mirrors intent.test.tsx's
   coverage of useIntentClassification (same fake-timers technique). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useBlastRadius, useBlastResync, BLAST_RESYNC_TIMEOUT_MS } from "./blast";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

interface Call {
  method: string;
  url: string;
}

function mockFetch(body: unknown): Call[] {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url: String(input) });
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useBlastRadius", () => {
  it("GETs /pulls/:id/blast and returns the parsed map", async () => {
    const body = {
      changed_symbols: [{ name: "createUser", file: "users.ts", kind: "function" }],
      downstream: [
        {
          symbol: "createUser",
          callers: [{ name: "handler", file: "routes/users.ts", line: 10 }],
          endpoints_affected: ["POST /users"],
          crons_affected: [],
        },
      ],
      summary: "1 changed symbol · 1 caller · 1 endpoint",
    };
    const calls = mockFetch(body);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useBlastRadius("pr1"), { wrapper: wrapper(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const get = calls.find((c) => c.method === "GET");
    expect(get?.url).toMatch(/\/pulls\/pr1\/blast$/);
    expect(result.current.data).toEqual(body);
  });

  it("does not fetch when prId is null/undefined", () => {
    mockFetch({});
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useBlastRadius(null), { wrapper: wrapper(qc) });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

/** Routes GET /repos/:id/index-state to a FRESH COPY of `state()` on every
 *  call — a test mutates the same underlying object mid-run to simulate the
 *  index advancing, and TanStack Query's structural sharing needs a new
 *  object reference per fetch to ever notice, since mutating-in-place would
 *  otherwise mutate the previously-cached reference too. POST
 *  /repos/:id/resync gets a 202-shaped body. Optionally fails the
 *  index-state GET once `failing()` flips true, to exercise the "stop on the
 *  first failed poll tick" path. */
function mockResyncFetch(state: () => object, failing: () => boolean = () => false): Call[] {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = String(input);
    calls.push({ method, url });
    if (url.includes("/index-state")) {
      if (failing()) {
        return { ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ ...state() }) } as Response;
    }
    return { ok: true, status: 202, json: async () => ({ status: "queued" }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

describe("useBlastResync", () => {
  it("keeps isResyncing true after the fire-and-forget POST, until the index state advances, then invalidates the blast query", async () => {
    vi.useFakeTimers();
    const state = { status: "full", filesIndexed: 10, filesSkipped: 0, lastIndexedSha: "sha1", updatedAt: "t0" };
    const calls = mockResyncFetch(() => state);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useBlastResync("pr1", "repo1"), { wrapper: wrapper(qc) });
    // Let the initial (unpolled) index-state GET resolve, so start() captures
    // a real baseline instead of "no data yet".
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.isResyncing).toBe(false);

    await act(async () => {
      result.current.start();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls.some((c) => c.method === "POST" && /\/repos\/repo1\/resync$/.test(c.url))).toBe(true);
    // The POST resolved, but the reindex it kicked off hasn't landed yet.
    expect(result.current.isResyncing).toBe(true);
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["blast", "pr1"] });

    // The index-state row advances (a real resync landing).
    state.lastIndexedSha = "sha2";
    state.updatedAt = "t1";
    await act(() => vi.advanceTimersByTimeAsync(1600));

    expect(result.current.isResyncing).toBe(false);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["blast", "pr1"] });
  });

  it("gives up after BLAST_RESYNC_TIMEOUT_MS when the index state never advances", async () => {
    vi.useFakeTimers();
    const state = { status: "full", filesIndexed: 10, filesSkipped: 0, lastIndexedSha: "sha1", updatedAt: "t0" };
    mockResyncFetch(() => state);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useBlastResync("pr1", "repo1"), { wrapper: wrapper(qc) });
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(async () => {
      result.current.start();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isResyncing).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(BLAST_RESYNC_TIMEOUT_MS));

    expect(result.current.isResyncing).toBe(false);
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["blast", "pr1"] });
  });

  it("stops polling (without invalidating) on the first failed index-state tick since the run started", async () => {
    vi.useFakeTimers();
    const state = { status: "full", filesIndexed: 10, filesSkipped: 0, lastIndexedSha: "sha1", updatedAt: "t0" };
    let failing = false;
    mockResyncFetch(() => state, () => failing);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useBlastResync("pr1", "repo1"), { wrapper: wrapper(qc) });
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(async () => {
      result.current.start();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isResyncing).toBe(true);

    // The API goes down mid-poll — every failed tick is already toasted
    // globally (client/INSIGHTS.md), so this must stop instead of retrying.
    failing = true;
    await act(() => vi.advanceTimersByTimeAsync(1600));

    expect(result.current.isResyncing).toBe(false);
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["blast", "pr1"] });
  });

  it("does not start a second resync while one is already being tracked", async () => {
    vi.useFakeTimers();
    const state = { status: "full", filesIndexed: 10, filesSkipped: 0, lastIndexedSha: "sha1", updatedAt: "t0" };
    const calls = mockResyncFetch(() => state);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useBlastResync("pr1", "repo1"), { wrapper: wrapper(qc) });
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(async () => {
      result.current.start();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isResyncing).toBe(true);

    // A second click while the first run is still being tracked (e.g. a
    // stray Enter before the Button's own `loading` disables it) must not
    // fire a second POST.
    await act(async () => {
      result.current.start();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(calls.filter((c) => c.method === "POST").length).toBe(1);
  });
});
