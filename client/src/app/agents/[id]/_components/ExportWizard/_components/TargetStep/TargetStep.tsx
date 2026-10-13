"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SelectInput } from "@devdigest/ui";
import type { Repo } from "@devdigest/shared";
import { s } from "./styles";

/** Step 1: GitHub Actions is the only target (AC-3), above the selector of connected repositories.
 *  A repository already owned by another agent names that agent (AC-32); the repository is
 *  read-only when updating an installation (AC-35). */
export function TargetStep({
  repos,
  reposLoading,
  repo,
  locked,
  takenByName,
  onRepoChange,
}: {
  repos: readonly Repo[];
  reposLoading: boolean;
  repo: string;
  locked: boolean;
  takenByName: string | null;
  onRepoChange: (fullName: string) => void;
}) {
  const t = useTranslations("ci");
  const options = React.useMemo(() => {
    const names = repos.map((r) => r.full_name);
    // The repo may not be in the list (a stale installation): still show it.
    if (repo && !names.some((n) => n.toLowerCase() === repo.toLowerCase())) names.unshift(repo);
    return names.map((n) => ({ value: n, label: n }));
  }, [repos, repo]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={s.card}>
        <div style={s.cardHead}>
          <span style={s.cardIcon} aria-hidden="true">
            <Icon.Workflow size={18} />
          </span>
          <span style={s.cardTitle}>{t("exportWizard.targets.gha")}</span>
          <span style={s.badge}>{t("exportWizard.recommended")}</span>
        </div>
        <span style={s.cardDesc}>{t("exportWizard.targets.ghaDesc")}</span>
      </div>

      <div style={s.field}>
        {locked ? (
          <>
            <span style={s.label}>{t("exportWizard.repoLabel")}</span>
            <div style={s.locked} data-testid="locked-repo">
              <Icon.Lock size={14} aria-hidden="true" />
              <span className="mono">{repo}</span>
            </div>
            <p style={s.hint}>{t("exportWizard.repoLocked")}</p>
          </>
        ) : (
          <>
            <label style={s.field}>
              <span style={s.label}>{t("exportWizard.repoLabel")}</span>
              {reposLoading ? (
                <p style={s.muted}>{t("exportWizard.reposLoading")}</p>
              ) : options.length === 0 ? (
                <p style={s.muted}>{t("exportWizard.noRepos")}</p>
              ) : (
                <SelectInput value={repo} onChange={onRepoChange} options={options} />
              )}
            </label>
            <p style={s.hint}>{t("exportWizard.repoHint")}</p>
          </>
        )}
        {takenByName && (
          <p role="alert" style={s.taken}>
            <Icon.AlertTriangle size={16} aria-hidden="true" />
            <span>{t("exportWizard.repoTaken", { agent: takenByName })}</span>
          </p>
        )}
      </div>
    </div>
  );
}
