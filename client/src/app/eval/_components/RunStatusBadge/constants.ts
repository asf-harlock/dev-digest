import type { IconName } from "@devdigest/ui";
import type { EvalRunStatus } from "@devdigest/shared";

/** Icon + colour per status; the text label always comes with them (NFR-7). */
export const STATUS_STYLE: Record<EvalRunStatus, { icon: IconName; color: string; bg: string }> = {
  running: { icon: "RefreshCw", color: "var(--accent-text)", bg: "var(--accent-bg)" },
  completed: { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" },
  partial: { icon: "AlertTriangle", color: "var(--warn)", bg: "var(--warn-bg)" },
  errored: { icon: "XCircle", color: "var(--crit)", bg: "var(--crit-bg)" },
};
