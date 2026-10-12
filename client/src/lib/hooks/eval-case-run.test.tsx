/* eval-case-run.test.tsx — the SPEC-10 hooks of hooks/eval.ts: `useEvalCaseDraft` (the Case
   Editor's seed, AC-1, EC-1..EC-3) and `useStartEvalCaseRun` (AC-35, AC-40, AC-49, EC-18), plus the
   single-case polling windows of `useEvalRun` / `useSkillEvalRun` (AC-41, AC-42, EC-23, EC-24).
   `fetch` is the outside world; the hooks, api.ts and react-query are real. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, cleanup, act, waitFor } from "@testing-library/react";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { EvalCaseDraft } from "@devdigest/shared";
import { runDetail } from "../../test/eval-fixtures";
import {
  EVAL_CASE_RUN_TIMEOUT_MS,
  EVAL_RUN_POLL_MS,
  evalKeys,
  findingCaseRejection,
  useEvalCaseDraft,
  useEvalRun,
  useStartEvalCaseRun,
} from "./eval";
import { SKILL_EVAL_CASE_RUN_TIMEOUT_MS, SKILL_EVAL_RUN_POLL_MS, useSkillEvalRun } from "./skill-eval";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

type Reply = { status: number; body?: unknown };
interface Call { method: string; url: string; body: unknown }

function stubFetch(handler: (call: Call) => Reply) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: Call = {
        method: init?.method ?? "GET",
        url: String(input),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      const r = handler(call);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, statusText: "", json: async () => r.body } as Response;
    }),
  );
  return calls;
}

function setup() {
  /** Stands in for the app's global QueryCache toast handler: one count per failed request. */
  const toasts = vi.fn();
  const qc = new QueryClient({
    queryCache: new QueryCache({ onError: toasts }),
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper, toasts };
}

const DRAFT: EvalCaseDraft = {
  name: "From finding: Hardcoded secret",
  expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "CRITICAL", category: "security", title: "Hardcoded secret" },
  input_diff: "diff --git a/src/a.ts b/src/a.ts",
  input_meta: { pr_number: 7, repo_full_name: "acme/api", title: "Add Stripe", body: null },
  owners: [{ kind: "agent", id: "ag1", name: "Security", has_case: false, case_id: null }],
};

