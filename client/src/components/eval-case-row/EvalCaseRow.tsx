"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn } from "@devdigest/ui";
import type { EvalExpectation } from "@devdigest/shared";
import type { EvalCaseState } from "@/lib/eval-format";
import { CaseStateLabel } from "../case-state-label";
import { recallPercent, severityCategoryTag } from "./helpers";
import { s } from "./styles";

/** One `<li>` of an eval case list, shared by the agent and the skill Evals tab (SPEC-10 AC-29,
 *  AC-30): a status icon with an accessible name, the case name, a MUST FIND / MUST NOT FLAG
 *  badge, the result line ("expected n finding(s), got m", plus " · recall x%" for a
 *  `must_find` case), at the right the `SEVERITY · category` tag, **Edit** (icon and text) and a
 *  delete icon. Long names and reasons truncate with an ellipsis and keep the full text in
 *  `title` (EC-12). Every string is rendered as escaped React text (UI-3, UI-7); the caller owns
 *  the surrounding `<ul>`. */
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
  /** Row click and the edit action both open the Case Editor. */
  onOpen: (caseId: string) => void;
  onDelete: (caseId: string, name: string) => void;
}) {
  const t = useTranslations("eval");
  const mustFind = expectation.type === "must_find";
  const tag = severityCategoryTag(expectation);
  const recall = recallPercent(expectation.type, state);
  return (
    <li style={s.row}>
      <button
        type="button"
        style={s.open}
        aria-label={t("evalsTab.case.open", { name })}
        onClick={() => onOpen(id)}
      >
        <span style={s.stateIcon}>
          <CaseStateLabel state={state} showText={false} />
        </span>
        <span style={s.text}>
          <span style={s.line}>
            <span style={s.name} title={name}>
              {name}
            </span>
            <span style={s.badge(mustFind)}>
              {mustFind ? t("evalsTab.case.badgeMustFind") : t("evalsTab.case.badgeMustNotFlag")}
            </span>
          </span>
          <span style={s.meta}>
            {result && (
              <span style={s.result}>
                {recall === null
                  ? t("evalsTab.case.resultPlain", { expected: result.expected, got: result.got })
                  : t("evalsTab.case.resultWithRecall", { expected: result.expected, got: result.got, recall })}
              </span>
            )}
            {trailing}
            {state === "errored" && errorReason && (
              <span style={s.reason} title={errorReason}>
                {t("evalsTab.case.erroredReason", { reason: errorReason })}
              </span>
            )}
          </span>
        </span>
      </button>
      {tag && <span style={s.tag}>{tag}</span>}
      <span style={s.actions}>
        <Button kind="ghost" size="sm" icon="Edit" aria-label={t("evalsTab.case.edit", { name })} onClick={() => onOpen(id)}>
          {t("evalsTab.edit")}
        </Button>
        <IconBtn icon="Trash" label={t("evalsTab.case.delete", { name })} danger onClick={() => onDelete(id, name)} />
      </span>
    </li>
  );
}
