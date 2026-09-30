"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { TourFirstTasks } from "@devdigest/shared";
import { s } from "./styles";

/** Up to 3 task cards, each marked as a suggestion (AC-9). Complexity is text, never colour alone (NFR-8); null shows only the marker. */
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
          <Badge style={s.chip}>
            {task.complexity
              ? t("tour.suggestedComplexity", { level: t(`tour.complexity.${task.complexity}`) })
              : t("tour.suggestion")}
          </Badge>
        </article>
      ))}
    </div>
  );
}

export default FirstTasksSection;