describe("useEvalCaseDraft (AC-1)", () => {
  it("idles until enabled: nothing is fetched on mount, only on the click", async () => {
    const calls = stubFetch(() => ({ status: 200, body: DRAFT }));
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ enabled }) => useEvalCaseDraft("f1", enabled), {
      wrapper,
      initialProps: { enabled: false },
    });
    await act(async () => {});
    expect(calls).toHaveLength(0);

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toEqual(DRAFT));
    expect(calls).toEqual([expect.objectContaining({ method: "GET", url: expect.stringMatching(/\/findings\/f1\/eval-case-draft$/) })]);
  });

  it("idles with no finding id", async () => {
    const calls = stubFetch(() => ({ status: 200, body: DRAFT }));
    const { wrapper } = setup();
    renderHook(() => useEvalCaseDraft(null, true), { wrapper });
    await act(async () => {});
    expect(calls).toHaveLength(0);
  });

  it("never reuses a seed: a second open reads the draft again", async () => {
    const calls = stubFetch(() => ({ status: 200, body: DRAFT }));
    const { wrapper } = setup();
    const first = renderHook(() => useEvalCaseDraft("f1", true), { wrapper });
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    first.unmount();
    // the entry is dropped with its last observer (gcTime 0); a stale diff must not seed a modal
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    const second = renderHook(() => useEvalCaseDraft("f1", true), { wrapper });
    await waitFor(() => expect(second.result.current.data).toBeDefined());
    expect(calls).toHaveLength(2);
  });

  it("EC-1..EC-3: a 422 is an answer, not a blip - one request, and the rejection code is readable", async () => {
    const calls = stubFetch(() => ({ status: 422, body: { error: { code: "range_outside_diff", message: "x" } } }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useEvalCaseDraft("f1", true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(findingCaseRejection(result.current.error)).toBe("range_outside_diff");
    expect(calls).toHaveLength(1);
  });
});

describe("useStartEvalCaseRun (AC-35, AC-40, EC-18)", () => {
  it("AC-35: an agent-owned case posts with no body and resolves the 202 run to follow", async () => {
    const calls = stubFetch(() => ({ status: 202, body: { id: "run9", status: "running" } }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useStartEvalCaseRun(), { wrapper });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({ caseId: "c1" });
    });
    expect(out).toEqual({ kind: "started", run: { id: "run9", status: "running" } });
    expect(calls).toEqual([expect.objectContaining({ method: "POST", url: expect.stringMatching(/\/eval-cases\/c1\/run$/), body: undefined })]);
  });

  it("AC-40: a skill-owned case sends the confirmed carrier", async () => {
    const calls = stubFetch(() => ({ status: 202, body: { id: "run9", status: "running" } }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useStartEvalCaseRun(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ caseId: "c1", carrierAgentId: "ag7" });
    });
    expect(calls[0]!.body).toEqual({ carrier_agent_id: "ag7" });
  });

  it("EC-18: a 409 resolves as a conflict carrying the running run's id and is not followed as this case's run", async () => {
    stubFetch(() => ({ status: 409, body: { error: { code: "eval_run_in_progress", message: "x", details: { run_id: "other" } } } }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useStartEvalCaseRun(), { wrapper });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({ caseId: "c1" });
    });
    expect(out).toEqual({ kind: "conflict", runId: "other" });
    cleanup();

    stubFetch(() => ({ status: 409, body: { error: { code: "eval_run_in_progress", message: "x" } } }));
    const again = renderHook(() => useStartEvalCaseRun(), { wrapper });
    await act(async () => {
      out = await again.result.current.mutateAsync({ caseId: "c1" });
    });
    expect(out).toEqual({ kind: "conflict", runId: null });
  });

  it("any other failure throws (the global handler toasts it once): a 422 no_agent_linked, a 404, a 5xx", async () => {
    for (const [status, code] of [[422, "no_agent_linked"], [404, "not_found"], [500, "internal"]] as const) {
      stubFetch(() => ({ status, body: { error: { code, message: "x" } } }));
      const { wrapper } = setup();
      const { result } = renderHook(() => useStartEvalCaseRun(), { wrapper });
      await act(async () => {
        await expect(result.current.mutateAsync({ caseId: "c1", carrierAgentId: "a" })).rejects.toMatchObject({ status, code });
      });
      cleanup();
    }
  });

  it("AC-49: after a start - accepted or conflicting - the agent and skill overviews are refetched so every run control sees the owner's state", async () => {
    stubFetch(() => ({ status: 409, body: { error: { code: "eval_run_in_progress", message: "x", details: { run_id: "r" } } } }));
    const { qc, wrapper } = setup();
    qc.setQueryData(evalKeys.overview("ag1"), { running_case_run: null });
    qc.setQueryData(evalKeys.skillOverview("sk1"), { running_case_run: null });
    const { result } = renderHook(() => useStartEvalCaseRun(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ caseId: "c1" });
    });
    expect(qc.getQueryState(evalKeys.overview("ag1"))?.isInvalidated).toBe(true);
    expect(qc.getQueryState(evalKeys.skillOverview("sk1"))?.isInvalidated).toBe(true);
  });
});

