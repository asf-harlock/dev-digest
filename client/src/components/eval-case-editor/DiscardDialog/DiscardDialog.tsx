"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useEscapeKey } from "../use-escape-key";
import { s } from "../styles";

/** "Discard changes to this case?" (EC-8). Closing it (button, Escape, backdrop) keeps
 *  the editor open; only the confirm button discards. */
export function DiscardDialog({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  const t = useTranslations("eval");
  useEscapeKey(true, onKeep);
  return (
    <Modal
      width={460}
      title={t("caseEditor.discard.title")}
      onClose={onKeep}
      footer={
        <div style={s.confirmFooter}>
          <Button kind="ghost" onClick={onKeep}>
            {t("caseEditor.discard.keep")}
          </Button>
          <Button kind="danger" onClick={onDiscard}>
            {t("caseEditor.discard.confirm")}
          </Button>
        </div>
      }
    >
      <p style={s.confirmBody}>{t("caseEditor.discard.body")}</p>
    </Modal>
  );
}
