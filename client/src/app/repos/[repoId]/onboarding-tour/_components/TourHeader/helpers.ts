import type { TourMeta } from "@devdigest/shared";

/** Which status-badge message applies (AC-17): model-written vs skeleton. */
export function statusBadgeKey(meta: TourMeta | undefined): "writtenBy" | "skeletonReason" | "skeleton" {
  if (meta?.source === "llm") return "writtenBy";
  return meta?.degraded_reason ? "skeletonReason" : "skeleton";
}

/** Which freshness note applies: EC-11 "No index yet" wins over Stale (AC-19). */
export function freshnessState(stale: boolean, lastIndexedSha: string | undefined): "none" | "noIndex" | "stale" {
  if (lastIndexedSha !== undefined && lastIndexedSha === "") return "noIndex";
  return stale ? "stale" : "none";
}
