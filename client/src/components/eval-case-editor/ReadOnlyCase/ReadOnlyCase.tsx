"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCaseDetail } from "@devdigest/shared";
import { DiffViewer } from "@/components/diff-viewer";
import { frozenDiffFile } from "../helpers";
import { s } from "../styles";

/** A finding-derived case: its PR meta, expectation and frozen diff as read-only escaped
 *  text (EC-7, UI-3). Only the name and notes stay editable, in the parent. */
export function ReadOnlyCase({ c }: { c: EvalCaseDetail }) {
  const t = useTranslations("eval");
  const e = c.expectation;
  return (
    <>
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

      <section style={s.section} aria-label={t("caseModal.diffLabel", { file: e.file })}>
        <h3 style={s.heading}>{t("caseModal.diffHeading")}</h3>
        <DiffViewer
          files={[frozenDiffFile(c)]}
          highlightRange={{ start: e.start_line, end: e.end_line }}
        />
      </section>
    </>
  );
}
