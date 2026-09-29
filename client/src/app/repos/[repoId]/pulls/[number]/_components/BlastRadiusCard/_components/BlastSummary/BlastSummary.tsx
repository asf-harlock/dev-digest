/* BlastSummary — the icon+count stat row (symbols/callers/endpoints/crons)
   plus the Tree|Graph segmented toggle, in one header row per the mockup.
   Each stat carries its own title/aria-label (client/INSIGHTS.md: an
   icon+count cluster has no accessible name on its own). */
"use client";

import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { BlastStats } from "../../helpers";
import { STAT_ITEMS } from "./constants";
import { s } from "./styles";

export type BlastView = "tree" | "graph";

export function BlastSummary({
  stats,
  view,
  onViewChange,
  showToggle = true,
}: {
  stats: BlastStats;
  view: BlastView;
  onViewChange: (view: BlastView) => void;
  /** false when there is nothing downstream to switch between. */
  showToggle?: boolean;
}) {
  const t = useTranslations("blast");
  return (
    <div style={s.row}>
      <div style={s.stats}>
        {STAT_ITEMS.map(({ key, icon, labelKey }) => {
          const Icn = Icon[icon];
          // The ICU message (`"{count, plural, one {# symbol} other {#
          // symbols}}"`, blast.json) is the single source for both the
          // visible text and its accessible name — no manual
          // `${count} ${label}` concatenation to keep in sync with it.
          const text = t(labelKey, { count: stats[key] });
          return (
            <span key={key} style={s.stat} title={text} aria-label={text}>
              <Icn size={13} style={s.statIcon} />
              <span className="tnum">{text}</span>
            </span>
          );
        })}
      </div>
      {showToggle && (
        <div style={s.segmented} role="group" aria-label={t("title")}>
          <Button
            kind="tertiary"
            size="sm"
            active={view === "tree"}
            aria-pressed={view === "tree"}
            onClick={() => onViewChange("tree")}
          >
            {t("view.tree")}
          </Button>
          <Button
            kind="tertiary"
            size="sm"
            active={view === "graph"}
            aria-pressed={view === "graph"}
            onClick={() => onViewChange("graph")}
          >
            {t("view.graph")}
          </Button>
        </div>
      )}
    </div>
  );
}
