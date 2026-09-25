/** Constants for the DiffViewer. */
import type { Severity } from "@/lib/types";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// ---- Smart Diff — injected findings (specs/lessons/L03) --------------------

/** Severity → CSS colour token, reused for the CodeLine left bar/label. */
export const SEVERITY_LINE_COLOR: Record<Severity, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
};

/** i18n key (under `prReview.smartDiff`) for a line's severity label. */
export type LineLabelKey = "lineLabelCritical" | "lineLabelWarning" | "lineLabelSuggestion";

/** Severity → i18n key lookup, a true constant like `SEVERITY_LINE_COLOR`
 *  above — exhaustiveness over `Severity` is a compile-time check. */
export const SEVERITY_LINE_LABEL_KEY: Record<Severity, LineLabelKey> = {
  CRITICAL: "lineLabelCritical",
  WARNING: "lineLabelWarning",
  SUGGESTION: "lineLabelSuggestion",
};
