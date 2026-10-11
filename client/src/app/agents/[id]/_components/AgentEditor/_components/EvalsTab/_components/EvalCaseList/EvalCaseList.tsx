"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCaseListItem } from "@devdigest/shared";
import { evalCaseState } from "@/lib/eval-format";
import { EvalCaseRow } from "@/components/eval-case-row";
import { expectedGot } from "./helpers";
import { s } from "./styles";

/** One row per eval case, newest first (SPEC-08 AC-11..AC-13, SPEC-09 AC-44). The
 *  row itself is the shared `EvalCaseRow`; this list maps an agent case onto it. */
export function EvalCaseList({
  cases,
  onOpen,
  onDelete,
}: {
  cases: readonly EvalCaseListItem[];
  onOpen: (caseId: string) => void;
  onDelete: (caseId: string, name: string) => void;
}) {
  const t = useTranslations("eval");
  return (
    <ul aria-label={t("evalsTab.case.listLabel")} style={s.list}>
      {cases.map((c) => (
        <EvalCaseRow
          key={c.id}
          id={c.id}
          name={c.name}
          expectation={c.expectation}
          state={evalCaseState(c.latest_result)}
          result={expectedGot(c.latest_result)}
          errorReason={c.latest_result?.error_reason ?? null}
          onOpen={onOpen}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
