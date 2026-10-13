"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { CiFailOn } from "@devdigest/shared";
import { FAIL_ON_VALUES } from "../../constants";
import { s } from "./styles";

/** Fail CI on — segmented control (Never / Critical / Warning + / Any), `aria-pressed` marks the current value (AC-41). */
export function FailOnControl({
  value,
  onChange,
  disabled,
}: {
  value: CiFailOn;
  onChange: (next: CiFailOn) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("ci");
  const labelId = React.useId();
  return (
    <div style={s.panel}>
      <div style={s.text}>
        <span id={labelId} style={s.label}>
          {t("ciTab.failOn.label")}
        </span>
        <span style={s.hint}>{t("ciTab.failOn.hint")}</span>
      </div>
      <div role="group" aria-labelledby={labelId} style={s.group}>
        {FAIL_ON_VALUES.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={v === value}
            disabled={disabled}
            onClick={() => v !== value && onChange(v)}
            style={{
              ...s.segment,
              ...(v === value ? s.segmentOn : {}),
              ...(disabled ? s.segmentDisabled : {}),
            }}
          >
            {t(`ciTab.failOn.options.${v}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
