"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import {
  BLOCKING_CHECK_NAME,
  POST_AS_OPTIONS,
  RECOMMENDED_POST_AS,
  TRIGGERS,
  type PostAs,
  type Trigger,
} from "../../constants";
import { s } from "./styles";

/** Step 3: triggers as toggles (AC-7), how the result is posted (AC-8) and how to block merges (AC-9).
 *  Fail CI on is NOT set here; the info box points to the CI tab. With no trigger the parent disables
 *  Continue (EC-6). */
export function ConfigureStep({
  triggers,
  postAs,
  onToggleTrigger,
  onPostAs,
}: {
  triggers: readonly Trigger[];
  postAs: PostAs;
  onToggleTrigger: (trigger: Trigger) => void;
  onPostAs: (postAs: PostAs) => void;
}) {
  const t = useTranslations("ci");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <fieldset style={s.section}>
        <legend style={s.legend}>{t("exportWizard.triggerLabel")}</legend>
        <div style={s.toggles}>
          {TRIGGERS.map((trigger) => {
            const on = triggers.includes(trigger);
            return (
              <button
                key={trigger}
                type="button"
                aria-pressed={on}
                onClick={() => onToggleTrigger(trigger)}
                className="mono"
                style={{ ...s.toggle, ...(on ? s.toggleOn : null) }}
              >
                {on && <Icon.Check size={14} aria-hidden="true" />}
                {t(`exportWizard.triggers.${trigger}`)}
              </button>
            );
          })}
        </div>
        {triggers.length === 0 && (
          <p role="alert" style={s.error}>
            {t("exportWizard.noTrigger")}
          </p>
        )}
      </fieldset>

      <fieldset style={s.section}>
        <legend style={s.legend}>{t("exportWizard.postResultsLabel")}</legend>
        {POST_AS_OPTIONS.map((option) => (
          <label key={option} style={s.radioRow}>
            <input
              type="radio"
              name="ci-post-as"
              value={option}
              checked={postAs === option}
              onChange={() => onPostAs(option)}
            />
            <span>{t(`exportWizard.postAs.${option}`)}</span>
            {option === RECOMMENDED_POST_AS && <span style={s.badge}>{t("exportWizard.recommended")}</span>}
          </label>
        ))}
      </fieldset>

      <div style={s.info}>
        <Icon.Info size={16} aria-hidden="true" style={s.infoIcon} />
        <p style={{ margin: 0 }}>
          {t.rich("exportWizard.blockMergeInfo", {
            b: (chunks) => <strong style={s.strong}>{chunks}</strong>,
            check: BLOCKING_CHECK_NAME,
            code: (chunks) => <code className="mono">{chunks}</code>,
          })}
        </p>
      </div>
    </div>
  );
}
