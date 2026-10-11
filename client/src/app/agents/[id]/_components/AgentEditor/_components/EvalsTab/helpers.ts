import type { EvalCaseListItem } from "@devdigest/shared";

/** `{passed} / {scored}` for the header: a case is scored when its latest result
 *  is `passed` or `failed` — `errored` and never-run cases have no verdict (AC-13). */
export function passingCounts(cases: readonly EvalCaseListItem[]): { passed: number; scored: number } {
  let passed = 0;
  let scored = 0;
  for (const c of cases) {
    const state = c.latest_result?.state;
    if (state === "passed") {
      passed += 1;
      scored += 1;
    } else if (state === "failed") {
      scored += 1;
    }
  }
  return { passed, scored };
}
