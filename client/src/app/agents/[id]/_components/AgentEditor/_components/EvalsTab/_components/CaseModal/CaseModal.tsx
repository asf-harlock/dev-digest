"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Skeleton } from "@devdigest/ui";
import { useEvalCase } from "@/lib/hooks/eval";
import { CaseBody } from "./_components/CaseBody";
import { s } from "./styles";

/** Read-only view of one eval case plus rename and delete (AC-14, AC-15, AC-16).
 *  Everything frozen from the PR — diff, title, body — is rendered as escaped text (UI-3). */
export function CaseModal({
  caseId,
  onClose,
  onRequestDelete,
  escapeEnabled = true,
}: {
  caseId: string;
  onClose: () => void;
  onRequestDelete: (caseId: string, name: string) => void;
  /** False while a dialog stacked on top of this one owns the Escape key. */
  escapeEnabled?: boolean;
}) {
  const t = useTranslations("eval");
  const { data: c, isLoading, isError } = useEvalCase(caseId);

  React.useEffect(() => {
    if (!escapeEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [escapeEnabled, onClose]);

  return (
    <Modal
      width={820}
      title={c ? t("caseModal.title", { name: c.name }) : t("caseModal.loading")}
      onClose={onClose}
      footer={
        c ? (
          <div style={s.footer}>
            <Button kind="danger" icon="Trash" onClick={() => onRequestDelete(c.id, c.name)}>
              {t("caseModal.delete.action")}
            </Button>
            <Button kind="secondary" onClick={onClose}>
              {t("caseModal.close")}
            </Button>
          </div>
        ) : undefined
      }
    >
      {isLoading ? (
        <div style={s.body}>
          <Skeleton height={32} />
          <Skeleton height={160} />
        </div>
      ) : isError || !c ? (
        <div role="alert" style={s.error}>
          {t("caseModal.loadError")}
        </div>
      ) : (
        <CaseBody c={c} />
      )}
    </Modal>
  );
}
