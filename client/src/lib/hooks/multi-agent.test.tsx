/* multi-agent.test.tsx — SPEC-11 hooks: useMultiAgentRun polling rules (AC-18, AC-19, EC-14, EC-15,
   EC-16), useStartMultiAgentRun cache invalidation (AC-12) and the estimates feed (AC-5).
   `fetch` is the outside world; the hooks, api.ts and react-query are real. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, cleanup, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { apiError, column, estimate, maRun, stubApi } from "../../test/multi-agent-fixtures";
import {
  MULTI_AGENT_POLL_MAX_MS,
  MULTI_AGENT_POLL_MS,
  useMultiAgentEstimates,
  useMultiAgentRun,
  useStartMultiAgentRun,
} from "./multi-agent";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const running = () => maRun({ columns: [column({ status: "running", run_id: "r1" }), column({ status: "done", run_id: "r2" })] });
const settled = () => maRun({ columns: [column({ status: "done", run_id: "r1" }), column({ status: "done", run_id: "r2" })] });
const runCalls = (calls: { url: string }[]) => calls.filter((c) => /\/pulls\/pr1\/multi-agent$/.test(c.url));

describe("useMultiAgentRun", () => {
  it("EC-16: a 404 resolves to `null` data — not an error", async () => {
    const calls = stubApi({ "GET /pulls/pr1/multi-agent": apiError(404, "not_found") });
    const { wrapper } = setup();
    const { result } = renderHook(() => useMultiAgentRun("pr1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
    expect(runCalls(calls)).toHaveLength(1);
  });

  it("idles (no request) without a PR id", async () => {
    vi.useFakeTimers();
    const calls = stubApi({ "GET /pulls/pr1/multi-agent": { body: running() } });
    const { wrapper } = setup();
    renderHook(() => useMultiAgentRun(null), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(MULTI_AGENT_POLL_MS * 3));
    expect(calls).toHaveLength(0);
  });

  it("AC-18/AC-19: polls every 4s while a column is running, then stops once none is", async () => {
    vi.useFakeTimers();
    let n = 0;
    const calls = stubApi({
      "GET /pulls/pr1/multi-agent": () => {
        n += 1;
        return { body: n < 3 ? running() : settled() };
      },
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useMultiAgentRun("pr1"), { wrapper });

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(runCalls(calls)).toHaveLength(1);
    expect(MULTI_AGENT_POLL_MS).toBe(4000);

    await act(() => vi.advanceTimersByTimeAsync(MULTI_AGENT_POLL_MS - 1));
    expect(runCalls(calls)).toHaveLength(1); // not before the interval
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(runCalls(calls)).toHaveLength(2);
    await act(() => vi.advanceTimersByTimeAsync(MULTI_AGENT_POLL_MS));
    expect(runCalls(calls)).toHaveLength(3);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current.data?.columns.every((c) => c.status === "done")).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(MULTI_AGENT_POLL_MS * 10));
    expect(runCalls(calls)).toHaveLength(3);
  });

  it("EC-14: a failed poll stops polling, keeps the last data and surfaces the error", async () => {
    vi.useFakeTimers();
    let outage = false;
    const calls = stubApi({
      "GET /pulls/pr1/multi-agent": () => (outage ? apiError(500, "internal") : { body: running() }),
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useMultiAgentRun("pr1"), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.data?.id).toBe("mar1");

    outage = true;
    await act(() => vi.advanceTimersByTimeAsync(MULTI_AGENT_POLL_MS + 1));
    expect(result.current.isError).toBe(true);
    expect(result.current.data?.id).toBe("mar1"); // last data kept on screen
    const stopped = runCalls(calls).length;
    await act(() => vi.advanceTimersByTimeAsync(MULTI_AGENT_POLL_MS * 10));
    expect(runCalls(calls)).toHaveLength(stopped);

    // Retry (refetch) resumes the run.
    outage = false;
    await act(async () => {
      await result.current.refetch();
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(result.current.isError).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(MULTI_AGENT_POLL_MS));
    expect(runCalls(calls).length).toBeGreaterThan(stopped + 1);
  });

  it("EC-15: gives up after 20 minutes of `running` (pollExpired) and refresh() opens a fresh window", async () => {
    vi.useFakeTimers();
    const calls = stubApi({ "GET /pulls/pr1/multi-agent": { body: running() } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useMultiAgentRun("pr1"), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.pollExpired).toBe(false);

    expect(MULTI_AGENT_POLL_MAX_MS).toBe(20 * 60 * 1000);
    await act(() => vi.advanceTimersByTimeAsync(MULTI_AGENT_POLL_MAX_MS - MULTI_AGENT_POLL_MS));
    expect(result.current.pollExpired).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(MULTI_AGENT_POLL_MS * 2));
    expect(result.current.pollExpired).toBe(true);
    const stopped = runCalls(calls).length;
    await act(() => vi.advanceTimersByTimeAsync(MULTI_AGENT_POLL_MS * 10));
    expect(runCalls(calls)).toHaveLength(stopped);

    // Refresh: one immediate re-read, polling resumes, the flag clears.
    await act(async () => {
      result.current.refresh();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pollExpired).toBe(false);
    expect(runCalls(calls)).toHaveLength(stopped + 1);
    await act(() => vi.advanceTimersByTimeAsync(MULTI_AGENT_POLL_MS * 2));
    expect(runCalls(calls).length).toBeGreaterThanOrEqual(stopped + 3);
  });
});

describe("useStartMultiAgentRun", () => {
  it("AC-12: POSTs {agentIds} to the PR's multi-agent-run route and refreshes the run + timeline caches", async () => {
    const calls = stubApi({ "POST /pulls/pr1/multi-agent-run": { body: running() } });
    const { qc, wrapper } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useStartMultiAgentRun(), { wrapper });
    await act(() => result.current.mutateAsync({ prId: "pr1", agentIds: ["a1", "a2"] }));

    expect(calls).toEqual([{ method: "POST", url: "/pulls/pr1/multi-agent-run", body: { agentIds: ["a1", "a2"] } }]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["multi-agent", "pr1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["pr-runs", "pr1"] });
  });

  it("EC-5: a 409 rejects with an ApiError the caller can branch on by status", async () => {
    stubApi({ "POST /pulls/pr1/multi-agent-run": apiError(409, "conflict") });
    const { wrapper } = setup();
    const { result } = renderHook(() => useStartMultiAgentRun(), { wrapper });
    await expect(
      act(() => result.current.mutateAsync({ prId: "pr1", agentIds: ["a1", "a2"] })),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("useMultiAgentEstimates", () => {
  it("AC-5: reads GET /multi-agent/estimates", async () => {
    stubApi({ "GET /multi-agent/estimates": { body: { agents: [estimate()] } } });
    const { wrapper } = setup();
    const { result } = renderHook(() => useMultiAgentEstimates(), { wrapper });
    await waitFor(() => expect(result.current.data?.agents).toEqual([estimate()]));
  });
});
