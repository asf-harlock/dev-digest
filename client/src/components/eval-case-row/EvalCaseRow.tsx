"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import type { EvalExpectation } from "@devdigest/shared";
import type { EvalCaseState } from "@/lib/eval-format";
import { CaseStateLabel } from "../case-state-label";
import { expectationLocation, severityCategoryParts } from "./helpers";
import { s } from "./styles";

/** One `<li>` of an eval case list, shared by the agent and the skill Evals tab:
 *  state label, name, type, `file:start-end`, tag, "expected n, got m", an edit and a
 *  delete action. Long names, paths and reasons truncate with an ellipsis and keep the
 *  full text in `title` (EC-29, EC-33). Every string is rendered as escaped React text
 *  (UI-3, UI-8); the caller owns the surrounding `<ul>`. */
export function EvalCaseRow({
  id,
  name,
  expectation,
  state,
  result,
  errorReason,
  trailing,
  onOpen,
  onDelete,
}: {
  id: string;
  name: string;
  expectation: EvalExpectation;
  state: EvalCaseState;
  /** "expected {n}, got {m}" of the scored result; null for never run / errored. */
  result: { expected: number; got: number } | null;
  errorReason: string | null;
  /** Extra meta after the result — the skill tab's effect label. Absent on the agent tab. */
  trailing?: React.ReactNode;
  /** Row click and the edit action both open the Case Editor (AC-13). */
  onOpen: (caseId: string) => void;
  onDelete: (caseId: string, name: string) => void;
}) {
  const t = useTranslations("eval");
  const location = expectationLocation(expectation);
  const mustFind = expectation.type === "must_find";
  const { severity, category } = severityCategoryParts(expectation);
  const tag = mustFind ? [severity, category].filter(Boolean).join(" · ") : t("evalsTab.case.mustNotFlagTag");
  return (
    <li style={s.row}>
      <button
        type="button"
        style={s.open}
        aria-label={t("evalsTab.case.open", { name })}
        onClick={() => onOpen(id)}
      >
        <span style={s.line}>
          <span style={s.name} title={name}>
            {name}
          </span>
          <CaseStateLabel state={state} />
        </span>
        <span style={s.meta}>
          <span style={s.type}>
            {mustFind ? t("evalsTab.case.typeMustFind") : t("evalsTab.case.typeMustNotFlag")}
          </span>
          <span className="mono" style={s.location} title={location}>
            {location}
          </span>
          {tag && <span style={s.tag}>{tag}</span>}
          {result && (
            <span style={s.result}>
              {t("evalsTab.case.expectedGot", { expected: result.expected, got: result.got })}
            </span>
          )}
          {trailing}
          {state === "errored" && errorReason && (
            <span style={s.reason} title={errorReason}>
              {t("evalsTab.case.erroredReason", { reason: errorReason })}
            </span>
          )}
        </span>
      </button>
      <span style={s.actions}>
        <IconBtn icon="Edit" label={t("evalsTab.case.edit", { name })} onClick={() => onOpen(id)} />
        <IconBtn
          icon="Trash"
          label={t("evalsTab.case.delete", { name })}
          danger
          onClick={() => onDelete(id, name)}
        />
      </span>
    </li>
  );
}
