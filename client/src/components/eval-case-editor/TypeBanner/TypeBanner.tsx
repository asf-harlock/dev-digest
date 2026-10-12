"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalExpectationType } from "@devdigest/shared";
import { EXPECTATION_TYPES } from "../constants";
import type { BannerFacts } from "../helpers";
import { TYPE_VISUAL } from "./constants";
import { s } from "./styles";

/** The POSITIVE / NEGATIVE CASE banner (AC-16): the type, the expectation's title and its
 *  `file:line`, following the type switch at once. The switch (AC-18) is part of it while the
 *  input is editable. Title and file are PR-author / model text, rendered as escaped text and
 *  truncated with a `title` attribute (UI-4, EC-12). */
export function TypeBanner({
  type,
  facts,
  editable,
  onTypeChange,
}: {
  type: EvalExpectationType;
  facts: BannerFacts | null;
  editable: boolean;
  onTypeChange: (type: EvalExpectationType) => void;
}) {
  const t = useTranslations("eval");
  const { icon, color, label } = TYPE_VISUAL[type];
  const I = Icon[icon];
  const location = facts ? `${facts.file}:${facts.startLine}` : null;
  let text: string;
  if (type === "must_find") {
    text =
      location === null
        ? t("caseEditor.banner.mustFindBare")
        : facts?.title
          ? t("caseEditor.banner.mustFind", { title: facts.title, location })
          : t("caseEditor.banner.mustFindNoTitle", { location });
  } else {
    text =
      location === null
        ? t("caseEditor.banner.mustNotFlagBare")
        : t("caseEditor.banner.mustNotFlag", { location });
  }

  return (
    <div style={s.banner(color)} data-testid="type-banner">
      <span style={s.label(color)}>
        <I size={14} aria-hidden="true" />
        {label === "positive" ? t("caseEditor.banner.positive") : t("caseEditor.banner.negative")}
      </span>
      <span style={s.text} title={text}>
        {text}
      </span>
      {editable && (
        <div role="radiogroup" aria-label={t("caseEditor.fields.type")} style={s.switch}>
          {EXPECTATION_TYPES.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={choice === type}
              style={s.choice(choice === type)}
              onClick={() => onTypeChange(choice)}
            >
              {choice === "must_find" ? t("caseEditor.typeSwitch.mustFind") : t("caseEditor.typeSwitch.mustNotFlag")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
