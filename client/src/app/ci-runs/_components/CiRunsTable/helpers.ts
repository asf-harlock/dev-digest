import type { CiRun } from "@devdigest/shared";
import { formatDuration as formatDurationMs } from "@/lib/eval-format";
import { githubPrUrl } from "@/lib/github-urls";
import { REPO_PATTERN } from "./constants";

/** `—` for a missing duration (EC-29), never `0 s`. */
export function formatDuration(ms: number | null | undefined): string {
  return formatDurationMs(ms);
}

/** UI-12 — built from the repository and an integer, never from a URL in the artifact. */
export function prUrl(run: Pick<CiRun, "repo" | "pr_number">): string | null {
  const n = run.pr_number;
  if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) return null;
  if (!REPO_PATTERN.test(run.repo)) return null;
  return githubPrUrl(run.repo, n);
}

export interface SeverityTotals {
  critical: number;
  warning: number;
  suggestion: number;
}

/** A null count is 0 for display. */
export function severityTotals(run: Pick<CiRun, "critical" | "warning" | "suggestion">): SeverityTotals {
  return { critical: run.critical ?? 0, warning: run.warning ?? 0, suggestion: run.suggestion ?? 0 };
}
