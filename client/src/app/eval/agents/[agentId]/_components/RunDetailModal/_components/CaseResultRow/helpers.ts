import type { EvalCaseOutcome } from "@devdigest/shared";
import type { CaseState } from "./constants";

/** Result state of a case: an errored case has no pass/fail verdict. */
export function caseState(outcome: Pick<EvalCaseOutcome, "status" | "pass">): CaseState {
  if (outcome.status === "errored") return "errored";
  return outcome.pass ? "passed" : "failed";
}
