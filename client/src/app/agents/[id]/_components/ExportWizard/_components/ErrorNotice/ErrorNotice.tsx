"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { RUNNER_BUILD_COMMAND, SETTINGS_API_KEYS_HREF } from "../../constants";
import { exportErrorKind, takenAgentName } from "../../helpers";
import { s } from "./styles";

/** An export / preview failure, told by `ApiError.code` and `status` — never by the message text
 *  (EC-1, EC-2, EC-3, EC-9, EC-10, EC-11). The 422 message is the YAML parser's and is shown as text.
 *  `onRetry` adds a Retry button for a failed pull request (EC-9, same branch on the retry). */
export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useTranslations("ci");
  const kind = exportErrorKind(error);
  const message = error instanceof ApiError ? error.message : "";
  return (
    <div role="alert" style={s.box} data-error-kind={kind}>
      <div style={s.head}>
        <Icon.AlertTriangle size={16} style={s.icon} aria-hidden="true" />
        <p style={s.text}>
          {kind === "github_token_missing" && (
            <>
              {t("exportWizard.errors.github_token_missing")}{" "}
              <Link href={SETTINGS_API_KEYS_HREF}>{t("exportWizard.errors.openApiKeys")}</Link>
            </>
          )}
          {kind === "github_permission" && t("exportWizard.errors.github_permission")}
          {kind === "runner_bundle_missing" && (
            <>
              {t("exportWizard.errors.runner_bundle_missing")} <code>{RUNNER_BUILD_COMMAND}</code>
            </>
          )}
          {kind === "ci_pr_failed" && t("exportWizard.errors.ci_pr_failed")}
          {kind === "ci_no_changes" && t("exportWizard.errors.ci_no_changes")}
          {kind === "ci_export_running" && t("exportWizard.errors.ci_export_running")}
          {kind === "ci_repo_taken" &&
            t("exportWizard.errors.ci_repo_taken", { agent: takenAgentName(error) ?? t("exportWizard.thisAgent") })}
          {kind === "rate_limited" && t("exportWizard.errors.rate_limited")}
          {kind === "invalid_workflow" && t("exportWizard.errors.invalid_workflow", { message })}
          {kind === "generic" && t("exportWizard.errors.generic", { message })}
        </p>
      </div>
      {onRetry && (
        <div style={s.actions}>
          <Button type="button" size="sm" icon="RefreshCw" onClick={onRetry}>
            {t("exportWizard.retry")}
          </Button>
        </div>
      )}
    </div>
  );
}
