import type { EvalSkillCaseListItem } from "@devdigest/shared";
import type { EvalCaseState } from "@/lib/eval-format";

type Latest = EvalSkillCaseListItem["latest_result"];

/** A skill case's state is its with-skill arm's; `null` is "never run" (EC-30). */
export function caseRowState(latest: Latest): EvalCaseState {
  return latest ? latest.with_state : "never_run";
}

/** "expected {n}, got {m}" of the with-skill arm, only for a scored case (AC-3). */
export function expectedGot(latest: Latest): { expected: number; got: number } | null {
  if (!latest || latest.with_state === "errored") return null;
  if (latest.expected_count === null || latest.got_count === null) return null;
  return { expected: latest.expected_count, got: latest.got_count };
}
