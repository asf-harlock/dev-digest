import type { SmartDiffGroup } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";

/** Index this PR's files by path once, for O(1) lookup while rendering
 *  groups (a `SmartDiffFile` only carries the path + counts, not the patch). */
export function fileByPath(files: PrFile[]): Map<string, PrFile> {
  const map = new Map<string, PrFile>();
  for (const f of files) map.set(f.path, f);
  return map;
}

/** Files in this group that carry at least one (non-dismissed) finding —
 *  the server already excludes dismissed findings from `finding_lines`
 *  (root INSIGHTS.md "Severity counters exclude dismissed findings"), so a
 *  non-empty list here is always "still needs attention". Drives the group
 *  header's "● N" count. */
export function filesWithFindingsCount(group: SmartDiffGroup): number {
  return group.files.filter((f) => f.finding_lines.length > 0).length;
}
