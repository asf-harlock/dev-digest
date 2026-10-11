/* Pure helpers for DetailHeader. */
import type { EvalRunDetail } from "@devdigest/shared";

/** The k in "Running case {k} of {n}": the case being worked on, never past n. */
export function currentCase(done: number, total: number): number {
  return total > 0 ? Math.min(done + 1, total) : 0;
}

export type FinishedTone = "completed" | "partial" | "errored";

/** Outcome of a finished run, for the live announcement. */
export function finishedTone(run: Pick<EvalRunDetail, "status">): FinishedTone {
  return run.status === "completed" || run.status === "partial" ? run.status : "errored";
}
