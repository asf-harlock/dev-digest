/* Pure helpers for CompareModal. */
import type { EvalCompare } from "@devdigest/shared";

/** i18n key (under `eval.compare`) for an error from `GET /eval-runs/compare`. Branches on status/code, never on message text. */
export function compareErrorKey(
  status: number | undefined,
  code: string | undefined,
): "notFinished" | "notComparable" | "notFound" | "loadError" {
  if (status === 404) return "notFound";
  if (status === 422 && code === "run_not_finished") return "notFinished";
  if (status === 422 && code === "runs_not_comparable") return "notComparable";
  return "loadError";
}

/** With no shared case the ratios are not comparable: show "—" for all of them (EC-26). */
export function commonRatios(compare: EvalCompare): { old: EvalCompare["common"]["old"]; new: EvalCompare["common"]["new"] } {
  const none = { recall: null, precision: null, citation_accuracy: null };
  return compare.common_cases === 0 ? { old: none, new: none } : compare.common;
}

export function hasSkillChanges(diff: EvalCompare["skills_diff"]): boolean {
  return diff.added.length + diff.removed.length + diff.changed.length > 0;
}
