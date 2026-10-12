import type { EvalActualFinding } from "@devdigest/shared";

/** The Actual output text: the case's kept findings as a read-only JSON array of
 *  `{file, start_line, end_line, severity, category, title, label}` (AC-22), or null while
 *  there is nothing to show — never run, or a result with no `findings` (EC-13). */
export function actualOutputText(findings: readonly EvalActualFinding[] | null | undefined): string | null {
  if (!findings) return null;
  return JSON.stringify(
    findings.map((f) => ({
      file: f.file,
      start_line: f.start_line,
      end_line: f.end_line,
      severity: f.severity,
      category: f.category,
      title: f.title,
      label: f.label,
    })),
    null,
    2,
  );
}
