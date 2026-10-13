import type { CiPreviewFile, CiPreviewWarning } from "@devdigest/shared";

/** A memory file with nothing in it is flagged "empty" in the list and the pane (EC-16). */
export function isEmptyFile(file: CiPreviewFile): boolean {
  return file.kind === "memory" && file.size_bytes === 0;
}

/** The message values for a warning: `memory_truncated` carries the line count (EC-17). */
export function warningValues(w: CiPreviewWarning): { count: number } {
  return { count: w.count ?? 0 };
}
