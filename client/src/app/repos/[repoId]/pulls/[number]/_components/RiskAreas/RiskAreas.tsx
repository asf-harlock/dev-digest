/* RiskAreas — the PR Brief's "Risk areas" card (specs/06-pr-brief.md AC-10,
   AC-11, AC-14): one row per risk with a severity icon + text label and its
   title, then every file reference as a button that deep-links into Files
   changed. Sits next to Review focus. Model text renders as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Skeleton } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { formatFileRef, parseFileRef } from "../../../../../../../lib/file-ref";
import { RISK_META } from "./constants";
import { s } from "./styles";

export function RiskAreas({
  risks,
  loading = false,
  onOpenFile,
}: {
  risks: Risk[];
  /** A brief generation is running: show a skeleton in place of the list. */
  loading?: boolean;
  /** Deep-links a risk's file reference into Files changed. */
  onOpenFile: (file: string, line?: number) => void;
}) {
  const t = useTranslations("brief");
  return (
    <section style={s.card} aria-label={t("riskAreas")}>
      <div style={s.header}>
        <Icon.AlertTriangle size={14} style={s.headerIcon} />
        <span style={s.label}>{t("riskAreas")}</span>
      </div>

      {loading ? (
        <Skeleton height={60} />
      ) : risks.length === 0 ? (
        <p style={s.empty}>{t("noRisks")}</p>
      ) : (
        <ul style={s.list}>
          {risks.map((risk, i) => {
            const rm = RISK_META[risk.severity];
            const RiskIcon = Icon[rm.icon];
            return (
              <li key={i} style={s.item} title={risk.explanation}>
                <div style={s.titleRow}>
                  <RiskIcon size={14} style={s.riskIcon(rm.c)} aria-hidden />
                  <span style={s.severity(rm.c)}>{t(`severity.${risk.severity}`)}</span>
                  <span style={s.title}>{risk.title}</span>
                </div>
                {risk.file_refs.length > 0 && (
                  <div style={s.refs}>
                    {risk.file_refs.map((ref, j) => {
                      const { path, start, end } = parseFileRef(ref);
                      return (
                        <button
                          key={`${ref}:${j}`}
                          type="button"
                          className="mono"
                          style={s.refBtn}
                          onClick={() => onOpenFile(path, start ?? undefined)}
                        >
                          {formatFileRef(path, start, end)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
