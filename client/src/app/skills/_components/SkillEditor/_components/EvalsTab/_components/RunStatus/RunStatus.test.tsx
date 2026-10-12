/* RunStatus.test.tsx — SPEC-09 run status line: AC-33 (progress), AC-34 (polite final
   announcement), EC-19 (20-minute timeout message), EC-20 (failed poll → Retry). The
   polling itself is covered in lib/hooks/skill-eval.test.tsx; this is the rendering. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSkillRunDetail } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../messages/en/eval.json";
import type { SkillEvalFlow } from "../../../../use-skill-eval-flow";
import { RunStatus } from "./RunStatus";
import { currentCaseNumber, finishedMessageKey } from "./helpers";

afterEach(cleanup);

type Flow = Pick<SkillEvalFlow, "run" | "followId" | "finished">;

function flow(over: { run?: Partial<Flow["run"]>; followId?: string | null; finished?: Partial<EvalSkillRunDetail> | null } = {}): Flow {
  return {
    followId: over.followId === undefined ? "r1" : over.followId,
    finished: (over.finished ?? null) as EvalSkillRunDetail | null,
    run: {
      run: undefined,
      isRunning: false,
      progress: { done: 0, total: 0 },
      pollFailed: false,
      timedOut: false,
      retry: vi.fn(),
      ...over.run,
    } as unknown as Flow["run"],
  };
}

function renderStatus(f: Flow, casesTotal = 3) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <RunStatus flow={f} casesTotal={casesTotal} />
    </NextIntlClientProvider>,
  );
}

describe("RunStatus", () => {
  it("AC-33: shows 'Running case {k} of {n}' with k = cases_done + 1, inside a polite live region", () => {
    renderStatus(flow({ run: { isRunning: true, progress: { done: 1, total: 4 } } }));
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("Running case 2 of 4");
  });

  it("AC-34: a finished run is announced in the live region; a partial run counts its errored cases", () => {
    const { unmount } = renderStatus(flow({ followId: null, finished: { status: "completed" } }));
    expect(screen.getByRole("status")).toHaveTextContent("Eval run completed");
    unmount();
    renderStatus(flow({ followId: null, finished: { status: "partial", with: { cases_errored: 2 } as never } }));
    expect(screen.getByRole("status")).toHaveTextContent("Eval run finished with 2 cases errored");
  });

  it("EC-17: an errored run is announced and its first reason is shown", () => {
    renderStatus(flow({ followId: null, finished: { status: "errored", error_reason: "provider boom 1" } }));
    expect(screen.getByRole("status")).toHaveTextContent("Eval run failed");
    expect(screen.getByText(/provider boom 1/)).toBeInTheDocument();
  });

  it("EC-19: after the 20-minute cap the tab says to reload instead of polling on", () => {
    renderStatus(flow({ run: { timedOut: true } }));
    expect(screen.getByText("The eval run is still in progress — reload to check its status")).toBeInTheDocument();
  });

  it("EC-20: a failed poll shows one message and a Retry action that resumes polling", () => {
    const retry = vi.fn();
    renderStatus(flow({ run: { pollFailed: true, retry } }));
    expect(screen.getByText("Couldn’t refresh the run status.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("idle: the live region is rendered empty so a screen reader hears the first change; no Retry, no timeout", () => {
    renderStatus(flow({ followId: null }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });
});

describe("RunStatus helpers", () => {
  it("AC-33: the case number is cases_done + 1 and never passes the total", () => {
    expect(currentCaseNumber(0, 5)).toBe(1);
    expect(currentCaseNumber(4, 5)).toBe(5);
    expect(currentCaseNumber(5, 5)).toBe(5);
    expect(currentCaseNumber(0, 0)).toBe(1);
  });

  it("AC-34: completed, partial and errored map to their own sentence", () => {
    expect(finishedMessageKey({ status: "completed" })).toBe("completed");
    expect(finishedMessageKey({ status: "partial" })).toBe("partial");
    expect(finishedMessageKey({ status: "errored" })).toBe("errored");
  });
});
