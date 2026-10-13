/* ViewSwitch — the Columns / Tabs segmented control. The state lives in the page's `?view=` query. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { VIEW_MODES, type ViewMode } from "./constants";
import { s } from "./styles";

export function ViewSwitch({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const t = useTranslations("runs");
  return (
    <div role="group" aria-label={t("page.viewLabel")} style={s.group}>
      {VIEW_MODES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          onClick={() => onChange(m)}
          style={s.option(value === m)}
        >
          {t(`page.view.${m}`)}
        </button>
      ))}
    </div>
  );
}
