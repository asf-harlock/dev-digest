/** Dot colour per take verdict; the severity / "did not flag" text always accompanies it. */
export const VERDICT_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
  INFO: "var(--info)",
  ignored: "var(--text-muted)",
};

/** Verdict → `runs.severity.*` key. */
export const SEVERITY_KEY: Record<string, string> = {
  CRITICAL: "critical",
  WARNING: "warning",
  SUGGESTION: "suggestion",
  INFO: "info",
};

/** Minimum completed agents for a comparison (AC-39). */
export const MIN_DONE_COLUMNS = 2;
