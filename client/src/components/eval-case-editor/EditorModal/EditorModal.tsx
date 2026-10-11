"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, Skeleton } from "@devdigest/ui";
import type { EvalCaseDetail } from "@devdigest/shared";
import { useCreateAgentEvalCase, useUpdateEvalCase, type CaseSaveRejection } from "@/lib/hooks/eval";
import { useCreateSkillEvalCase } from "@/lib/hooks/skill-eval";
import { PROBLEM_KEYS, REJECTION_KEYS } from "../constants";
import {
  buildCaseInput,
  buildCaseUpdate,
  draftFromCase,
  draftProblems,
  editorMode,
  emptyDraft,
  hasUpdate,
  isDirty,
  resolveFile,
  showsBeforeTouch,
  type CaseDraft,
  type DraftField,
} from "../helpers";
import { s } from "../styles";
import { useEscapeKey } from "../use-escape-key";
import { CaseFacts } from "../CaseFacts";
import { CaseFields, type CaseFormState } from "../CaseFields";
import { DiscardDialog } from "../DiscardDialog";

export interface CaseOwner {
  kind: "agent" | "skill";
  id: string;
}

/** The editor dialog. It stays mounted from "loading" to "loaded" so the dialog element
 *  does not change under the user. `c` is null for a new case and while a stored case
 *  loads (`load`); the draft is the user's edits laid over the stored values, so there is
 *  nothing to reset when the case arrives. Runs the save. */
export function EditorModal({
  owner,
  c,
  load = "ready",
  onClose,
  onRequestDelete,
  escapeEnabled,
}: {
  owner: CaseOwner;
  c: EvalCaseDetail | null;
  load?: "ready" | "loading" | "error";
  onClose: () => void;
  onRequestDelete?: (caseId: string, name: string) => void;
  escapeEnabled: boolean;
}) {
  const t = useTranslations("eval");
  const mode = editorMode(c);
  const initial = React.useMemo<CaseDraft>(() => (c ? draftFromCase(c) : emptyDraft()), [c]);
  const [edits, setEdits] = React.useState<Partial<CaseDraft>>({});
  const draft = React.useMemo<CaseDraft>(() => ({ ...initial, ...edits }), [initial, edits]);
  const [touched, setTouched] = React.useState<ReadonlySet<DraftField>>(new Set());
  const [rejection, setRejection] = React.useState<CaseSaveRejection | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false);

  const createAgent = useCreateAgentEvalCase(owner.kind === "agent" ? owner.id : null);
  const createSkill = useCreateSkillEvalCase(owner.kind === "skill" ? owner.id : null);
  const update = useUpdateEvalCase();
  const pending = createAgent.isPending || createSkill.isPending || update.isPending;

  const { paths, file } = resolveFile(draft.diff, draft.file);
  const problems = draftProblems(draft, mode, file);
  const errors: CaseFormState["errors"] = {};
  for (const field of Object.keys(problems) as DraftField[]) {
    const problem = problems[field];
    if (!problem || !(touched.has(field) || showsBeforeTouch(problem))) continue;
    const key = (PROBLEM_KEYS[field] as Partial<Record<string, string>>)[problem];
    if (key) errors[field] = t(key);
  }
  const hasVisibleError = Object.keys(errors).length > 0;
  const dirty = isDirty(draft, initial);

  const set: CaseFormState["set"] = (key, value) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
    setRejection(null);
  };
  const touch = (field: DraftField) => setTouched((prev) => new Set(prev).add(field));

  const requestClose = React.useCallback(() => {
    if (dirty) setConfirmingDiscard(true);
    else onClose();
  }, [dirty, onClose]);
  useEscapeKey(escapeEnabled && !confirmingDiscard, requestClose);

  const save = () => {
    if (pending || !dirty) return;
    if (Object.keys(problems).length > 0) {
      setTouched(new Set(Object.keys(problems) as DraftField[]));
      return;
    }
    const done = (result: { kind: "saved" } | { kind: "rejected"; code: CaseSaveRejection }) => {
      if (result.kind === "rejected") setRejection(result.code);
      else onClose();
    };
    if (c) {
      const body = buildCaseUpdate(draft, initial, mode, file);
      // Nothing the server would act on (it answers an empty PATCH with a 422): close, send nothing.
      if (!hasUpdate(body)) onClose();
      else update.mutate({ caseId: c.id, update: body }, { onSuccess: done });
    } else {
      const input = buildCaseInput(draft, file);
      (owner.kind === "agent" ? createAgent : createSkill).mutate(input, { onSuccess: done });
    }
  };

  const form: CaseFormState = { draft, mode, file, paths, errors, set, touch };

  const footer =
    load !== "ready" ? undefined : (
      <div style={s.footerWrap}>
        {rejection && (
          <div role="alert" style={s.rejection}>
            {t(REJECTION_KEYS[rejection])}
          </div>
        )}
        <div style={s.footer}>
          {c && onRequestDelete && (
            <Button kind="danger" icon="Trash" onClick={() => onRequestDelete(c.id, c.name)}>
              {t("caseModal.delete.action")}
            </Button>
          )}
          <span style={s.spacer} />
          <Button kind="secondary" onClick={requestClose}>
            {t("caseEditor.cancel")}
          </Button>
          <Button kind="primary" loading={pending} disabled={!dirty || hasVisibleError} onClick={save}>
            {pending ? t("caseModal.saving") : t("caseModal.save")}
          </Button>
        </div>
      </div>
    );

  return (
    <>
      <Modal
        width={880}
        title={
          c
            ? t("caseModal.title", { name: c.name })
            : load === "ready"
              ? t("caseEditor.createTitle")
              : t("caseModal.loading")
        }
        onClose={requestClose}
        footer={footer}
      >
        {load === "loading" ? (
          <div style={s.body}>
            <Skeleton height={32} />
            <Skeleton height={160} />
          </div>
        ) : load === "error" ? (
          <div role="alert" style={s.error}>
            {t("caseModal.loadError")}
          </div>
        ) : (
          <form
            style={s.body}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <CaseFields form={form} c={c} />
            {c && <CaseFacts c={c} />}
          </form>
        )}
      </Modal>
      {confirmingDiscard && (
        <DiscardDialog onKeep={() => setConfirmingDiscard(false)} onDiscard={onClose} />
      )}
    </>
  );
}
