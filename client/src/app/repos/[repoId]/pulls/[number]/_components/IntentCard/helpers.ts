import type { IntentSource } from "@devdigest/shared";

/** Sources the classifier could not fully use — rendered as explicit,
 *  non-dismissable warning rows so a missing/unreachable input is never
 *  silently hidden (specs/03-intent-layer.md §9, D4). */
export function unresolvedSources(sources: IntentSource[]): IntentSource[] {
  return sources.filter((source) => source.status !== "used");
}

/** True when the PR has changed since this intent was classified. Both a
 *  missing `classifiedForSha` (never classified against a sha) and a missing
 *  `headSha` mean "nothing to compare" — not staleness. */
export function isIntentStale(
  classifiedForSha: string | null | undefined,
  headSha: string | null | undefined,
): boolean {
  return !!classifiedForSha && !!headSha && classifiedForSha !== headSha;
}
