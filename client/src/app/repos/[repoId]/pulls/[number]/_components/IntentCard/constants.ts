import type { IconName } from "@devdigest/ui";
import type { Intent } from "@devdigest/shared";

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
