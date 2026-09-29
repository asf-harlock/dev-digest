import type { IconName } from "@devdigest/ui";
import type { BlastStats } from "../../helpers";

/** One row per stat: icon, the `BlastStats` key it reads, and the i18n key
 *  for its noun (under the `blast` namespace) — driving the summary row as a
 *  map instead of four hand-written, near-identical JSX blocks. */
export const STAT_ITEMS: { key: keyof BlastStats; icon: IconName; labelKey: string }[] = [
  { key: "symbols", icon: "Code", labelKey: "stat.symbols" },
  { key: "callers", icon: "CornerDownRight", labelKey: "stat.callers" },
  { key: "endpoints", icon: "Globe", labelKey: "stat.endpoints" },
  { key: "crons", icon: "Clock", labelKey: "stat.crons" },
];
