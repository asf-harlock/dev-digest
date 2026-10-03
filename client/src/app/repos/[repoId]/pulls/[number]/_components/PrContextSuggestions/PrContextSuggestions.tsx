/* PrContextSuggestions — documents the server suggests attaching (never
   auto-attached). One click adds a suggestion to the list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { PrContextSuggestion } from "@devdigest/shared";
import { s } from "./styles";

export function PrContextSuggestions({
  suggestions,
  disabled,
  onAdd,
}: {
  suggestions: PrContextSuggestion[];
  disabled: boolean;
  onAdd: (path: string) => void;
}) {
  const t = useTranslations("prContext");
  if (suggestions.length === 0) return null;
  return (
    <section style={s.wrap} aria-label={t("suggestions.title")}>
      <span style={s.title}>{t("suggestions.title")}</span>
      <ul style={s.list}>
        {suggestions.map((sg) => (
          <li key={sg.path} style={s.item}>
            <span style={s.path}>
              <span className="mono">{sg.path}</span> <span style={s.reason}>{sg.reason}</span>
            </span>
            <Button kind="secondary" size="sm" disabled={disabled} onClick={() => onAdd(sg.path)}>
              {t("suggestions.add")}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
