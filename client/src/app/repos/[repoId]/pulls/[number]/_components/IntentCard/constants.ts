import type { IconName } from "@devdigest/ui";
import type { Intent, RiskSeverity } from "@devdigest/shared";

/** Per-confidence visual meta, mirrors VerdictBanner's `VERDICT_META` shape.
 *  `labelKey` resolves under the `intent.confidence` i18n namespace. */
export const CONFIDENCE_META: Record<
  Intent["confidence"],
  { c: string; bg: string; icon: IconName; labelKey: string }
> = {
  high: { c: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle", labelKey: "high" },
  medium: { c: "var(--warn)", bg: "var(--warn-bg)", icon: "AlertTriangle", labelKey: "medium" },
  low: { c: "var(--crit)", bg: "var(--crit-bg)", icon: "AlertOctagon", labelKey: "low" },
};

/** Scope-column header meta: In scope reads green with ✓, Out of scope muted
 *  with ✕ — and its items are muted too, per the PR Brief design. */
export const SCOPE_META = {
  in: { icon: "Check", header: "var(--ok)", item: "var(--text-primary)", bullet: "var(--ok)" },
  out: { icon: "X", header: "var(--text-muted)", item: "var(--text-muted)", bullet: "var(--text-muted)" },
} as const satisfies Record<string, { icon: IconName; header: string; item: string; bullet: string }>;

/** Risk-area chip icon + colour per severity. */
export const RISK_META: Record<RiskSeverity, { icon: IconName; c: string }> = {
  high: { icon: "Shield", c: "var(--crit)" },
  medium: { icon: "AlertTriangle", c: "var(--warn)" },
  low: { icon: "Zap", c: "var(--text-muted)" },
};
