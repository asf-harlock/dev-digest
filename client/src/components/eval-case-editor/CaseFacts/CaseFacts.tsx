"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { EvalCaseDetail } from "@devdigest/shared";
import { CaseStateLabel } from "../../case-state-label";
import { evalCaseState, formatCostUsd, formatDuration } from "@/lib/eval-format";
import { isCreatedManually } from "../helpers";
import { s } from "../styles";

/** Where a stored case came from and how it last ran (AC-13, AC-19, EC-8). Shown only
 *  when an existing case is open. */
export function CaseFacts({ c }: { c: EvalCaseDetail }) {
  const t = useTranslations("eval");
  const latest = c.latest_result;
  const prNumber = c.source?.pr_number;
  return (
    <>
      <section style={s.section}>
        <h3 style={s.heading}>{t("caseModal.source.heading")}</h3>
        {isCreatedManually(c) ? (
          <span style={s.muted}>{t("caseEditor.createdManually")}</span>
        ) : c.source && prNumber != null ? (
          <Link href={`/repos/${c.source.repo_id}/pulls/${prNumber}`} style={s.link}>
            {t("caseModal.source.link", { number: prNumber })}
          </Link>
        ) : (
          <span style={s.muted}>{t("caseModal.source.unavailable")}</span>
        )}
      </section>

      <section style={s.section}>
        <h3 style={s.heading}>{t("caseModal.lastResult.heading")}</h3>
        <div style={s.resultRow}>
          <CaseStateLabel state={evalCaseState(latest)} />
          {latest && (
            <>
              {latest.state !== "errored" && latest.expected_count !== null && latest.got_count !== null && (
                <span style={s.muted}>
                  {t("caseModal.lastResult.expectedGot", {
                    expected: latest.expected_count,
                    got: latest.got_count,
                  })}
                </span>
              )}
              <span style={s.muted}>
                {t("caseModal.lastResult.duration")}: {formatDuration(latest.duration_ms)}
              </span>
              <span style={s.muted}>
                {t("caseModal.lastResult.cost")}: {formatCostUsd(latest.cost_usd)}
              </span>
            </>
          )}
        </div>
        {latest?.state === "errored" && latest.error_reason && (
          <span style={s.muted}>{t("evalsTab.case.erroredReason", { reason: latest.error_reason })}</span>
        )}
      </section>
    </>
  );
}
