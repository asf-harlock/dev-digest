"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalSkillCaseListItem } from "@devdigest/shared";
import { EFFECT_VISUAL } from "./constants";
import { s } from "./styles";

type Latest = NonNullable<EvalSkillCaseListItem["latest_result"]>;

/** A case's effect for the skill in its latest finished run (AC-4): `helped`, `hurt`,
 *  `no effect · pass`, `no effect · fail` or `errored`, with the two arms' states beside it.
 *  Icon, colour and text each carry it; text alone is enough (NFR-8). */
export function EffectLabel({ latest }: { latest: Latest }) {
  const t = useTranslations("skills");
  const te = useTranslations("eval");
  const { key, icon, color } = EFFECT_VISUAL[latest.effect];
  const I = Icon[icon];
  return (
    <span style={s.wrap}>
      <span style={s.effect(color)}>
        <I size={14} aria-hidden="true" />
        {t(`evals.effect.${key}`)}
      </span>
      <span style={s.arms}>
        {t("evals.arms", {
          withSkill: te(`evalsTab.case.state.${latest.with_state}`),
          withoutSkill: te(`evalsTab.case.state.${latest.without_state}`),
        })}
      </span>
    </span>
  );
}
