import type { EvalRunDetail } from "@devdigest/shared";

/** Case number shown in "Running case {k} of {n}": the one in flight, never past n. */
export function currentCaseNumber(done: number, total: number): number {
  return total > 0 ? Math.min(done + 1, total) : done + 1;
}

/** Which `runStatus.live.*` sentence announces a finished run. */
export function finishedMessageKey(run: Pick<EvalRunDetail, "status">): "completed" | "partial" | "errored" {
  if (run.status === "partial") return "partial";
  if (run.status === "errored") return "errored";
  return "completed";
}
