"use client";

import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import type { DraftSaveStatus } from "../../helpers";
import { s } from "./styles";

const STATUS_COLOR: Record<DraftSaveStatus, string> = {
  idle: "var(--text-muted)",
  saving: "var(--warn)",
  saved: "var(--ok)",
  error: "var(--crit)",
};

/** "Draft i of N" pager — only rendered by the parent when there's more than
 *  one draft. */
export function DraftTabs({
  activeIndex,
  statuses,
  onSelect,
}: {
  activeIndex: number;
  statuses: DraftSaveStatus[];
  onSelect: (index: number) => void;
}) {
  const t = useTranslations("conventions");
  const total = statuses.length;

  return (
    <div style={s.row}>
      <div style={s.label}>
        <span style={s.dot(STATUS_COLOR[statuses[activeIndex] ?? "idle"])} />
        {t("createModal.draftOf", { index: activeIndex + 1, total })}
      </div>
      <div style={s.nav}>
        <IconBtn
          icon="ChevronLeft"
          label={t("createModal.prevDraft")}
          onClick={() => onSelect(Math.max(0, activeIndex - 1))}
        />
        <IconBtn
          icon="ChevronRight"
          label={t("createModal.nextDraft")}
          onClick={() => onSelect(Math.min(total - 1, activeIndex + 1))}
        />
      </div>
    </div>
  );
}
