"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export function BulkActionsBar({
  acceptedCount,
  totalCount,
  allAccepted,
  onAcceptAll,
  onDeselectAll,
  onCreateSkill,
  busy,
}: {
  acceptedCount: number;
  totalCount: number;
  /** Whether every bulk-eligible (non-rejected) candidate is already accepted —
   *  flips the left button between "Accept all" and "Deselect all". */
  allAccepted: boolean;
  onAcceptAll: () => void;
  onDeselectAll: () => void;
  onCreateSkill: () => void;
  busy?: boolean;
}) {
  const t = useTranslations("conventions");

  return (
    <div style={s.bar}>
      <div style={s.left}>
        <Button
          kind="secondary"
          size="sm"
          icon={allAccepted ? "X" : "Check"}
          disabled={busy}
          onClick={allAccepted ? onDeselectAll : onAcceptAll}
        >
          {allAccepted ? t("bulk.deselectAll") : t("bulk.acceptAll")}
        </Button>
        <span style={s.counter}>{t("bulk.acceptedOfTotal", { accepted: acceptedCount, total: totalCount })}</span>
      </div>
      <Button kind="primary" icon="Sparkles" disabled={acceptedCount === 0} onClick={onCreateSkill}>
        {t("bulk.createSkill")}
      </Button>
    </div>
  );
}
