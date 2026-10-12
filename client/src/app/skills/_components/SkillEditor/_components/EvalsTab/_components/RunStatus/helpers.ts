import type { EvalSkillRunDetail } from "@devdigest/shared";

/** Case number shown in "Running case {k} of {n}": k = `cases_done` + 1, never past n (AC-33). */
export function currentCaseNumber(done: number, total: number): number {
  return total > 0 ? Math.min(done + 1, total) : done + 1;
}

/** Which `runStatus.live.*` sentence announces a finished run (AC-34). */
export function finishedMessageKey(run: Pick<EvalSkillRunDetail, "status">): "completed" | "partial" | "errored" {
  if (run.status === "partial") return "partial";
  if (run.status === "errored") return "errored";
  return "completed";
}
