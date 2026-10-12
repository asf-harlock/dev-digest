"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { ExpectedProblem } from "../helpers";
import { s as shared } from "../styles";
import { problemValues } from "./helpers";
import { s } from "./styles";

const TEXT_ID = "case-expected";
const STATUS_ID = "case-expected-status";

/** The Expected output editor (AC-19..AC-21): a JSON array of exactly one object, a validity
 *  indicator as icon + text, and **+ Finding skeleton**. The pane fills its share of the
 *  column and scrolls inside itself (AC-24). The text is user input: it is only ever read
 *  through `parseExpectedOutput` (UI-1). */
export function ExpectedOutputPane({
  value,
  problem,
  readOnly,
  fillStyle,
  onChange,
  onSkeleton,
  onBlur,
}: {
  value: string;
  problem: ExpectedProblem | null;
  readOnly: boolean;
  fillStyle: React.CSSProperties;
  onChange: (value: string) => void;
  onSkeleton: () => void;
  onBlur?: () => void;
}) {
  const t = useTranslations("eval");
  const valid = problem === null;
  const reason = problem ? t(`caseEditor.expected.reasons.${problem.code}`, problemValues(problem)) : "";
  const message = valid
    ? t("caseEditor.expected.valid")
    : problem.code === "tooLarge"
      ? reason
      : t("caseEditor.expected.invalid", { reason });
  const Mark = valid ? Icon.CheckCircle : Icon.XCircle;

  return (
    <div style={fillStyle}>
      <div style={s.head}>
        <label htmlFor={TEXT_ID} style={shared.label}>
          {t("caseEditor.expected.heading")}
        </label>
        {!readOnly && (
          <span id={STATUS_ID} aria-live="polite" style={s.indicator(valid)} title={message}>
            <Mark size={14} aria-hidden="true" />
            <span style={s.indicatorText}>{message}</span>
          </span>
        )}
        <span style={s.spacer} />
        {!readOnly && (
          <Button type="button" kind="ghost" size="sm" onClick={onSkeleton}>
            {t("caseEditor.expected.skeleton")}
          </Button>
        )}
      </div>
      <textarea
        id={TEXT_ID}
        className="mono"
        style={{ ...shared.pane, ...(readOnly ? shared.paneReadOnly : null) }}
        spellCheck={false}
        readOnly={readOnly}
        value={value}
        aria-invalid={!readOnly && !valid ? true : undefined}
        aria-describedby={readOnly ? undefined : STATUS_ID}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  );
}
