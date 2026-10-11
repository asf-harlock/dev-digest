"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, TextInput } from "@devdigest/ui";
import { useRenameEvalCase } from "@/lib/hooks/eval";
import { nameProblem } from "./helpers";
import { s } from "./styles";

/** Rename a case (`PATCH /eval-cases/:id`). Mount with `key={caseId}` so the draft
 *  restarts from the stored name. The list refreshes through the hook's invalidation. */
export function CaseNameForm({ caseId, name }: { caseId: string; name: string }) {
  const t = useTranslations("eval");
  const rename = useRenameEvalCase();
  const [draft, setDraft] = React.useState(name);
  const [touched, setTouched] = React.useState(false);

  const problem = nameProblem(draft);
  const unchanged = draft.trim() === name;
  const errorId = `case-name-error-${caseId}`;
  const message =
    touched && problem
      ? t(problem === "required" ? "caseModal.nameRequired" : "caseModal.nameTooLong")
      : rename.isError
        ? t("caseModal.saveError")
        : null;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem || unchanged) return;
    rename.mutate({ caseId, name: draft.trim() });
  };

  return (
    <form style={s.form} onSubmit={save} noValidate>
      <label htmlFor={`case-name-${caseId}`} style={s.label}>
        {t("caseModal.nameLabel")}
      </label>
      <div style={s.row}>
        <div style={s.field}>
          <TextInput
            id={`case-name-${caseId}`}
            value={draft}
            placeholder={t("caseModal.namePlaceholder")}
            aria-invalid={touched && problem ? true : undefined}
            aria-describedby={message ? errorId : undefined}
            onChange={(v) => {
              setDraft(v);
              rename.reset();
            }}
            onBlur={() => setTouched(true)}
          />
        </div>
        <Button kind="primary" type="submit" loading={rename.isPending} disabled={unchanged || !!problem}>
          {rename.isPending ? t("caseModal.saving") : t("caseModal.save")}
        </Button>
      </div>
      {message && (
        <span id={errorId} role="alert" style={s.error}>
          {message}
        </span>
      )}
    </form>
  );
}