describe("single-case polling windows (AC-41, AC-42, EC-23, EC-24)", () => {
  it("EC-23: the case windows are 3 minutes for an agent case and 6 for a skill case", () => {
    expect(EVAL_CASE_RUN_TIMEOUT_MS).toBe(3 * 60 * 1000);
    expect(SKILL_EVAL_CASE_RUN_TIMEOUT_MS).toBe(6 * 60 * 1000);
  });

  it("EC-23: an agent case run still running after 3 minutes stops polling and times out once", async () => {
    vi.useFakeTimers();
    const calls = stubFetch(() => ({ status: 200, body: runDetail({ status: "running", scope: "case", metrics: null, cases_total: 1, cases_done: 0 }) }));
    const { wrapper } = setup();
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useEvalRun("run1", { onTimeout }, { timeoutMs: EVAL_CASE_RUN_TIMEOUT_MS }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(() => vi.advanceTimersByTimeAsync(EVAL_CASE_RUN_TIMEOUT_MS - 4 * EVAL_RUN_POLL_MS));
    expect(result.current.timedOut).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(5 * EVAL_RUN_POLL_MS));
    expect(result.current.timedOut).toBe(true);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    const after = calls.length;
    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS * 10));
    expect(calls).toHaveLength(after);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("EC-23: a skill case run waits for 6 minutes, not 3", async () => {
    vi.useFakeTimers();
    stubFetch(() => ({
      status: 200,
      body: { ...runDetail({ status: "running", scope: "case", metrics: null, cases_total: 1, cases_done: 0 }), owner_kind: "skill", skill_id: "sk1" },
    }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useSkillEvalRun("run1", {}, { timeoutMs: SKILL_EVAL_CASE_RUN_TIMEOUT_MS }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(() => vi.advanceTimersByTimeAsync(EVAL_CASE_RUN_TIMEOUT_MS + 2 * SKILL_EVAL_RUN_POLL_MS));
    expect(result.current.timedOut).toBe(false);
    expect(result.current.isRunning).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(EVAL_CASE_RUN_TIMEOUT_MS));
    expect(result.current.timedOut).toBe(true);
  });

  it("AC-42: polling stops the moment the run leaves running, and the case lists, case details, overview and dashboard are refreshed once", async () => {
    vi.useFakeTimers();
    let status: "running" | "completed" = "running";
    const calls = stubFetch(() => ({ status: 200, body: runDetail({ status, scope: "case", cases_total: 1, cases_done: status === "running" ? 0 : 1 }) }));
    const { qc, wrapper } = setup();
    qc.setQueryData(evalKeys.case("c1"), { id: "c1" });
    qc.setQueryData(evalKeys.cases("ag1"), []);
    qc.setQueryData(evalKeys.overview("ag1"), {});
    qc.setQueryData(evalKeys.dashboard, {});
    const onFinished = vi.fn();
    const { result } = renderHook(() => useEvalRun("run1", { onFinished }, { timeoutMs: EVAL_CASE_RUN_TIMEOUT_MS }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.isRunning).toBe(true);

    status = "completed";
    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS * 2));
    expect(result.current.isRunning).toBe(false);
    expect(onFinished).toHaveBeenCalledTimes(1);
    for (const key of [evalKeys.case("c1"), evalKeys.cases("ag1"), evalKeys.overview("ag1"), evalKeys.dashboard]) {
      expect(qc.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    const stopped = calls.length;
    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS * 10));
    expect(calls).toHaveLength(stopped);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("EC-24: a failing poll stops polling, adds no second error (one failed request, one report), and Retry resumes", async () => {
    vi.useFakeTimers();
    let outage = false;
    const calls = stubFetch(() =>
      outage
        ? { status: 500, body: { error: { code: "internal", message: "boom" } } }
        : { status: 200, body: runDetail({ status: "running", scope: "case", metrics: null }) },
    );
    const { wrapper, toasts } = setup();
    const onPollFailed = vi.fn();
    const { result } = renderHook(() => useEvalRun("run1", { onPollFailed }, { timeoutMs: EVAL_CASE_RUN_TIMEOUT_MS }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    outage = true;
    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS * 6));

    expect(result.current.pollFailed).toBe(true);
    expect(onPollFailed).toHaveBeenCalledTimes(1);
    expect(toasts).toHaveBeenCalledTimes(1); // the outage is reported once, not once per tick
    const stopped = calls.length;
    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS * 10));
    expect(calls).toHaveLength(stopped);

    outage = false;
    await act(async () => {
      result.current.retry();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pollFailed).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(EVAL_RUN_POLL_MS * 2));
    expect(calls.length).toBeGreaterThan(stopped + 1);
    expect(toasts).toHaveBeenCalledTimes(1);
  });
});
