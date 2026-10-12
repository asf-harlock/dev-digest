"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalActualFinding } from "@devdigest/shared";
import { s as shared } from "../styles";
import { actualOutputText } from "./helpers";

const TEXT_ID = "case-actual";
const LABEL_ID = "case-actual-label";

/** The Actual output pane (AC-22): "Never run yet" until the case has a result, then the
 *  grounded, redacted findings of its latest result as escaped plain text — model output is
 *  never interpreted as HTML or Markdown (UI-3). It scrolls inside itself (AC-24). */
export function ActualOutputPane({
  findings,
  fillStyle,
}: {
  findings: readonly EvalActualFinding[] | null | undefined;
  fillStyle: React.CSSProperties;
}) {
  const t = useTranslations("eval");
  const text = actualOutputText(findings);
  return (
    <div style={fillStyle}>
      <label id={LABEL_ID} htmlFor={TEXT_ID} style={shared.label}>
        {t("caseEditor.actual.heading")}
      </label>
      {text === null ? (
        <div
          id={TEXT_ID}
          tabIndex={0}
          role="textbox"
          aria-readonly="true"
          aria-labelledby={LABEL_ID}
          style={{ ...shared.pane, ...shared.paneReadOnly, color: "var(--text-secondary)" }}
        >
          {t("caseEditor.actual.neverRun")}
        </div>
      ) : (
        <textarea
          id={TEXT_ID}
          className="mono"
          style={{ ...shared.pane, ...shared.paneReadOnly }}
          spellCheck={false}
          readOnly
          value={text}
        />
      )}
    </div>
  );
}
