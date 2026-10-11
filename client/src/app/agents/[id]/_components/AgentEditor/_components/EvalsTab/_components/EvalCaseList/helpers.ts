import type { EvalCaseListItem } from "@devdigest/shared";

/** "expected {n}, got {m}" is only shown for a scored case (AC-12). */
export function expectedGot(
  latest: EvalCaseListItem["latest_result"],
): { expected: number; got: number } | null {
  if (!latest || latest.state === "errored") return null;
  if (latest.expected_count === null || latest.got_count === null) return null;
  return { expected: latest.expected_count, got: latest.got_count };
}
