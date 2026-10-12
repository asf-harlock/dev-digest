"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalSkillCaseListItem } from "@devdigest/shared";
import { EvalCaseRow } from "@/components/eval-case-row";
import { EffectLabel } from "./_components/EffectLabel";
import { caseRowState, expectedGot } from "./helpers";
import { s } from "./styles";

/** One row per skill eval case, newest first (AC-3): state label, name, type,
 *  `file:start-end`, tag, "expected n, got m" of the with-skill arm, and — once the skill
 *  has a finished run — the case's effect (AC-4). The row is the
 *  shared `EvalCaseRow`, so names and paths truncate with a `title` (EC-33). */
export function SkillCaseList({
  cases,
  runningCaseId,
  busy,
  noAgent,
  onRun,
  onOpen,
  onDelete,
}: {
  cases: readonly EvalSkillCaseListItem[];
  /** The case being run right now (SPEC-10 AC-41), if any. */
  runningCaseId: string | null;
  /** Any run of the skill is in progress: every row **Run** is disabled (AC-49). */
  busy: boolean;
  /** The skill has no linked agent: every row **Run** is disabled (EC-19). */
  noAgent: boolean;
  /** Opens the carrier dialog for the case (AC-40). */
  onRun: (caseId: string) => void;
  onOpen: (caseId: string) => void;
  onDelete: (caseId: string, name: string) => void;
}) {
  const t = useTranslations("skills");
  const te = useTranslations("eval");
  return (
    <ul aria-label={t("evals.listLabel")} style={s.list}>
      {cases.map((c) => (
        <EvalCaseRow
          key={c.id}
          id={c.id}
          name={c.name}
          expectation={c.expectation}
          state={caseRowState(c.latest_result)}
          result={expectedGot(c.latest_result)}
          errorReason={c.latest_result?.error_reason ?? null}
          run={{
            onRun,
            running: runningCaseId === c.id,
            disabled: busy || noAgent,
            hint: noAgent ? te("caseRun.hints.noAgent") : busy ? te("caseRun.hints.running") : undefined,
          }}
          trailing={c.latest_result ? <EffectLabel latest={c.latest_result} /> : undefined}
          onOpen={onOpen}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
