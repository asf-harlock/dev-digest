"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import type { EvalCaseListItem } from "@devdigest/shared";
import { evalCaseState } from "@/lib/eval-format";
import { CaseStateLabel } from "../CaseStateLabel";
import { expectationLocation, expectedGot, severityCategoryParts } from "./helpers";
import { s } from "./styles";

/** One row per eval case, newest first: name, type, location, tag, latest result.
 *  Long names, paths and reasons truncate with an ellipsis and keep the full text
 *  in `title` (EC-29). Model-derived text is rendered as escaped React text (UI-5). */
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
      {cases.map((c) => {
        const latest = c.latest_result;
        const result = expectedGot(latest);
        const location = expectationLocation(c.expectation);
        const mustFind = c.expectation.type === "must_find";
        const { severity, category } = severityCategoryParts(c.expectation);
        const tag = mustFind
          ? [severity, category].filter(Boolean).join(" · ")
          : t("evalsTab.case.mustNotFlagTag");
        return (
          <li key={c.id} style={s.row}>
            <button
              type="button"
              style={s.open}
              aria-label={t("evalsTab.case.open", { name: c.name })}
              onClick={() => onOpen(c.id)}
            >
              <span style={s.line}>
                <span style={s.name} title={c.name}>
                  {c.name}
                </span>
                <CaseStateLabel state={evalCaseState(latest)} />
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
                {latest?.state === "errored" && latest.error_reason && (
                  <span style={s.reason} title={latest.error_reason}>
                    {t("evalsTab.case.erroredReason", { reason: latest.error_reason })}
                  </span>
                )}
              </span>
            </button>
            <span style={s.del}>
              <IconBtn
                icon="Trash"
                label={t("evalsTab.case.delete", { name: c.name })}
                danger
                onClick={() => onDelete(c.id, c.name)}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
