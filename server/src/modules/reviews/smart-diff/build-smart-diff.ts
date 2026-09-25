import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import type { FindingRow, PrFileRow } from '../../../db/rows.js';
import { classifyFile } from './classify-file.js';
import { SMART_DIFF_ROLE_ORDER } from './constants.js';

/**
 * Pure assembly of a `SmartDiff` from a PR's files and its findings. No DB —
 * `service.ts` loads the rows, this just groups/counts them.
 *
 * - Buckets files with `classifyFile`, then sorts each group by `path` — the
 *   order `getPrFiles` returns them in is NOT deterministic (no `ORDER BY`,
 *   `pr_files.id` is a random UUID), so the group order must be derived from
 *   the file's own data, not preserved from the query.
 * - Emits groups in `SMART_DIFF_ROLE_ORDER`, skipping empty groups.
 * - `finding_lines` is the unique, sorted `start_line` values of NON-dismissed
 *   findings whose `file` matches the path — dismissed findings still render
 *   inline (in their dismissed state) but are excluded here, from the group
 *   count and from the file dot (root INSIGHTS.md "Severity counters exclude
 *   dismissed findings").
 */
export function buildSmartDiff(files: PrFileRow[], findings: FindingRow[]): SmartDiff {
  const linesByPath = new Map<string, Set<number>>();
  for (const f of findings) {
    if (f.dismissedAt) continue;
    const set = linesByPath.get(f.file) ?? new Set<number>();
    set.add(f.startLine);
    linesByPath.set(f.file, set);
  }

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  for (const file of files) {
    const role = classifyFile(file.path);
    const bucket = byRole.get(role) ?? [];
    const lines = linesByPath.get(file.path);
    bucket.push({
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: lines ? Array.from(lines).sort((a, b) => a - b) : [],
    });
    byRole.set(role, bucket);
  }

  const groups = SMART_DIFF_ROLE_ORDER.filter((role) => (byRole.get(role)?.length ?? 0) > 0).map((role) => ({
    role,
    files: byRole.get(role)!.sort((a, b) => a.path.localeCompare(b.path)),
  }));

  const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  return {
    groups,
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
