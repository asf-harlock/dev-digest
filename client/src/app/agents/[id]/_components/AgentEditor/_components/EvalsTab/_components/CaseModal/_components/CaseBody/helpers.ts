import type { EvalCaseDetail, PrFile } from "@devdigest/shared";

/** +/- line counts of a unified diff. Only lines after the first hunk header count,
 *  so a `--- a/x` / `+++ b/x` file header is never mistaken for content. */
export function countPatchLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

/** Drops the `diff --git` / `index` / `---` / `+++` header lines before the first hunk:
 *  the shared DiffViewer's parser has no header handling and would draw them as rows.
 *  A diff with no `@@` line is returned unchanged. */
export function stripDiffHeaders(diff: string): string {
  const lines = diff.split("\n");
  const first = lines.findIndex((line) => line.startsWith("@@"));
  return first <= 0 ? diff : lines.slice(first).join("\n");
}

/** The frozen diff as the single file the shared DiffViewer renders. The viewer draws
 *  every line as escaped text, so nothing in the diff is interpreted as HTML or
 *  Markdown (UI-3). The stored `input_diff` is not modified. */
export function frozenDiffFile(c: Pick<EvalCaseDetail, "input_diff" | "expectation">): PrFile {
  const patch = stripDiffHeaders(c.input_diff);
  return { path: c.expectation.file, patch, ...countPatchLines(patch) };
}
