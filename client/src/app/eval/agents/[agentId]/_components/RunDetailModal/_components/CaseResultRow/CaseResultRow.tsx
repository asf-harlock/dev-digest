/* CaseResultRow — one case's outcome inside a run (AC-37, UI-5). Case names, file
   paths and finding titles (model output) are rendered as escaped text; long ones are
   truncated with the full text in `title` and still present in the DOM for readers (EC-29). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { EvalCaseOutcome } from "@devdigest/shared";
import { EM_DASH, formatCostUsd, formatDuration, formatLineRange } from "@/lib/eval-format";
import { CASE_STATE_STYLE, LABEL_STYLE } from "./constants";
import { caseState } from "./helpers";
import { s } from "./styles";

export function CaseResultRow({ outcome }: { outcome: EvalCaseOutcome }) {
  const t = useTranslations("eval");
  const state = caseState(outcome);
  const st = CASE_STATE_STYLE[state];
  const type = t(`runDetail.case.expectationType.${outcome.expectation_type}`);
  const counts =
    outcome.expected_count === null || outcome.got_count === null
      ? EM_DASH
      : t("runDetail.case.expectedGot", { expected: outcome.expected_count, got: outcome.got_count });

  return (
    <li style={s.row}>
      <div style={s.head}>
        <span style={s.name} title={outcome.name}>
          {outcome.name}
        </span>
        <Badge color="var(--text-secondary)">{type}</Badge>
        <Badge icon={st.icon} color={st.color} bg={st.bg}>
          {t(`runDetail.case.state.${state}`)}
        </Badge>
      </div>
      <div style={s.meta}>
        <span>{counts}</span>
        <span>{t("runDetail.case.grounding", { kept: outcome.grounding_kept, total: outcome.grounding_total })}</span>
        <span>
          {t("runDetail.case.duration")}: {formatDuration(outcome.duration_ms)}
        </span>
        <span>
          {t("runDetail.case.cost")}: {formatCostUsd(outcome.cost_usd)}
        </span>
      </div>
      {outcome.error_reason && (
        <div style={s.error}>{t("runDetail.case.errorReason", { reason: outcome.error_reason })}</div>
      )}
      {outcome.status === "scored" &&
        (outcome.findings.length === 0 ? (
          <div style={s.none}>{t("runDetail.case.noFindings")}</div>
        ) : (
          <ul aria-label={t("runDetail.case.findingsHeading")} style={s.findings}>
            {outcome.findings.map((f, i) => {
              const label = LABEL_STYLE[f.label];
              const location = formatLineRange(f.file, f.start_line, f.end_line);
              return (
                <li key={`${location}-${i}`} style={s.finding}>
                  <span className="mono" style={{ ...s.location, ...s.ellipsis, maxWidth: 260 }} title={location}>
                    {location}
                  </span>
                  <span style={s.findingTitle} title={f.title}>
                    {f.title}
                  </span>
                  <span title={t(`runDetail.labelHint.${f.label}`)}>
                    <Badge color={label.color} bg={label.bg}>
                      {t(`runDetail.label.${f.label}`)}
                    </Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        ))}
    </li>
  );
}
