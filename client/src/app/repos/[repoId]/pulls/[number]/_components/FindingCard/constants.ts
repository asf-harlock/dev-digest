/** Constants for FindingCard. */
import type { SkillCaseRejection } from "@/lib/hooks/skill-eval";

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

/** 422 code of `POST /findings/:id/skill-eval-case` → `prReview` message key. The no-patch,
 *  range and undecided texts are the SPEC-08 ones (SPEC-09 EC-44). */
export const SKILL_REJECTION_KEY: Record<SkillCaseRejection, string> = {
  no_patch: "evalCase.errors.noPatch",
  range_outside_diff: "evalCase.errors.rangeOutsideDiff",
  finding_undecided: "evalCase.errors.undecided",
  skill_not_in_run: "skillEval.errors.skillNotInRun",
};

/** Where "In eval set" points for a skill: its Evals tab (AC-49). */
export const skillEvalsTabHref = (skillId: string): string => `/skills/${skillId}?tab=evals`;
