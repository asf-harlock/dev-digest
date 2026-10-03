import type { TourMeta } from "@devdigest/shared";
import { REASON_MODEL_NOT_CONFIGURED } from "../../constants";

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

/** EC-7: the skeleton reason is "Model not configured" (the contract has no structured flag for it). */
export function isModelNotConfigured(meta: TourMeta | undefined): boolean {
  return meta?.source !== "llm" && meta?.degraded_reason === REASON_MODEL_NOT_CONFIGURED;
}

/** EC-3: a stored model-written tour whose latest regeneration failed. */
export function hasFailedRegeneration(stored: boolean, meta: TourMeta | undefined): boolean {
  return stored && meta?.source === "llm" && !!meta.last_error;
}

/** The "Uses <provider> / <model>" hint, or null when the server has no model to name (AC-29). */
export function modelHintLabel(hint: { provider: string; model: string } | null | undefined): string | null {
  if (!hint?.model) return null;
  return hint.provider ? `${hint.provider} / ${hint.model}` : hint.model;
}
