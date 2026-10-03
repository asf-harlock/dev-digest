import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

/** Risk icon + colour per severity (the colour is never the only signal —
 *  the severity text label renders next to it, NFR-6). */
export const RISK_META: Record<RiskSeverity, { icon: IconName; c: string }> = {
  high: { icon: "Shield", c: "var(--crit)" },
  medium: { icon: "AlertTriangle", c: "var(--warn)" },
  low: { icon: "Zap", c: "var(--text-muted)" },
};
