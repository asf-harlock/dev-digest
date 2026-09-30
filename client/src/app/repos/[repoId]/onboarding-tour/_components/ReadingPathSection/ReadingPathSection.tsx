"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { TourReadingPath } from "@devdigest/shared";
import { isActiveRecently } from "./helpers";
import { s } from "./styles";

/** Numbered list of files to read, each with a one-line reason (AC-8). */
export function ReadingPathSection({
  section,
  activityRanked = false,
}: {
  section: TourReadingPath | undefined;
  activityRanked?: boolean;
}) {
  const t = useTranslations("onboarding");
  const items = section?.items ?? [];
  if (items.length === 0) return <p style={s.empty}>{t("tour.empty.readingPath")}</p>;
  return (
    <ol style={s.list}>
      {items.map((item, i) => (
        <li key={item.path} style={s.item}>
          <span style={s.num} aria-hidden="true">{i + 1}</span>
          <div>
            <div className="mono" style={s.path}>
              {item.path}
              {activityRanked && isActiveRecently(item.hotness) && (
                <span style={s.active}> · {t("tour.activeRecently")}</span>
              )}
            </div>
            <p style={s.why}>{item.why}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default ReadingPathSection;
