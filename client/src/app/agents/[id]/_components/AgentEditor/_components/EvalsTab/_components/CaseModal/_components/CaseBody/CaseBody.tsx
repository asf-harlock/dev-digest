"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { EvalCaseDetail } from "@devdigest/shared";
import { DiffViewer } from "@/components/diff-viewer";
import { evalCaseState, formatCostUsd, formatDuration } from "@/lib/eval-format";
import { CaseStateLabel } from "../../../CaseStateLabel";
import { CaseNameForm } from "./_components/CaseNameForm";
import { frozenDiffFile } from "./helpers";
import { s } from "./styles";

/** The loaded content of the case modal. Everything frozen from the PR — diff, title,
 *  body — is rendered as escaped text (UI-3). */
export function CaseBody({ c }: { c: EvalCaseDetail }) {
  const t = useTranslations("eval");
  const e = c.expectation;
  const latest = c.latest_result;
  return (
    <div style={s.body}>
      <CaseNameForm key={c.id} caseId={c.id} name={c.name} />

      <section style={s.section}>
        <h3 style={s.heading}>{t("caseModal.prHeading")}</h3>
        <dl style={s.grid}>
          <dt style={s.term}>{t("caseModal.prTitleLabel")}</dt>
          <dd style={{ ...s.def, ...s.text }}>{c.input_meta.title}</dd>
          <dt style={s.term}>{t("caseModal.prBodyLabel")}</dt>
          <dd style={{ ...s.def, ...s.text }}>{c.input_meta.body ?? t("caseModal.noBody")}</dd>
        </dl>
      </section>

      <section style={s.section}>
        <h3 style={s.heading}>{t("caseModal.expectationHeading")}</h3>
        <dl style={s.grid}>
          <dt style={s.term}>{t("caseModal.expectation.type")}</dt>
          <dd style={s.def}>
            {e.type === "must_find" ? t("caseModal.expectation.mustFind") : t("caseModal.expectation.mustNotFlag")}
          </dd>
          <dt style={s.term}>{t("caseModal.expectation.file")}</dt>
          <dd className="mono" style={s.def}>
            {e.file}
          </dd>
          <dt style={s.term}>{t("caseModal.expectation.lines")}</dt>
          <dd className="mono" style={s.def}>
            {e.start_line}-{e.end_line}
          </dd>
          {e.severity && (
            <>
              <dt style={s.term}>{t("caseModal.expectation.severity")}</dt>
              <dd style={s.def}>{e.severity}</dd>
            </>
          )}
          {e.category && (
            <>
              <dt style={s.term}>{t("caseModal.expectation.category")}</dt>
              <dd style={s.def}>{e.category}</dd>
            </>
          )}
          {e.title && (
            <>
              <dt style={s.term}>{t("caseModal.expectation.title")}</dt>
              <dd style={s.def}>{e.title}</dd>
            </>
          )}
        </dl>
      </section>

      <section style={s.section}>
        <h3 style={s.heading}>{t("caseModal.source.heading")}</h3>
        {c.source ? (
          <Link href={`/repos/${c.source.repo_id}/pulls/${c.source.pr_number}`} style={s.link}>
            {t("caseModal.source.link", { number: c.source.pr_number })}
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

      <section style={s.section} aria-label={t("caseModal.diffLabel", { file: e.file })}>
        <h3 style={s.heading}>{t("caseModal.diffHeading")}</h3>
        <DiffViewer files={[frozenDiffFile(c)]} />
      </section>
    </div>
  );
}
