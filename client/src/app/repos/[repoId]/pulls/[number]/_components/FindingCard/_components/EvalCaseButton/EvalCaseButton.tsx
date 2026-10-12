"use client";

import React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { CaseEditor, ownerEvalsTabHref } from "@/components/eval-case-editor";
import { findingCaseRejection, useEvalCaseDraft } from "@/lib/hooks/eval";
import { useFindingSkills } from "@/lib/hooks/skill-eval";
import { notify } from "@/lib/toast";
import { EVAL_REJECTION_KEY, evalsTabHref, type EvalRejectionCode } from "../../constants";
import { evalButtonState, type FindingEvalCase } from "../../helpers";
import { s } from "./styles";

const isDraftRejection = (code: string | null): code is EvalRejectionCode => code !== null && code in EVAL_REJECTION_KEY;

/** "Turn into eval case" in a finding's action row (AC-1, AC-10): the one eval-case control.
 *
 *  A click reads the finding's draft (`GET /findings/:id/eval-case-draft`) and opens the Case
 *  Editor on it; nothing is created until **Save** in the editor. A 422 of the draft read shows
 *  next to the control as catalogue text and no editor opens (EC-2). The control is disabled with
 *  a reason for an undecided finding (EC-1) or when no owner is left (EC-3). It reads the skills
 *  of the review while it is mounted — i.e. while the card is expanded — and turns into an
 *  **In eval set** link to the first owner's Evals tab once the agent and every skill have a
 *  case (AC-11). */
export function EvalCaseButton({
  finding,
  evalCase,
}: {
  finding: Pick<FindingRecord, "id" | "accepted_at" | "dismissed_at">;
  evalCase: FindingEvalCase;
}) {
  const t = useTranslations("prReview");
  const decided = !!finding.accepted_at || !!finding.dismissed_at;
  const skills = useFindingSkills(finding.id, decided || evalCase.link !== null);
  const [requested, setRequested] = React.useState(false);
  const draft = useEvalCaseDraft(finding.id, requested);
  const { pullId } = evalCase;
  const draftData = draft.data;
  const seed = React.useMemo(
    () => (draftData ? { findingId: finding.id, pullId, draft: draftData } : null),
    [finding.id, pullId, draftData],
  );
  const failed = requested && draft.isError;
  const code = failed ? findingCaseRejection(draft.error) : null;
  const opening = requested && !draft.isError && (draft.isFetching || !draftData);
  const closeEditor = React.useCallback(() => setRequested(false), []);
  const hintRef = React.useRef<HTMLSpanElement>(null);
  // `requested` too: the query keeps its data after the editor closes, which must not reopen it.
  const editorOpen = requested && !!seed && !draft.isFetching;
  const wasOpen = React.useRef(false);
  // Focus returns to the control when the editor closes.
  React.useEffect(() => {
    if (wasOpen.current && !editorOpen) hintRef.current?.querySelector("button")?.focus();
    wasOpen.current = editorOpen;
  }, [editorOpen]);
  const onSaved = React.useCallback(() => notify.success(t("evalCase.created")), [t]);

  const skillList = skills.data?.skills ?? [];
  const state = evalButtonState(
    finding,
    evalCase,
    { loaded: skills.isSuccess, pending: skills.isLoading, list: skillList },
    opening,
  );
  const reasonId = `eval-case-reason-${finding.id}`;

  // Portaled to <body>: a decided card is translucent (opacity) and a stacking context, which
  // would dim the modal and trap its z-index under the page header. React events still bubble
  // through the portal, so clicks are stopped before they reach the card. Rendered in every state,
  // so a save that flips the control to "In eval set" (or a 409) does not unmount an open editor.
  const editor =
    seed && editorOpen
      ? createPortal(
          <div onClick={(e) => e.stopPropagation()}>
            <CaseEditor seed={seed} onClose={closeEditor} onSaved={onSaved} />
          </div>,
          document.body,
        )
      : null;

  const reason =
    state === "undecided"
      ? t("evalCase.undecidedTooltip")
      : state === "agent_missing"
        ? t("evalCase.agentMissingTooltip")
        : null;
  const disabled = state === "undecided" || state === "agent_missing" || state === "checking";
  const busy = state === "opening";

  // The first owner in the editor's order: the agent, then the review's skills (AC-3, AC-11).
  const inSetHref =
    !evalCase.agentMissing && evalCase.link
      ? evalsTabHref(evalCase.link.agentId)
      : ownerEvalsTabHref({ kind: "skill", id: skillList[0]?.skill_id ?? "" });

  // One root and fixed child slots for every state: when a save or a 409 flips the control to
  // "In eval set", the portaled editor keeps its place in the tree and is not remounted, so its
  // edits, picked owner and "already has a case" message survive.
  return (
    <div style={s.wrap}>
      {state === "in_set" ? (
        <Link href={inSetHref} style={s.inSet} aria-label={t("evalCase.inEvalSetLink")} title={t("evalCase.inEvalSetLink")}>
          <Icon.FlaskConical size={14} aria-hidden="true" />
          {t("evalCase.inEvalSet")}
        </Link>
      ) : (
        <span ref={hintRef} style={s.hintWrap} title={reason ?? t("evalCase.enabledHint")}>
          <Button
            kind="ghost"
            size="sm"
            icon="FlaskConical"
            disabled={disabled || busy}
            loading={busy}
            aria-describedby={reason ? reasonId : undefined}
            onClick={() => {
              if (state !== "ready") return;
              if (failed) void draft.refetch();
              else setRequested(true);
            }}
          >
            {busy ? t("evalCase.opening") : t("evalCase.turnInto")}
          </Button>
          {reason && (
            <span id={reasonId} style={s.srOnly}>
              {reason}
            </span>
          )}
        </span>
      )}
      {state !== "in_set" && failed && code ? (
        <div role="alert" style={s.error}>
          {t(`evalCase.errors.${isDraftRejection(code) ? EVAL_REJECTION_KEY[code] : "generic"}`)}
        </div>
      ) : null}
      {editor}
    </div>
  );
}
