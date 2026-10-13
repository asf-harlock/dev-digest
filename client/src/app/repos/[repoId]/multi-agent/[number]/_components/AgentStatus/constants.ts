import type { IconName } from "@devdigest/ui";

/** Column status → icon and colour token. The label text always accompanies the icon (no colour-only status). */
export const STATUS_VIEW = {
  done: { icon: "CheckCircle", color: "var(--ok)" },
  running: { icon: "RefreshCw", color: "var(--accent)" },
  failed: { icon: "XCircle", color: "var(--crit)" },
  cancelled: { icon: "Slash", color: "var(--text-muted)" },
} as const satisfies Record<string, { icon: IconName; color: string }>;

export type ColumnStatus = keyof typeof STATUS_VIEW;

/** Spinner shown beside a running status. */
export const SPIN_ANIMATION = "ddspin 1s linear infinite";
