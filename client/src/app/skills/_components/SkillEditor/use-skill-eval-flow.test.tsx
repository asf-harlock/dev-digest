import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { EvalSkillRunDetail } from "@devdigest/shared";

/* The data hooks are replaced: this file is about what the flow hook keeps in state when the
   editor is reused for another skill (SPEC-09 review B1), not about fetching. */
let onFinished: ((run: EvalSkillRunDetail) => void) | undefined;
let followed: string | null | undefined;

vi.mock("@/lib/hooks/skill-eval", () => ({
  useSkillEvalOverview: () => ({
    data: { running_run_id: null, carriers: [{ id: "a1" }], cases_total: 2 },
  }),
  useSkillEvalRun: (runId: string | null | undefined, cb: { onFinished?: (run: EvalSkillRunDetail) => void }) => {
    followed = runId;
    onFinished = cb.onFinished;
    return { isRunning: !!runId };
  },
}));

import { useSkillEvalFlow } from "./use-skill-eval-flow";

beforeEach(() => {
  onFinished = undefined;
  followed = undefined;
});

describe("useSkillEvalFlow", () => {
  it("B1: switching skill id drops the previous skill's started run, finished message and open dialog (AC-34)", () => {
    const { result, rerender } = renderHook(({ id }) => useSkillEvalFlow(id), { initialProps: { id: "sk1" } });

    act(() => {
      result.current.openDialog();
      result.current.onStarted("run-of-sk1");
    });
    expect(result.current.followId).toBe("run-of-sk1");
    expect(result.current.dialogOpen).toBe(true);

    act(() => onFinished?.({ id: "run-of-sk1", status: "failed" } as unknown as EvalSkillRunDetail));
    expect(result.current.finished?.id).toBe("run-of-sk1");

    rerender({ id: "sk2" });

    expect(result.current.followId).toBeNull();
    expect(result.current.finished).toBeNull();
    expect(result.current.dialogOpen).toBe(false);
    expect(result.current.block).toBeNull();
    expect(followed).toBeNull();
  });

  it("keeps the started run while the skill id is unchanged", () => {
    const { result, rerender } = renderHook(({ id }) => useSkillEvalFlow(id), { initialProps: { id: "sk1" } });
    act(() => result.current.onStarted("run-of-sk1"));
    rerender({ id: "sk1" });
    expect(result.current.followId).toBe("run-of-sk1");
  });
});
