"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useDeleteEvalCase } from "@/lib/hooks/eval";
import { useFittedModalWidth } from "@/lib/modal-width";
import { s } from "./styles";

/** Confirmation before `DELETE /eval-cases/:id`. The body names the case; the case
 *  name is escaped text (UI-7). Past runs keep their results (AC-18). */
export function DeleteCaseDialog({
  caseId,
  caseName,
  ownerKind = "agent",
  onClose,
  onDeleted,
}: {
  caseId: string;
  caseName: string;
  /** Whose eval set the case leaves; picks the wording of the body. */
  ownerKind?: "agent" | "skill";
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("eval");
  const del = useDeleteEvalCase();
  const width = useFittedModalWidth(460);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const confirm = () =>
    del.mutate({ caseId }, { onSuccess: onDeleted });

  return (
    <Modal
      width={width}
      title={t("caseModal.delete.title")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose} disabled={del.isPending}>
            {t("caseModal.delete.cancel")}
          </Button>
          <Button kind="danger" icon="Trash" loading={del.isPending} onClick={confirm}>
            {del.isPending ? t("caseModal.delete.deleting") : t("caseModal.delete.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <p>{t(ownerKind === "skill" ? "caseModal.delete.bodySkill" : "caseModal.delete.body", { name: caseName })}</p>
        {del.isError && (
          <p role="alert" style={s.error}>
            {t("caseModal.delete.error")}
          </p>
        )}
      </div>
    </Modal>
  );
}
