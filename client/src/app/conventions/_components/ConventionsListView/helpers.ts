import type { ConventionCandidate } from "@devdigest/shared";

export function countAccepted(candidates: ConventionCandidate[]): number {
  return candidates.filter((c) => c.status === "accepted").length;
}

/** Eligible for "Accept all" — still pending. A candidate the user explicitly
 *  rejected is never silently re-accepted by a bulk action. */
export function pendingIds(candidates: ConventionCandidate[]): string[] {
  return candidates.filter((c) => c.status === "pending").map((c) => c.id);
}

/** Eligible for "Deselect all" — currently accepted; rejected candidates are
 *  left alone (the bulk action never touches an explicit reject decision). */
export function acceptedIds(candidates: ConventionCandidate[]): string[] {
  return candidates.filter((c) => c.status === "accepted").map((c) => c.id);
}

/** True once every non-rejected candidate is accepted — flips the bulk
 *  button from "Accept all" to "Deselect all". A candidate list made up
 *  entirely of rejections is never "all accepted". */
export function allEligibleAccepted(candidates: ConventionCandidate[]): boolean {
  const eligible = candidates.filter((c) => c.status !== "rejected");
  return eligible.length > 0 && eligible.every((c) => c.status === "accepted");
}
