/* eval.test.tsx — SPEC-08 hooks: useEvalRun polling (AC-25/26, EC-15, EC-16) and
   useCreateEvalCaseFromFinding (AC-8, EC-3, EC-4/5). `fetch` is the outside world;
   the hooks, api.ts and react-query are real. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { EvalCaseInput, EvalCaseLinks } from "@devdigest/shared";
import { runDetail } from "../../test/eval-fixtures";
import {
  EVAL_RUN_POLL_MS,
  EVAL_RUN_TIMEOUT_MS,
  evalKeys,
  useCreateAgentEvalCase,
  useCreateEvalCaseFromFinding,
  useDeleteEvalCase,
  useEvalRun,
  useUpdateEvalCase,
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

// SPEC-09: Case Editor writes ------------------------------------------------

const INPUT: EvalCaseInput = {
  name: "n",
  notes: null,
  input_diff: "@@ -1 +1,2 @@\n a\n+b",
  input_meta: { title: "T", body: null },
  expectation: { type: "must_find", file: "a.ts", start_line: 2, end_line: 2 },
};

describe("useCreateAgentEvalCase / useUpdateEvalCase (SPEC-09)", () => {
  const apiError = (status: number, code?: string): Reply => ({
    status,
    body: code ? { error: { code, message: code } } : undefined,
  });

  it("AC-45: posts the input to the agent's route, resolves `saved` and refreshes the case lists", async () => {
    const calls = stubFetch(() => ({ status: 201, body: { id: "c1", owner_kind: "agent" } }));
    const { qc, wrapper } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateAgentEvalCase("ag1"), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync(INPUT);
    });
    expect(calls[0]!.url).toMatch(/\/agents\/ag1\/eval-cases$/);
    expect(outcome).toMatchObject({ kind: "saved", case: { id: "c1" } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: evalKeys.casesAll });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: evalKeys.skillCasesAll });
  });

  it("EC-1..EC-6/EC-42: the five 422 codes and a 413 resolve `rejected`; 5xx and a network error still throw", async () => {
    let reply: Reply = apiError(422, "no_patch");
    stubFetch(() => reply);
    const { qc, wrapper } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateAgentEvalCase("ag1"), { wrapper });
    const run = async () => {
      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.mutateAsync(INPUT);
      });
      return outcome;
    };

    for (const code of ["frozen_diff_too_large", "no_patch", "range_outside_diff", "validation_error", "case_input_locked"]) {
      reply = apiError(422, code);
      expect(await run()).toEqual({ kind: "rejected", code });
    }
    reply = apiError(413);
    expect(await run()).toEqual({ kind: "rejected", code: "frozen_diff_too_large" });
    expect(invalidate).not.toHaveBeenCalled();

    reply = apiError(422, "something_else");
    await act(async () => {
      await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({ status: 422 });
    });
    reply = apiError(500, "internal");
    await act(async () => {
      await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({ status: 500 });
    });
  });

  it("AC-47/AC-16: a replacing PATCH drops the old case's cache and refreshes every list; a rejected one touches nothing", async () => {
    let reply: Reply = { status: 200, body: { id: "c2", replaced_from_id: "c1" } };
    const calls = stubFetch(() => reply);
    const { qc, wrapper } = setup();
    qc.setQueryData(evalKeys.case("c1"), { id: "c1" });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useUpdateEvalCase(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ caseId: "c1", update: { name: "x" } });
    });
    expect(calls[0]).toMatchObject({ method: "PATCH" });
    expect(calls[0]!.url).toMatch(/\/eval-cases\/c1$/);
    expect(qc.getQueryData(evalKeys.case("c1"))).toBeUndefined();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: evalKeys.skillCasesAll });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: evalKeys.linksAll });

    invalidate.mockClear();
    reply = apiError(422, "case_input_locked");
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync({ caseId: "c1", update: { name: "x" } });
    });
    expect(outcome).toEqual({ kind: "rejected", code: "case_input_locked" });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("AC-18: deleting also refreshes the skill case lists and the findings' links", async () => {
    stubFetch(() => ({ status: 204 }));
    const { qc, wrapper } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteEvalCase(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ caseId: "c1" });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: evalKeys.skillCasesAll });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: evalKeys.linksAll });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: evalKeys.findingSkillsAll });
  });
});
