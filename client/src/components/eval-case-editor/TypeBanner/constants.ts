import type { EvalExpectationType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Icon + colour per type: blue POSITIVE, amber NEGATIVE (AC-16). The banner always carries
 *  text and an icon, never colour alone (NFR-10). */
export const TYPE_VISUAL: Record<EvalExpectationType, { icon: IconName; color: string; label: "positive" | "negative" }> = {
  must_find: { icon: "CheckCircle", color: "var(--info)", label: "positive" },
  must_not_flag: { icon: "AlertTriangle", color: "var(--warn)", label: "negative" },
};
