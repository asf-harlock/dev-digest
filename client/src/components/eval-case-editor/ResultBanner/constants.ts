import type { IconName } from "@devdigest/ui";

/** Icon + colour per banner state; the state is always also written out (NFR-10). */
export const BANNER_VISUAL: Record<"running" | "passed" | "failed" | "errored", { icon: IconName; color: string }> = {
  running: { icon: "RefreshCw", color: "var(--info)" },
  passed: { icon: "CheckCircle", color: "var(--ok)" },
  failed: { icon: "XCircle", color: "var(--crit)" },
  errored: { icon: "AlertTriangle", color: "var(--crit)" },
};
