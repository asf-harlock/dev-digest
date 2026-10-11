/* RunAllEvals.test.tsx — SPEC-08 "Run all evals" (AC-19, AC-25, AC-26, EC-11, EC-15, EC-16).
   The polling itself is covered in lib/hooks/eval.test.tsx; here the hooks are the
   seam and are controlled, so this file asserts only what the user sees and can do. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAgentRunDetail } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import { runDetail } from "../../../../../../../../../test/eval-fixtures";

interface RunState {
  run: EvalAgentRunDetail | undefined;
  isRunning: boolean;
  progress: { done: number; total: number };
  timedOut: boolean;
  pollFailed: boolean;
  retry: ReturnType<typeof vi.fn>;
  callbacks: { onFinished?: (r: EvalAgentRunDetail) => void };
  seenRunId: string | null | undefined;
}

const h = vi.hoisted(() => ({
  start: { mutate: vi.fn(), isPending: false },
  run: {} as RunState,
}));

vi.mock("@/lib/hooks/eval", () => ({
  useStartEvalRun: () => h.start,
  useEvalRun: (runId: string | null | undefined, cb: RunState["callbacks"]) => {
    h.run.seenRunId = runId;
    h.run.callbacks = cb;
    return h.run;
  },
}));

import { RunAllEvals } from "./RunAllEvals";

beforeEach(() => {
  h.start.mutate = vi.fn();
  h.start.isPending = false;
  h.run = {
    run: undefined,
    isRunning: false,
    progress: { done: 0, total: 0 },
    timedOut: false,
    pollFailed: false,
    retry: vi.fn(),
    callbacks: {},
    seenRunId: undefined,
  };
});
afterEach(cleanup);

function renderIt(props: Partial<{ casesTotal: number; runningRunId: string | null }> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <RunAllEvals agentId="ag1" casesTotal={props.casesTotal ?? 4} runningRunId={props.runningRunId ?? null} />
    </NextIntlClientProvider>,
  );
}

describe("RunAllEvals (SPEC-08)", () => {
  it("AC-19: starts a run on click and announces it in the polite live region", () => {
    h.start.mutate.mockImplementation((_v, opts) => opts.onSuccess({ id: "run9", status: "running" }));
    renderIt();

    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    expect(h.start.mutate).toHaveBeenCalledTimes(1);

    // The new run id is followed, and the live region tells the user it began.
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("Starting eval run…");
    expect(h.run.seenRunId).toBe("run9");
  });

  it("EC-11: with no cases the button is disabled and the hint says why", () => {
    renderIt({ casesTotal: 0 });
    const btn = screen.getByRole("button", { name: "Run all evals" });
    expect(btn).toBeDisabled();
    expect(btn.closest("span")).toHaveAttribute("title", "Add eval cases from PR findings first");
    fireEvent.click(btn);
    expect(h.start.mutate).not.toHaveBeenCalled();
  });

  it("AC-25: while a run is in flight the button is disabled and 'Running case k of n' is announced", () => {
    h.run.run = runDetail({ status: "running", cases_done: 1, cases_total: 4, metrics: null });
    h.run.isRunning = true;
    h.run.progress = { done: 1, total: 4 };
    renderIt({ runningRunId: "run1" });

    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Running case 2 of 4");
    // A run started in another tab is followed too.
    expect(h.run.seenRunId).toBe("run1");
  });

  it("AC-26: the final status is announced when the run finishes", async () => {
    renderIt({ runningRunId: null });
    const finished = runDetail({ status: "partial", metrics: runDetail().metrics && { ...runDetail().metrics!, cases_errored: 2 } });
    h.run.callbacks.onFinished!(finished);

    expect(await screen.findByText("Eval run finished with 2 cases errored")).toBeInTheDocument();
  });

  it("EC-15: after the timeout it says the run is still in progress and offers Retry", () => {
    h.run.timedOut = true;
    renderIt({ runningRunId: "run1" });
    expect(screen.getByText("The eval run is still in progress — reload to check its status")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.run.retry).toHaveBeenCalledTimes(1);
  });

  it("EC-16: when polling failed it offers Retry and adds no second error message of its own", () => {
    h.run.pollFailed = true;
    renderIt({ runningRunId: "run1" });
    expect(screen.getByText("Couldn’t refresh the run status.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.run.retry).toHaveBeenCalledTimes(1);
  });
});
