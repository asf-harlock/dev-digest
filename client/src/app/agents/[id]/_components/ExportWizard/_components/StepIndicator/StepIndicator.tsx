"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { circleStyle, labelStyle, lineStyle, stepState } from "./helpers";
import { s } from "./styles";

/** The four-step header (AC-2). Looks like the kit's `ExportWizardSteps`, but marks the current
 *  step with `aria-current="step"` and spells out "completed" for assistive tech (NFR-13) — the
 *  kit's version can do neither and `vendor/ui` is read-only. */
export function StepIndicator({ labels, step }: { labels: readonly string[]; step: number }) {
  const t = useTranslations("ci");
  return (
    <ol aria-label={t("exportWizard.stepsLabel")} style={s.list}>
      {labels.map((label, i) => {
        const state = stepState(i, step);
        const last = i === labels.length - 1;
        return (
          <li key={label} aria-current={state === "current" ? "step" : undefined} style={last ? s.itemLast : s.item}>
            <span style={{ ...s.circle, ...circleStyle(state) }} aria-hidden="true">
              {state === "done" ? <Icon.Check size={13} /> : i + 1}
            </span>
            <span style={{ ...s.label, ...labelStyle(state) }}>{label}</span>
            {state === "done" && <span style={s.srOnly}>{t("exportWizard.stepDone")}</span>}
            {!last && <span aria-hidden="true" style={{ ...s.line, ...lineStyle(state) }} />}
          </li>
        );
      })}
    </ol>
  );
}
