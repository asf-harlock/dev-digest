"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { EVAL_REJECTION_KEY, evalsTabHref } from "../../constants";
import { evalButtonState, type FindingEvalCase } from "../../helpers";
import type { FindingRecord } from "@devdigest/shared";
import { s } from "./styles";

/** "Turn into eval case" in a finding's action row (AC-1). Disabled with a reason
 *  for an undecided finding (EC-1) or a deleted agent (EC-2); once a case exists it is
 *  an "In eval set" link to the agent's Evals tab — client navigation, no reload
 *  (AC-8, AC-9). A 422 from the server shows inline, as escaped catalogue text. */
export function EvalCaseButton({
  finding,
  evalCase,
}: {
  finding: Pick<FindingRecord, "id" | "accepted_at" | "dismissed_at">;
  evalCase: FindingEvalCase;
}) {
  const t = useTranslations("prReview");
  const state = evalButtonState(finding, evalCase);
  const reasonId = `eval-case-reason-${finding.id}`;

  if (state === "in_set" && evalCase.link) {
    return (
      <Link
        href={evalsTabHref(evalCase.link.agentId)}
        style={s.inSet}
        aria-label={t("evalCase.inEvalSetLink")}
        title={t("evalCase.inEvalSetLink")}
      >
        <Icon.FlaskConical size={14} aria-hidden="true" />
        {t("evalCase.inEvalSet")}
      </Link>
    );
  }

  const reason =
    state === "undecided"
      ? t("evalCase.undecidedTooltip")
      : state === "agent_missing"
        ? t("evalCase.agentMissingTooltip")
        : null;
  const disabled = state === "undecided" || state === "agent_missing";

  return (
    <div style={s.wrap}>
      <span style={s.hintWrap} title={reason ?? t("evalCase.enabledHint")}>
        <Button
          kind="ghost"
          size="sm"
          icon="FlaskConical"
          disabled={disabled || state === "creating"}
          loading={state === "creating"}
          aria-describedby={reason ? reasonId : undefined}
          onClick={() => {
            if (state === "ready") evalCase.onCreate();
          }}
        >
          {state === "creating" ? t("evalCase.creating") : t("evalCase.turnInto")}
        </Button>
        {reason && (
          <span id={reasonId} style={s.srOnly}>
            {reason}
          </span>
        )}
      </span>
      {evalCase.rejection && (
        <div role="alert" style={s.error}>
          {t(`evalCase.errors.${EVAL_REJECTION_KEY[evalCase.rejection]}`)}
        </div>
      )}
    </div>
  );
}
