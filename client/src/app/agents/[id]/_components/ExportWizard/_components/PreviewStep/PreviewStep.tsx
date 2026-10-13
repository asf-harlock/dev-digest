"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { CiExportInputBody, CiPreview } from "@devdigest/shared";
import { useCiPreviewFile } from "@/lib/hooks/ci";
import { RUNNER_KIND, WORKFLOW_KIND } from "../../constants";
import { defaultFilePath } from "../../helpers";
import { ErrorNotice } from "../ErrorNotice";
import { isEmptyFile, warningValues } from "./helpers";
import { s } from "./styles";

/** Step 2: every file to create (AC-4). The workflow is an editable text area (AC-5); the other files
 *  are read-only, and a runner file's text is loaded when it is selected (AC-6). Warnings do not block
 *  Continue (EC-7, EC-16, EC-17). */
export function PreviewStep({
  agentId,
  input,
  preview,
  workflowEdit,
  onEditWorkflow,
  onRetry,
}: {
  agentId: string;
  /** The same request body as the preview itself, so the runner file query shares its inputs. */
  input: CiExportInputBody;
  preview: { data: CiPreview | undefined; isLoading: boolean; error: unknown };
  /** The hand-edited workflow text, or null while it is the generated one. */
  workflowEdit: string | null;
  onEditWorkflow: (text: string | null) => void;
  onRetry: () => void;
}) {
  const t = useTranslations("ci");
  const [selected, setSelected] = React.useState<string | null>(null);
  const files = React.useMemo(() => preview.data?.files ?? [], [preview.data]);
  const path = selected ?? defaultFilePath(files);
  const file = files.find((f) => f.path === path);
  const isWorkflow = file?.kind === WORKFLOW_KIND;
  const isRunner = file?.kind === RUNNER_KIND;
  const runnerFile = useCiPreviewFile(agentId, input, path ?? "", isRunner);

  if (preview.isLoading) {
    return (
      <p role="status" aria-busy="true" style={s.muted}>
        {t("exportWizard.generating")}
      </p>
    );
  }
  if (preview.error || !preview.data) {
    return <ErrorNotice error={preview.error} onRetry={onRetry} />;
  }

  const text = isWorkflow ? (workflowEdit ?? file?.contents ?? "") : (file?.contents ?? runnerFile.data?.contents ?? "");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {preview.data.warnings.length > 0 && (
        <div style={s.warnings}>
          {preview.data.warnings.map((w) => (
            <p key={w.code} role="status" style={s.warning}>
              <Icon.AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{t(`exportWizard.warnings.${w.code}`, warningValues(w))}</span>
            </p>
          ))}
        </div>
      )}
      <div style={s.grid}>
        <ul aria-label={t("exportWizard.filesToCreate")} style={s.list}>
          <li style={s.listLabel} aria-hidden="true">
            {t("exportWizard.filesToCreate")}
          </li>
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                aria-current={f.path === path ? "true" : undefined}
                onClick={() => setSelected(f.path)}
                className="mono"
                style={{ ...s.file, ...(f.path === path ? s.fileActive : null) }}
              >
                <Icon.FileText size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  {f.path}
                  {isEmptyFile(f) && <span style={s.fileTag}>({t("exportWizard.empty")})</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div style={s.pane}>
          {file ? (
            <>
              <div style={s.paneHead}>
                <span className="mono" style={s.paneTitle}>
                  {file.path}
                </span>
                {isWorkflow && workflowEdit != null && (
                  <Button type="button" size="sm" kind="tertiary" onClick={() => onEditWorkflow(null)}>
                    {t("exportWizard.resetEdit")}
                  </Button>
                )}
                <span style={s.chip}>
                  <Icon.Edit size={12} aria-hidden="true" />
                  {isWorkflow
                    ? workflowEdit != null
                      ? t("exportWizard.edited")
                      : t("exportWizard.editable")
                    : t("exportWizard.readOnly")}
                </span>
              </div>
              {isWorkflow ? (
                <textarea
                  className="mono"
                  aria-label={t("exportWizard.workflowEditorLabel")}
                  spellCheck={false}
                  value={text}
                  onChange={(e) => onEditWorkflow(e.target.value)}
                  style={s.textarea}
                />
              ) : isRunner && runnerFile.isLoading ? (
                <p role="status" aria-busy="true" style={s.muted}>
                  {t("exportWizard.loadingFile")}
                </p>
              ) : isRunner && runnerFile.error ? (
                <p role="alert" style={s.muted}>
                  {t("exportWizard.fileError")}
                </p>
              ) : isEmptyFile(file) ? (
                <p style={s.muted}>{t("exportWizard.emptyFile")}</p>
              ) : (
                <pre className="mono" tabIndex={0} aria-label={file.path} style={s.code}>
                  {text}
                </pre>
              )}
              {file.note && <p style={s.note}>{file.note}</p>}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
