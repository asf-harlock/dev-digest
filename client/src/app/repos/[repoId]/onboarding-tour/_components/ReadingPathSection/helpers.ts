/** Normalised hotness at or above which a file is labelled "Active recently" (AC-27). */
export const ACTIVE_RECENTLY_THRESHOLD = 0.5;

export function isActiveRecently(hotness: number | null | undefined): boolean {
  return hotness != null && hotness >= ACTIVE_RECENTLY_THRESHOLD;
}
