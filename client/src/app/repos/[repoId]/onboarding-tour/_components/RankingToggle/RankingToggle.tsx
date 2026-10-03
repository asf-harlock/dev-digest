"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { TourRankingMode } from "@devdigest/shared";
import { MAX_WINDOW_DAYS, MIN_WINDOW_DAYS } from "./constants";
import { parseWindowDays } from "./helpers";
import { s } from "./styles";

/**
 * Ranking-mode radio group next to Generate (AC-23). Activity mode reveals the
 * days input (AC-24, bounds 7-730) and the disk-growth warning (AC-25); it is
 * disabled with a stated reason when there is no local clone (EC-8). State is
 * owned by the parent so it can build the POST body.
 */
export function RankingToggle({
  mode,
  onModeChange,
  days,
  onDaysChange,
  canUseActivity,
  disabled,
}: {
  mode: TourRankingMode;
  onModeChange: (m: TourRankingMode) => void;
  days: string;
  onDaysChange: (v: string) => void;
  canUseActivity: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("onboarding");
  const uid = React.useId();
  const activity = mode === "activity";
  const invalid = activity && parseWindowDays(days) === null;

  return (
    <fieldset style={s.group} disabled={disabled}>
      <legend style={s.legend}>{t("tour.ranking.legend")}</legend>
      <label style={s.option}>
        <input
          type="radio"
          name={`${uid}-mode`}
          checked={!activity}
          onChange={() => onModeChange("import_graph")}
        />
        {t("tour.ranking.importGraph")}
      </label>
      <label style={{ ...s.option, ...(canUseActivity ? null : s.optionDisabled) }}>
        <input
          type="radio"
          name={`${uid}-mode`}
          checked={activity}
          disabled={!canUseActivity}
          aria-describedby={canUseActivity ? undefined : `${uid}-reason`}
          onChange={() => onModeChange("activity")}
        />
        {t("tour.ranking.activity")}
      </label>
      {!canUseActivity && (
        <p id={`${uid}-reason`} style={s.reason}>
          {t("tour.ranking.noClone")}
        </p>
      )}
      {activity && (
        <>
          <div style={s.days}>
            <label htmlFor={`${uid}-days`}>{t("tour.ranking.days")}</label>
            <input
              id={`${uid}-days`}
              type="number"
              inputMode="numeric"
              min={MIN_WINDOW_DAYS}
              max={MAX_WINDOW_DAYS}
              step={1}
              value={days}
              aria-invalid={invalid}
              aria-describedby={invalid ? `${uid}-err` : undefined}
              style={s.input}
              onChange={(e) => onDaysChange(e.target.value)}
            />
          </div>
          {invalid && (
            <p id={`${uid}-err`} role="alert" style={s.error}>
              {t("tour.ranking.daysError", { min: MIN_WINDOW_DAYS, max: MAX_WINDOW_DAYS })}
            </p>
          )}
          <p style={s.warning} role="note">
            {t("tour.ranking.warning")}
          </p>
        </>
      )}
    </fieldset>
  );
}

export default RankingToggle;
