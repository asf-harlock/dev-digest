"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { CiInstallation } from "@devdigest/shared";
import { useRelativeTime } from "@/lib/relative-time";
import { StatusPill } from "../StatusPill";
import { s } from "./styles";

/** One CI installation: repo, target, workflow version, latest status and its relative time (AC-39, EC-33). */
export function InstallationRow({
  installation,
  selected,
  onSelect,
}: {
  installation: CiInstallation;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("ci");
  const relativeTime = useRelativeTime();
  const ranAt = installation.last_run?.ran_at ?? null;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{ ...s.row, ...(selected ? s.rowSelected : {}) }}
    >
      <Icon.GitBranch size={16} style={s.icon} />
      <span className="mono" style={s.repo} title={installation.repo}>
        {installation.repo}
      </span>
      <span style={s.meta}>
        <Badge icon="Workflow">{t(`ciTab.targets.${installation.target_type}`)}</Badge>
        <span style={s.version}>{t("ciTab.workflowVersion", { version: installation.workflow_version })}</span>
        {installation.update_available && (
          <Badge color="var(--warn)" bg="var(--warn-bg)" icon="ArrowUp">
            {t("ciTab.updateAvailable")}
          </Badge>
        )}
        <StatusPill status={installation.last_run?.status ?? installation.status} />
      </span>
      <span style={s.time}>{ranAt ? relativeTime(ranAt) : t("ciTab.noTime")}</span>
    </button>
  );
}
