/* eval.test.tsx — SPEC-08 hooks: useEvalRun polling (AC-25/26, EC-15, EC-16) and
   useCreateEvalCaseFromFinding (AC-8, EC-3, EC-4/5). `fetch` is the outside world;
   the hooks, api.ts and react-query are real. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { EvalCaseLinks } from "@devdigest/shared";
import { runDetail } from "../../test/eval-fixtures";
import {
  EVAL_RUN_POLL_MS,
  EVAL_RUN_TIMEOUT_MS,
  evalKeys,
  useCreateEvalCaseFromFinding,
  useEvalRun,
} from "./eval";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

type Reply = { status: number; body?: unknown };

/** Stubs fetch: `handler(method, url)` decides the reply; every call is recorded. */
function stubFetch(handler: (method: string, url: string) => Reply) {
  const calls: { method: string; url: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = String(input);
      calls.push({ method, url });
      const r = handler(method, url);
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        statusText: "",
        json: async () => r.body,
      } as Response;
    }),
  );
  return calls;
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const runCalls = (calls: { url: string }[]) => calls.filter((c) => /\/eval-runs\/run1$/.test(c.url));

describe("useEvalRun", () => {
  it("AC-26: polls every 2s while running, stops once finished, refreshes the agent's views once", async () => {
    vi.useFakeTimers();
    let n = 0;
    const calls = stubFetch(() => {
      n += 1;
      return n < 3
        ? { status: 200, body: runDetail({ status: "running", cases_done: n - 1, metrics: null }) }
        : { status: 200, body: runDetail({ status: "completed" }) };
    });
    const { qc, wrapper } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const onFinished = vi.fn();

    const { result } = renderHook(() => useEvalRun("run1", { onFinished }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.isRunning).toBe(true);
    expect(result.current.progress).toEqual({ done: 0, total: 4 });
    expect(runCalls(calls)).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS));
    expect(runCalls(calls)).toHaveLength(2);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current.progress.done).toBe(1);

    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS));
    expect(result.current.isRunning).toBe(false);
    expect(onFinished).toHaveBeenCalledTimes(1);

    // Nothing polls any more.
    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS * 10));
    expect(runCalls(calls)).toHaveLength(3);
    expect(onFinished).toHaveBeenCalledTimes(1);

    const keys = invalidate.mock.calls.map(([a]) => JSON.stringify(a?.queryKey));
    expect(keys.filter((k) => k === JSON.stringify(evalKeys.overview("ag1")))).toHaveLength(1);
    expect(keys.filter((k) => k === JSON.stringify(evalKeys.cases("ag1")))).toHaveLength(1);
    expect(keys.filter((k) => k === JSON.stringify(evalKeys.dashboard))).toHaveLength(1);
  });

  it("idles (no request) without a run id", async () => {
    vi.useFakeTimers();
    const calls = stubFetch(() => ({ status: 200, body: runDetail() }));
    const { wrapper } = setup();
    renderHook(() => useEvalRun(null), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS * 3));
    expect(calls).toHaveLength(0);
  });

  it("EC-15: gives up after 10 minutes of `running`, calls onTimeout once and stops polling", async () => {
    vi.useFakeTimers();
    const calls = stubFetch(() => ({ status: 200, body: runDetail({ status: "running", metrics: null }) }));
    const { wrapper } = setup();
    const onTimeout = vi.fn();

    const { result } = renderHook(() => useEvalRun("run1", { onTimeout }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_TIMEOUT_MS + EVAL_RUN_POLL_MS));

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.timedOut).toBe(true);
    const after = runCalls(calls).length;
    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS * 10));
    expect(runCalls(calls)).toHaveLength(after);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("EC-16: a failed poll stops polling (reported once) and Retry resumes it", async () => {
    vi.useFakeTimers();
    let outage = false;
    const calls = stubFetch(() =>
      outage
        ? { status: 500, body: { error: { code: "internal", message: "boom" } } }
        : { status: 200, body: runDetail({ status: "running", metrics: null }) },
    );
    const { wrapper } = setup();
    const onPollFailed = vi.fn();

    const { result } = renderHook(() => useEvalRun("run1", { onPollFailed }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    outage = true;
    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS * 4));

    expect(onPollFailed).toHaveBeenCalledTimes(1);
    expect(result.current.pollFailed).toBe(true);
    const stopped = runCalls(calls).length;
    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS * 10));
    expect(runCalls(calls)).toHaveLength(stopped);

    outage = false;
    await act(async () => {
      result.current.retry();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pollFailed).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS * 2));
    expect(runCalls(calls).length).toBeGreaterThan(stopped + 1);
  });
});

describe("useCreateEvalCaseFromFinding", () => {
  const apiError = (status: number, code: string, details?: unknown): Reply => ({
    status,
    body: { error: { code, message: code, details } },
  });

  it("AC-8: 201 resolves `created` and puts the finding into the PR's links cache without a refetch", async () => {
    const calls = stubFetch(() => ({ status: 201, body: { id: "c1", owner_id: "ag1" } }));
    const { qc, wrapper } = setup();
    qc.setQueryData<EvalCaseLinks>(evalKeys.links("pr1"), { links: [] });

    const { result } = renderHook(() => useCreateEvalCaseFromFinding("pr1"), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync("f1");
    });

    expect(calls[0]).toMatchObject({ method: "POST" });
    expect(calls[0]!.url).toMatch(/\/findings\/f1\/eval-case$/);
    expect(outcome).toEqual({ kind: "created", caseId: "c1", agentId: "ag1" });
    expect(qc.getQueryData<EvalCaseLinks>(evalKeys.links("pr1"))).toEqual({
      links: [{ finding_id: "f1", case_id: "c1", agent_id: "ag1" }],
    });
  });

  it("EC-3: 409 eval_case_exists resolves `exists` with the existing case id (no throw, no toast path)", async () => {
    stubFetch(() => apiError(409, "eval_case_exists", { case_id: "c9" }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useCreateEvalCaseFromFinding("pr1"), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync("f1");
    });
    expect(outcome).toEqual({ kind: "exists", caseId: "c9" });
  });

  it("EC-4/EC-5: a known 422 resolves `rejected` with its code; an unknown failure still throws", async () => {
    let reply: Reply = apiError(422, "no_patch");
    stubFetch(() => reply);
    const { qc, wrapper } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateEvalCaseFromFinding("pr1"), { wrapper });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync("f1");
    });
    expect(outcome).toEqual({ kind: "rejected", code: "no_patch" });
    expect(invalidate).not.toHaveBeenCalled();

    reply = apiError(500, "internal");
    await act(async () => {
      await expect(result.current.mutateAsync("f1")).rejects.toMatchObject({ status: 500 });
    });
  });
});
