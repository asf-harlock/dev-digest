import type { UnifiedDiff } from '@devdigest/shared';

/**
 * Rebuilds one `@@ -a,b +c,d @@` header from the NUMERIC hunk fields only.
 * The function-context trailer git appends after the closing `@@` is author
 * controlled source text and is never copied.
 */
function formatHunkHeader(h: { oldStart: number; oldLines: number; newStart: number; newLines: number }): string {
  return `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
}

/** Per-file rebuilt hunk headers, in diff order. Files with no hunks are omitted. */
export function hunkHeadersByFile(diff: UnifiedDiff): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const file of diff.files) {
    if (file.hunks.length === 0) continue;
    out.set(file.path, file.hunks.map(formatHunkHeader));
  }
  return out;
}

/**
 * One hunk-header-only digest string per hunk, grouped by file path — never
 * hunk CONTENT (`@@ -oldStart,oldLines +newStart,newLines @@` only). This is
 * what the intent classifier sees of the diff: enough shape to know which
 * files/how-much changed, never the lines themselves.
 */
export function buildHunkHeaderDigest(diff: UnifiedDiff): string {
  const lines: string[] = [];
  for (const file of diff.files) {
    if (file.hunks.length === 0) continue;
    lines.push(`### ${file.path}`);
    for (const h of file.hunks) {
      lines.push(formatHunkHeader(h));
    }
  }
  return lines.join('\n');
}
