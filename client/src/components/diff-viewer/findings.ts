/* Smart Diff — injected findings for the DiffViewer/FileCard/CodeLine
   (specs/lessons/L03). Render-prop shape, mirroring `DiffCommentApi` in
   comments.ts: the shared diff-viewer renders findings without importing the
   route-private `_components/FindingCard` — `renderFinding` is supplied by
   the route layer (DiffTab), same as `commenting`'s callbacks are. */
import type { ReactNode } from "react";
import type { FindingRecord } from "@/lib/types";
import { sortBySeverity } from "@/components/severity-counts/helpers";
import { keysForLine } from "./comments";
import type { Line } from "./helpers";

/** What the viewer needs to render Smart Diff findings inline. */
export interface DiffFindingsApi {
  /** This PR's non-dismissed-and-dismissed findings, grouped by `file` path —
   *  FileCard reads its own path's list out of this map. */
  byPath: Map<string, FindingRecord[]>;
  /** Renders one finding (the route layer supplies the real FindingCard). */
  renderFinding: (f: FindingRecord) => ReactNode;
}

/** True when at least one finding in the list is NOT dismissed — the same
 *  rule severityCounts()/the file dot/the group count use (root INSIGHTS.md
 *  "Severity counters exclude dismissed findings"). A dismissed-only list
 *  still renders inline (in FileCard/CodeLine) but must not light up the dot. */
export function hasActiveFindings(findings: FindingRecord[] | undefined): boolean {
  return !!findings?.some((f) => !f.dismissed_at);
}

/**
 * Anchor a file's findings to the lines actually rendered from its patch.
 *
 * Finding line numbers are always NEW-file (head) lines: reviewer-core's
 * grounding (`reviewer-core/src/grounding.ts` `buildLineIndex`) grounds
 * `[start_line, end_line]` against each hunk's `newLineNumbers` only, never
 * the old side. So this tries `RIGHT:n` for every `n` in `[start_line,
 * end_line]` (first hit wins — `start_line === end_line` for a single-line
 * finding) and anchors there. There is deliberately NO `LEFT:` fallback: an
 * old-file line number can coincide with an unrelated new-file line whenever
 * a hunk shifts numbering (a deletion above the finding's line), which would
 * pin the finding to the wrong row. A finding with no `RIGHT:n` hit in range
 * goes to `unanchored` (this mirrors OutdatedComments: it still renders, just
 * not next to a code row) — dismissed findings are NOT filtered here, they
 * still anchor/render, just excluded from the dot/count upstream (server
 * `finding_lines`, `hasActiveFindings`).
 */
export function anchorFindings(
  lines: Line[],
  findings: FindingRecord[],
): { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] } {
  const renderedKeys = new Set<string>();
  for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);

  const matched = new Map<string, FindingRecord[]>();
  const unanchored: FindingRecord[] = [];
  for (const f of findings) {
    let key: string | null = null;
    for (let n = f.start_line; n <= f.end_line; n++) {
      const candidate = `RIGHT:${n}`;
      if (renderedKeys.has(candidate)) {
        key = candidate;
        break;
      }
    }
    if (key) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      unanchored.push(f);
    }
  }
  return { matched, unanchored };
}

/** The highest-severity finding's severity in the list (CRITICAL first),
 *  or `null` for an empty list — drives the CodeLine left bar/label colour. */
export function highestSeverity(findings: FindingRecord[]): FindingRecord["severity"] | null {
  return sortBySeverity(findings)[0]?.severity ?? null;
}
