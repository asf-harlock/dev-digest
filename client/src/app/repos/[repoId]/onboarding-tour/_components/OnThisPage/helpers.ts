/** Whether the user asked for reduced motion (NFR-10). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** First of `ids` (in document order) that is currently intersecting, or null. */
export function firstVisible(ids: readonly string[], visible: ReadonlySet<string>): string | null {
  return ids.find((id) => visible.has(id)) ?? null;
}

/** The section id named by a location hash, if it is one of `ids`. */
export function hashTarget(hash: string, ids: readonly string[]): string | null {
  let id = hash.replace(/^#/, "");
  try {
    id = decodeURIComponent(id);
  } catch {
    /* keep raw */
  }
  return ids.includes(id) ? id : null;
}
