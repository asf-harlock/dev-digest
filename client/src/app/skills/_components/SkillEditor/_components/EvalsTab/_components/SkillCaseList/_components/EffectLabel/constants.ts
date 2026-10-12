import type { EvalCaseEffect } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Message key, icon and colour per effect. The effect is always shown as text too (AC-4, NFR-8). */
export const EFFECT_VISUAL: Record<EvalCaseEffect, { key: string; icon: IconName; color: string }> = {
  helped: { key: "helped", icon: "CheckCircle", color: "var(--ok)" },
  hurt: { key: "hurt", icon: "XCircle", color: "var(--crit)" },
  no_effect_pass: { key: "noEffectPass", icon: "CheckCircle", color: "var(--text-secondary)" },
  no_effect_fail: { key: "noEffectFail", icon: "XCircle", color: "var(--text-secondary)" },
  errored: { key: "errored", icon: "AlertTriangle", color: "var(--warn)" },
};
