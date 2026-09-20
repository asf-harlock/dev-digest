"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, type DropdownItemDef } from "@devdigest/ui";
import type { ConventionExtractionMode } from "@devdigest/shared";
import { DROPDOWN_WIDTH } from "./constants";

/**
 * Trigger + mode picker for `POST /repos/:id/conventions/extract`.
 * Mirrors RunReviewDropdown: the whole button opens the menu rather than
 * running a default action directly, so every (re-)scan is an explicit
 * choice of local / AI / both.
 */
export function RunExtractionDropdown({
  loading,
  onRun,
}: {
  loading: boolean;
  onRun: (mode: ConventionExtractionMode) => void;
}) {
  const t = useTranslations("conventions");

  const items: DropdownItemDef[] = [
    {
      label: t("page.runBoth"),
      hint: t("page.runBothHint"),
      icon: "Layers",
      onClick: () => onRun("both"),
    },
    { divider: true },
    {
      label: t("page.runAi"),
      hint: t("page.runAiHint"),
      icon: "Sparkles",
      onClick: () => onRun("ai"),
    },
    {
      label: t("page.runLocal"),
      hint: t("page.runLocalHint"),
      icon: "Zap",
      onClick: () => onRun("local"),
    },
  ];

  return (
    <Dropdown
      width={DROPDOWN_WIDTH}
      align="right"
      items={items}
      trigger={
        <Button kind="secondary" icon="RefreshCw" iconRight="ChevronDown" loading={loading}>
          {loading ? t("page.scanning") : t("page.rescan")}
        </Button>
      }
    />
  );
}
