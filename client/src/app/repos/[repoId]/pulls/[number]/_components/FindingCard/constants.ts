/** Constants for FindingCard. */

/** Severity → CSS colour token. */
export const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
  INFO: "var(--info)",
};

/** Fallback colour for an unknown severity. */
export const SEV_COLOR_FALLBACK = "var(--text-muted)";

/** 422 code of `POST /findings/:id/eval-case` → `prReview.evalCase.errors.*` key (EC-4, EC-5). */
export const EVAL_REJECTION_KEY = {
  no_patch: "noPatch",
  range_outside_diff: "rangeOutsideDiff",
  finding_undecided: "undecided",
  agent_missing: "agentMissing",
} as const;

export type EvalRejectionCode = keyof typeof EVAL_REJECTION_KEY;

/** Where "In eval set" points: the agent's Evals tab (AC-8). */
export const evalsTabHref = (agentId: string): string => `/agents/${agentId}?tab=evals`;
