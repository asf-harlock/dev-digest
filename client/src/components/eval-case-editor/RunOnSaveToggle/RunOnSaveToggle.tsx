"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "./styles";

/** The footer toggle **Run on save** (SPEC-10 AC-33, NFR-10): a `role="switch"` button with its
 *  visible label as its name, a 24px-plus target, and a visible state beside the track so it is
 *  never colour alone. It is off on every open (the caller keeps the state), and disabled with a
 *  reason when the owner is a skill with no linked agent (EC-19). */
export function RunOnSaveToggle({
  on,
  onChange,
  disabledReason,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  /** Present: the switch is disabled and the reason is its title and description. */
  disabledReason?: string;
}) {
  const t = useTranslations("eval");
  const hintId = "run-on-save-hint";
  const disabled = disabledReason !== undefined;
  return (
    <span style={s.wrap} title={disabledReason}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={disabled ? hintId : undefined}
        disabled={disabled}
        style={s.button(on, disabled)}
        onClick={() => onChange(!on)}
      >
        <span style={s.track(on)} aria-hidden="true">
          <span style={s.knob(on)} />
        </span>
        <span>{t("caseRun.runOnSave")}</span>
      </button>
      {disabled && (
        <span id={hintId} style={s.srOnly}>
          {disabledReason}
        </span>
      )}
    </span>
  );
}
