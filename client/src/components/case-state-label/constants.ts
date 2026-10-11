import type { IconName } from "@devdigest/ui";
import type { EvalCaseState } from "@/lib/eval-format";

/** Icon + colour token per case state. State is always paired with a text label (NFR-7). */
export const STATE_VISUAL: Record<EvalCaseState, { icon: IconName; color: string }> = {
  passed: { icon: "CheckCircle", color: "var(--ok)" },
  failed: { icon: "XCircle", color: "var(--crit)" },
  errored: { icon: "AlertTriangle", color: "var(--warn)" },
  never_run: { icon: "Clock", color: "var(--text-muted)" },
};
