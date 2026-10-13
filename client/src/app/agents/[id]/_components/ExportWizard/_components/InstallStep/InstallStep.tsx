"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { OPENROUTER_SECRET_NAME, type InstallAction } from "../../constants";
import { exportErrorKind, isGithubUrl, secretsUrl } from "../../helpers";
import { ErrorNotice } from "../ErrorNotice";
import { s } from "./styles";

/** What a finished install left behind: the pull request, or the downloaded zip. */
export type InstallResult = { kind: "pr"; url: string | null } | { kind: "zip"; filename: string };

/** Step 4: pick how to install (AC-10), the secret reminder (AC-11), and the outcome — the "View pull
 *  request" link (AC-14) or the error by code (EC-1..EC-3, EC-9..EC-11). The kit buttons live in the
 *  parent's footer; the options here are radios, so nothing in this step can submit. */
export function InstallStep({
  repo,
  fileCount,
  action,
  onAction,
  result,
  error,
  onRetry,
  disabled,
}: {
  repo: string;
  /** Total files of the preview — the real count (AC-10). */
  fileCount: number | undefined;
  action: InstallAction;
  onAction: (action: InstallAction) => void;
  result: InstallResult | null;
  error: unknown;
  /** Retry of a failed pull request (EC-9). */
  onRetry: () => void;
  /** An install request is pending: the options are frozen (EC-35). */
  disabled: boolean;
}) {
  const t = useTranslations("ci");
  const secrets = secretsUrl(repo);
  const count = fileCount ?? 0;

  if (result) {
    return (
      <div style={s.done}>
        <div style={s.doneHead}>
          <Icon.CheckCircle size={18} style={s.doneIcon} aria-hidden="true" />
          {result.kind === "pr" ? t("exportWizard.done.prTitle") : t("exportWizard.done.zipTitle")}
        </div>
        {result.kind === "pr" ? (
          <>
            <span>{t("exportWizard.done.prBody", { repo })}</span>
            {isGithubUrl(result.url) && (
              <a href={result.url} target="_blank" rel="noopener noreferrer" style={s.link}>
                {t("exportWizard.viewPr")}
                <Icon.ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
          </>
        ) : (
          <span>{t("exportWizard.done.zipBody", { filename: result.filename })}</span>
        )}
        <SecretReminder repo={repo} secretsHref={secrets} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <legend style={{ ...s.optionHead, padding: 0, marginBottom: 12, fontSize: 14 }}>
          {t("exportWizard.installLabel")}
        </legend>
        <label style={{ ...s.option, ...(action === "open_pr" ? s.optionOn : null) }}>
          <input
            type="radio"
            name="ci-install-action"
            value="open_pr"
            checked={action === "open_pr"}
            disabled={disabled}
            onChange={() => onAction("open_pr")}
          />
          <span style={s.optionBody}>
            <span style={s.optionHead}>
              <Icon.GitBranch size={16} aria-hidden="true" />
              {t("exportWizard.installCardTitle")}
              <span style={s.badge}>{t("exportWizard.recommended")}</span>
            </span>
            <span style={s.optionText}>{t("exportWizard.installCardBody", { repo, count })}</span>
          </span>
        </label>
        <label style={{ ...s.option, ...(action === "files" ? s.optionOn : null) }}>
          <input
            type="radio"
            name="ci-install-action"
            value="files"
            checked={action === "files"}
            disabled={disabled}
            onChange={() => onAction("files")}
          />
          <span style={s.optionBody}>
            <span style={s.optionHead}>
              <Icon.Copy size={16} aria-hidden="true" />
              {t("exportWizard.zipCardTitle")}
            </span>
            <span style={s.optionText}>{t("exportWizard.zipCardBody", { count })}</span>
          </span>
        </label>
      </fieldset>

      <SecretReminder repo={repo} secretsHref={secrets} />

      {error != null && <ErrorNotice error={error} onRetry={exportErrorKind(error) === "ci_pr_failed" ? onRetry : undefined} />}
    </div>
  );
}

function SecretReminder({ repo, secretsHref }: { repo: string; secretsHref: string | null }) {
  const t = useTranslations("ci");
  return (
    <p style={s.secrets}>
      <span>
        {t.rich("exportWizard.secretNote", {
          key: OPENROUTER_SECRET_NAME,
          code: (chunks) => <code className="mono">{chunks}</code>,
        })}
      </span>
      {secretsHref && (
        <a href={secretsHref} target="_blank" rel="noopener noreferrer" style={s.link} aria-label={t("exportWizard.secretsLinkLabel", { repo })}>
          {t("exportWizard.secretsLink")}
          <Icon.ExternalLink size={13} aria-hidden="true" />
        </a>
      )}
      <span>{t("exportWizard.githubTokenNote")}</span>
    </p>
  );
}
