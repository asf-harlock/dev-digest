import type { AgentColumn, Conflict } from "@devdigest/shared";
import { MIN_DONE_COLUMNS } from "./constants";

export type ComparisonState =
  /** Fewer than 2 agents are done and some still run: "Comparing N of M agents". */
  | "comparing_only"
  /** Fewer than 2 agents are done and none is running: nothing to compare. */
  | "needs_two"
  /** Rows can be shown (a "Comparing…" note is added while some agents still run). */
  | "rows";

export interface Comparison {
  state: ComparisonState;
  done: number;
  total: number;
  running: boolean;
}

export function compareState(columns: AgentColumn[]): Comparison {
  const done = columns.filter((c) => c.status === "done").length;
  const running = columns.some((c) => c.status === "running");
  const state: ComparisonState =
    done >= MIN_DONE_COLUMNS ? "rows" : running ? "comparing_only" : "needs_two";
  return { state, done, total: columns.length, running };
}

/** "Show only conflicts" keeps the groups where the agents differ (`contended`). */
export function visibleConflicts(conflicts: Conflict[], onlyConflicts: boolean): Conflict[] {
  return onlyConflicts ? conflicts.filter((c) => c.contended) : conflicts;
}
