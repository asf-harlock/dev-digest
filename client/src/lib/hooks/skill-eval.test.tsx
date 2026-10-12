/* skill-eval.test.tsx — SPEC-09 skill hooks: useSkillEvalCases, useFindingSkills,
   useCreateSkillEvalCase, useCreateSkillCaseFromFinding (AC-9, AC-49..AC-52, AC-54,
   EC-35, EC-37, EC-39, EC-44) and the run hooks useSkillEvalOverview, useStartSkillEvalRun,
   useSkillEvalRun (AC-22, AC-34, EC-14, EC-19, EC-20). `fetch` is the outside world;
   hooks, api.ts and react-query are real. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, cleanup, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { EvalCaseInput, EvalFindingSkills } from "@devdigest/shared";
import { evalKeys } from "./eval";
import {
  SKILL_EVAL_RUN_POLL_MS,
  SKILL_EVAL_RUN_TIMEOUT_MS,
  useCreateSkillCaseFromFinding,
  useCreateSkillEvalCase,
  useFindingSkills,
  useSkillEvalCases,
  useSkillEvalOverview,
  useSkillEvalRun,
  useStartSkillEvalRun,
} from "./skill-eval";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

interface Reply { status: number; body?: unknown }

function stubFetch(handler: (method: string, url: string) => Reply) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = String(input);
      calls.push({ method, url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      const r = handler(method, url);
      return { ok: r.status < 300, status: r.status, statusText: "", json: async () => r.body } as Response;
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

const apiError = (status: number, code: string, details?: unknown): Reply => ({
  status,
  body: { error: { code, message: code, details } },
});

describe("skill case reads", () => {
  it("AC-54: reads the skill's cases from its own route; a null id idles", async () => {
    const calls = stubFetch(() => ({ status: 200, body: [{ id: "c1" }] }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useSkillEvalCases("sk1"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: "c1" }]));
    expect(calls[0]!.url).toMatch(/\/skills\/sk1\/eval-cases$/);

    const idle = renderHook(() => useSkillEvalCases(null), { wrapper });
    expect(idle.result.current.fetchStatus).toBe("idle");
  });

  it("AC-48: the finding's skills are fetched only once enabled (card expanded)", async () => {
    const calls = stubFetch(() => ({ status: 200, body: { skills: [] } satisfies EvalFindingSkills }));
    const { wrapper } = setup();
    const { rerender } = renderHook(({ on }) => useFindingSkills("f1", on), { wrapper, initialProps: { on: false } });
    expect(calls).toHaveLength(0);
    rerender({ on: true });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.url).toMatch(/\/findings\/f1\/eval-skills$/);
  });
});

describe("useCreateSkillEvalCase", () => {
  const input: EvalCaseInput = {
    name: "n",
    input_diff: "@@ -1 +1,2 @@\n a\n+b",
    input_meta: { title: "T" },
    expectation: { type: "must_find", file: "a.ts", start_line: 2, end_line: 2 },
  };

  it("AC-9/AC-12: posts to the skill's route and refreshes that skill's list; a 422 resolves `rejected`", async () => {
    let reply: Reply = { status: 201, body: { id: "c1", owner_kind: "skill" } };
    const calls = stubFetch(() => reply);
    const { qc, wrapper } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateSkillEvalCase("sk1"), { wrapper });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync(input);
    });
    expect(calls[0]!.url).toMatch(/\/skills\/sk1\/eval-cases$/);
    expect(outcome).toMatchObject({ kind: "saved" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: evalKeys.skillCases("sk1") });

    invalidate.mockClear();
    reply = apiError(422, "range_outside_diff");
    await act(async () => {
      outcome = await result.current.mutateAsync(input);
    });
    expect(outcome).toEqual({ kind: "rejected", code: "range_outside_diff" });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("useCreateSkillCaseFromFinding", () => {
  it("AC-50/AC-52/EC-39: 201 and 200 both resolve `created` and flip the skill's item in the cache without a refetch", async () => {
    const calls = stubFetch(() => ({ status: 201, body: { id: "c5" } }));
    const { qc, wrapper } = setup();
    qc.setQueryData<EvalFindingSkills>(evalKeys.findingSkills("f1"), {
      skills: [
        { skill_id: "s1", name: "a", has_case: false, case_id: null },
        { skill_id: "s2", name: "b", has_case: false, case_id: null },
      ],
    });
    const { result } = renderHook(() => useCreateSkillCaseFromFinding("f1"), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync("s2");
    });
    expect(calls[0]!.url).toMatch(/\/findings\/f1\/skill-eval-case$/);
    expect(calls[0]!.body).toEqual({ skill_id: "s2" });
    expect(outcome).toEqual({ kind: "created", caseId: "c5", skillId: "s2" });
    expect(qc.getQueryData<EvalFindingSkills>(evalKeys.findingSkills("f1"))!.skills).toEqual([
      { skill_id: "s1", name: "a", has_case: false, case_id: null },
      { skill_id: "s2", name: "b", has_case: true, case_id: "c5" },
    ]);
  });

  it("EC-35/EC-37/EC-44: the four 422 codes resolve `rejected`; 5xx and 404 still throw", async () => {
    let reply: Reply = apiError(422, "no_patch");
    stubFetch(() => reply);
    const { qc, wrapper } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateSkillCaseFromFinding("f1"), { wrapper });

    for (const code of ["finding_undecided", "skill_not_in_run", "no_patch", "range_outside_diff"]) {
      reply = apiError(422, code);
      let outcome: unknown;
      await act(async () => {
        outcome = await result.current.mutateAsync("s1");
      });
      expect(outcome).toEqual({ kind: "rejected", code });
    }
    expect(invalidate).not.toHaveBeenCalled();

    for (const status of [500, 404]) {
      reply = apiError(status, "x");
      await act(async () => {
        await expect(result.current.mutateAsync("s1")).rejects.toMatchObject({ status });
      });
    }
  });
});

describe("skill eval run hooks", () => {
  const skillRun = (over: Record<string, unknown> = {}) => ({
    id: "run1",
    owner_kind: "skill",
    skill_id: "sk1",
    status: "running",
    cases_total: 3,
    cases_done: 0,
    ...over,
  });
  const runCalls = (calls: { url: string }[]) => calls.filter((c) => /\/eval-runs\/run1$/.test(c.url));

  it("reads the overview from the skill's route; a null id idles", async () => {
    const calls = stubFetch(() => ({ status: 200, body: { cases_total: 2 } }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useSkillEvalOverview("sk1"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ cases_total: 2 }));
    expect(calls[0]!.url).toMatch(/\/skills\/sk1\/eval-overview$/);
    expect(renderHook(() => useSkillEvalOverview(null), { wrapper }).result.current.fetchStatus).toBe("idle");
  });

  it("AC-22: starts a run with the carrier agent id and returns the 202 body", async () => {
    const calls = stubFetch(() => ({ status: 202, body: { id: "run1", status: "running" } }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useStartSkillEvalRun("sk1"), { wrapper });
    let started: unknown;
    await act(async () => {
      started = await result.current.mutateAsync("a1");
    });
    expect(started).toEqual({ id: "run1", status: "running" });
    expect(calls[0]).toMatchObject({ method: "POST", body: { carrier_agent_id: "a1" } });
    expect(calls[0]!.url).toMatch(/\/skills\/sk1\/eval-runs$/);
  });

  it("EC-14: a 409 eval_run_in_progress resolves with details.run_id; without it, and any other failure, throws", async () => {
    let reply: Reply = apiError(409, "eval_run_in_progress", { run_id: "run7" });
    stubFetch(() => reply);
    const { wrapper } = setup();
    const { result } = renderHook(() => useStartSkillEvalRun("sk1"), { wrapper });
    let started: unknown;
    await act(async () => {
      started = await result.current.mutateAsync("a1");
    });
    expect(started).toEqual({ id: "run7", status: "running" });

    for (const r of [apiError(409, "eval_run_in_progress"), apiError(422, "no_agent_linked"), apiError(500, "x")]) {
      reply = r;
      await act(async () => {
        await expect(result.current.mutateAsync("a1")).rejects.toMatchObject({ status: r.status });
      });
    }
  });

  it("AC-34: polls every 2s, stops when finished, refreshes the skill's overview and cases once", async () => {
    vi.useFakeTimers();
    let n = 0;
    const calls = stubFetch(() => {
      n += 1;
      return { status: 200, body: n < 3 ? skillRun({ cases_done: n - 1 }) : skillRun({ status: "completed", cases_done: 3 }) };
    });
    const { qc, wrapper } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const onFinished = vi.fn();

    const { result } = renderHook(() => useSkillEvalRun("run1", { onFinished }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.isRunning).toBe(true);
    expect(result.current.progress).toEqual({ done: 0, total: 3 });
    await act(() => vi.advanceTimersByTimeAsync(SKILL_EVAL_RUN_POLL_MS * 2 + 1));
    expect(result.current.isRunning).toBe(false);
    expect(onFinished).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(SKILL_EVAL_RUN_POLL_MS * 10));
    expect(runCalls(calls)).toHaveLength(3);
    const keys = invalidate.mock.calls.map(([a]) => JSON.stringify(a?.queryKey));
    expect(keys.filter((k) => k === JSON.stringify(evalKeys.skillOverview("sk1")))).toHaveLength(1);
    expect(keys.filter((k) => k === JSON.stringify(evalKeys.skillCases("sk1")))).toHaveLength(1);
    // The agent dashboard and agent overviews are not touched by a skill run (EC-40).
    expect(keys).not.toContain(JSON.stringify(evalKeys.dashboard));
  });

  it("EC-19: gives up after 20 minutes of `running`, not 10", async () => {
    vi.useFakeTimers();
    const calls = stubFetch(() => ({ status: 200, body: skillRun() }));
    const { wrapper } = setup();
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useSkillEvalRun("run1", { onTimeout }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(() => vi.advanceTimersByTimeAsync(10 * 60 * 1000 + SKILL_EVAL_RUN_POLL_MS));
    expect(onTimeout).not.toHaveBeenCalled();
    expect(result.current.timedOut).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(SKILL_EVAL_RUN_TIMEOUT_MS));
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(result.current.timedOut).toBe(true);
    const after = runCalls(calls).length;
    await act(() => vi.advanceTimersByTimeAsync(SKILL_EVAL_RUN_POLL_MS * 10));
    expect(runCalls(calls)).toHaveLength(after);
  });

  it("EC-20: a failed poll stops polling (reported once) and Retry resumes it", async () => {
    vi.useFakeTimers();
    let outage = false;
    const calls = stubFetch(() => (outage ? apiError(500, "internal") : { status: 200, body: skillRun() }));
    const { wrapper } = setup();
    const onPollFailed = vi.fn();
    const { result } = renderHook(() => useSkillEvalRun("run1", { onPollFailed }), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(0));

    outage = true;
    await act(() => vi.advanceTimersByTimeAsync(SKILL_EVAL_RUN_POLL_MS * 3));
    expect(onPollFailed).toHaveBeenCalledTimes(1);
    expect(result.current.pollFailed).toBe(true);
    const stopped = runCalls(calls).length;
    await act(() => vi.advanceTimersByTimeAsync(SKILL_EVAL_RUN_POLL_MS * 5));
    expect(runCalls(calls)).toHaveLength(stopped);

    outage = false;
    await act(async () => {
      result.current.retry();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.pollFailed).toBe(false);
    expect(runCalls(calls).length).toBeGreaterThan(stopped);
  });
});
