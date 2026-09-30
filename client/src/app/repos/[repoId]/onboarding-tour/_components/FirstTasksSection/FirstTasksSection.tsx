"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { TourFirstTasks } from "@devdigest/shared";
import { COMPLEXITY_COLOR } from "./constants";
import { s } from "./styles";

/**
 * Up to 3 task cards, each marked as a suggestion (AC-9). Complexity is text,
 * coloured per level like the mockup but never colour alone (NFR-8). The
 * mockup shows no "(suggested)" text, so the marker is kept for assistive tech
 * and as the badge's tooltip; null complexity shows only the marker.
 */
export function FirstTasksSection({ section }: { section: TourFirstTasks | undefined }) {
  const t = useTranslations("onboarding");
  const items = (section?.items ?? []).slice(0, 3);
  if (items.length === 0) return <p style={s.empty}>{t("tour.empty.firstTasks")}</p>;
  return (
    <div style={s.grid}>
      {items.map((task) => (
        <article key={task.title} style={s.card}>
          <h3 style={s.title}>{task.title}</h3>
          {task.description && <p style={s.desc}>{task.description}</p>}
          {task.paths.map((p) => (
            <span key={p} className="mono" style={s.path}>{p}</span>
          ))}
          {task.complexity ? (
            <span title={t("tour.suggestedComplexity", { level: t(`tour.complexity.${task.complexity}`) })} style={s.chipWrap}>
              <Badge color={COMPLEXITY_COLOR[task.complexity]} bg="transparent" style={s.chip}>
                {t(`tour.complexity.${task.complexity}`)}
                <span style={s.srOnly}> {t("tour.suggestedMarker")}</span>
              </Badge>
            </span>
          ) : (
            <Badge bg="transparent" style={s.chip}>
              {t("tour.suggestion")}
            </Badge>
          )}
        </article>
      ))}
    </div>
  );
}

export default FirstTasksSection;
