/* useOnboardingTour (SPEC-05) — generate + poll, give-up (EC-5), poll failure (EC-6), 409 follow. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useOnboardingTour, TOUR_POLL_MS, TOUR_POLL_TIMEOUT_MS } from "./onboarding-tour";

type Reply = { status: number; body?: unknown };
let getReply: () => Reply;
let postReply: Reply;
let gets = 0;

beforeEach(() => {
  gets = 0;
  postReply = { status: 202, body: { status: "running" } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const isPost = (init?.method ?? "GET") === "POST";
      if (!isPost) gets++;
      const r = isPost ? postReply : getReply();
      return { ok: r.status < 400, status: r.status, statusText: "err", json: async () => r.body } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tour = (generating: boolean) => ({
  stored: false,
  generating,
  stale: false,
  tour: { sections: [] },
  file_count: 1,
  can_use_activity: false,
});
const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("useOnboardingTour", () => {
  it("polls after generate and stops once a read reports generating:false", async () => {
    let n = 0;
    getReply = () => ({ status: 200, body: tour(++n < 3) });
    const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    act(() => result.current.generate());
    await waitFor(() => expect(result.current.generating).toBe(true));
    await waitFor(() => expect(result.current.generating).toBe(false), { timeout: 15_000 });
    expect(result.current.timedOut).toBe(false);
    const settled = gets;
    await new Promise((r) => setTimeout(r, TOUR_POLL_MS + 500));
    expect(gets).toBe(settled); // polling stopped
  }, 30_000);

  it("a 409 from generate follows the running generation instead of failing", async () => {
    getReply = () => ({ status: 200, body: tour(true) });
    postReply = { status: 409, body: { error: { code: "conflict", message: "busy" } } };
    const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    act(() => result.current.generate());
    await waitFor(() => expect(result.current.generating).toBe(true));
  });

  it("EC-5: gives up after the timeout; Retry (generate) resumes", async () => {
    getReply = () => ({ status: 200, body: tour(true) });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    act(() => result.current.generate());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TOUR_POLL_TIMEOUT_MS + 1000);
    });
    expect(result.current.timedOut).toBe(true);
    expect(result.current.generating).toBe(false);
    act(() => result.current.generate());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current.timedOut).toBe(false);
    expect(result.current.generating).toBe(true);
  });

  it("EC-6: a failing poll stops polling and reports pollFailed", async () => {
    let fail = false;
    getReply = () => (fail ? { status: 500, body: {} } : { status: 200, body: tour(true) });
    const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    fail = true;
    await waitFor(() => expect(result.current.pollFailed).toBe(true), { timeout: 10_000 });
    const n = gets;
    await new Promise((r) => setTimeout(r, TOUR_POLL_MS + 500));
    expect(gets).toBe(n);
  }, 30_000);
});
