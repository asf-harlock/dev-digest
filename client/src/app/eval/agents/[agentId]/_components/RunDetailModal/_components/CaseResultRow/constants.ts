import type { IconName } from "@devdigest/ui";
import type { EvalFindingLabel } from "@devdigest/shared";

export type CaseState = "passed" | "failed" | "errored";

/** Icon + colour per case state; the text label always comes with them (NFR-7). */
export const CASE_STATE_STYLE: Record<CaseState, { icon: IconName; color: string; bg: string }> = {
  passed: { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { icon: "XCircle", color: "var(--crit)", bg: "var(--crit-bg)" },
  errored: { icon: "AlertTriangle", color: "var(--warn)", bg: "var(--warn-bg)" },
};

export const LABEL_STYLE: Record<EvalFindingLabel, { color: string; bg: string }> = {
  tp: { color: "var(--ok)", bg: "var(--ok-bg)" },
  fp: { color: "var(--crit)", bg: "var(--crit-bg)" },
  unlabeled: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
};
