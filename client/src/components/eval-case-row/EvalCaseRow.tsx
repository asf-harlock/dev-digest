"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn } from "@devdigest/ui";
import type { EvalExpectation } from "@devdigest/shared";
import type { EvalCaseState } from "@/lib/eval-format";
import { CaseStateLabel } from "../case-state-label";
import { recallPercent, severityCategoryTag } from "./helpers";
import { s } from "./styles";

/** The **Run** button of a row: what the owning tab knows about running this case. */
export interface EvalCaseRowRun {
  onRun: (caseId: string) => void;
  /** This case is the one running. */
  running: boolean;
  /** Any run of the owner is in progress, or the skill has no agent: **Run** is disabled. */
  disabled: boolean;
  /** Why it is disabled (the button's title). */
  hint?: string;
}

/** One `<li>` of an eval case list, shared by the agent and the skill Evals tab (SPEC-10 AC-29,
 *  AC-30): a status icon with an accessible name, the case name, a MUST FIND / MUST NOT FLAG
 *  badge, the result line ("expected n finding(s), got m", plus " · recall x%" for a
 *  `must_find` case), at the right the `SEVERITY · category` tag, **Edit** (icon and text) and a
 *  delete icon. With `run` (both tabs, SPEC-10 AC-39) a **Run** button with a play icon sits between
 *  the tag and **Edit**; it reads "Running…" while this case runs (AC-41) and is disabled with a
 *  reason while any run of the owner is in progress (AC-49) or the skill has no agent (EC-19). Long names and reasons truncate with an ellipsis and keep the full text in
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
  run,
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
  /** Absent: no **Run** button (a list that cannot run its cases). */
  run?: EvalCaseRowRun;
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
        {run && (
          <span title={run.hint}>
            <Button
              type="button"
              kind="ghost"
              size="sm"
              icon="Play"
              loading={run.running}
              disabled={run.disabled}
              aria-label={run.running ? t("evalsTab.case.running", { name }) : t("evalsTab.case.run", { name })}
              onClick={() => run.onRun(id)}
            >
              {run.running ? t("evalsTab.running") : t("evalsTab.run")}
            </Button>
          </span>
        )}
        <Button type="button" kind="ghost" size="sm" icon="Edit" aria-label={t("evalsTab.case.edit", { name })} onClick={() => onOpen(id)}>
          {t("evalsTab.edit")}
        </Button>
        <IconBtn icon="Trash" label={t("evalsTab.case.delete", { name })} danger onClick={() => onDelete(id, name)} />
      </span>
    </li>
  );
}
