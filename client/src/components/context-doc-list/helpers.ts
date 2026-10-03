/** Pure helpers for the shared project-context document list. */

import type { SpecFile } from "@devdigest/shared";
import { TOKEN_BUDGET } from "./constants";

/** A document a skill contributes to an agent (read-only in the agent tab). */
export interface InheritedDoc {
  path: string;
  /** Name of the (enabled) skill it comes through. */
  skillName: string;
}

export type DocRow =
  | { type: "file"; file: SpecFile; attachedIndex: number }
  | { type: "missing"; path: string; attachedIndex: number }
  | { type: "inherited"; path: string; skillName: string; file: SpecFile | null };

/** Case-insensitive substring filter on the path. Empty query keeps all. */
export function filterPaths<T extends { path: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => it.path.toLowerCase().includes(q));
}

/**
 * Rows in display order. In attach mode (`attached` given): attached paths in
 * their saved order first (order matters — it is prompt order), then inherited
 * rows, then the remaining files in listing order. An attached path that is not
 * in the listing is `missing` (EC-9) — but only when the listing is complete;
 * under the 500-file cap (EC-3) an unlisted path may simply be cut off.
 * Without `attached` (page mode) every file is a plain row.
 */
export function buildRows(input: {
  files: SpecFile[];
  attached?: string[];
  inherited?: InheritedDoc[];
  listingComplete: boolean;
}): DocRow[] {
  const { files, attached, inherited = [], listingComplete } = input;
  if (!attached) return files.map((file) => ({ type: "file", file, attachedIndex: -1 }));

  const byPath = new Map(files.map((f) => [f.path, f]));
  const attachedSet = new Set(attached);
  const rows: DocRow[] = [];

  attached.forEach((path, attachedIndex) => {
    const file = byPath.get(path);
    if (file) rows.push({ type: "file", file, attachedIndex });
    else if (listingComplete) rows.push({ type: "missing", path, attachedIndex });
    else rows.push({ type: "file", file: { path }, attachedIndex });
  });
  for (const doc of inherited) {
    if (attachedSet.has(doc.path)) continue; // own path wins (first occurrence)
    rows.push({ type: "inherited", path: doc.path, skillName: doc.skillName, file: byPath.get(doc.path) ?? null });
  }
  const shown = new Set(rows.map((r) => (r.type === "file" ? r.file.path : r.path)));
  for (const file of files) {
    if (!shown.has(file.path)) rows.push({ type: "file", file, attachedIndex: -1 });
  }
  return rows;
}

/** Attach (append) or detach a path, keeping the order of the rest. */
export function toggleAttached(attached: string[], path: string, attach: boolean): string[] {
  const without = attached.filter((p) => p !== path);
  return attach ? [...without, path] : without;
}

/** Swap an attached path with its neighbour; null when it cannot move. */
export function moveAttached(attached: string[], path: string, direction: -1 | 1): string[] | null {
  const from = attached.indexOf(path);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= attached.length) return null;
  const next = attached.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as string);
  return next;
}

/** Skill-contributed documents for an agent: link enabled AND skill enabled AND
 *  not injection-flagged, in link order, first occurrence wins. */
export function collectInherited(
  skills: {
    name: string;
    enabled: boolean;
    link_enabled: boolean;
    injection_flagged?: boolean | null;
    context_paths?: string[] | null;
  }[],
): InheritedDoc[] {
  const seen = new Set<string>();
  const out: InheritedDoc[] = [];
  for (const sk of skills) {
    if (!sk.enabled || !sk.link_enabled || sk.injection_flagged) continue;
    for (const path of sk.context_paths ?? []) {
      if (seen.has(path)) continue;
      seen.add(path);
      out.push({ path, skillName: sk.name });
    }
  }
  return out;
}

/**
 * Token total for the merged list (own paths, then inherited, first occurrence
 * wins) and the documents a run would skip: like the server, everything from the
 * first document that would push the total over the budget is skipped (EC-13).
 * Paths with no known token count (missing) contribute 0.
 */
export function summarizeBudget(
  orderedPaths: string[],
  tokensByPath: Map<string, number>,
  budget: number = TOKEN_BUDGET,
): { total: number; skipped: string[] } {
  let total = 0;
  const skipped: string[] = [];
  let over = false;
  const seen = new Set<string>();
  for (const path of orderedPaths) {
    if (seen.has(path)) continue;
    seen.add(path);
    const tokens = tokensByPath.get(path) ?? 0;
    if (over || total + tokens > budget) {
      over = true;
      skipped.push(path);
      continue;
    }
    total += tokens;
  }
  return { total, skipped };
}

/** Map of path → token estimate from a listing. */
export function tokensByPath(files: SpecFile[]): Map<string, number> {
  return new Map(files.map((f) => [f.path, f.tokens ?? 0]));
}

/** Whether the listing holds every matching file (false once the 500 cap hit). */
export function isListingComplete(filesLength: number, total: number | undefined): boolean {
  return total == null || filesLength >= total;
}
