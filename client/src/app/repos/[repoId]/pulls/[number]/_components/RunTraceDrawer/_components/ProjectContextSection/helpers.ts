import type { ProjectContextEntry } from "@devdigest/shared";

/** Origin written for per-PR context entries (SPEC-07). */
export const PR_ORIGIN = "pr";

export function isPrOrigin(origin: string): boolean {
  return origin === PR_ORIGIN || origin.startsWith(`${PR_ORIGIN}:`);
}

/** PR-context entries first, otherwise the stored order. */
export function prFirst(entries: ProjectContextEntry[]): ProjectContextEntry[] {
  return [...entries.filter((e) => isPrOrigin(e.origin)), ...entries.filter((e) => !isPrOrigin(e.origin))];
}
