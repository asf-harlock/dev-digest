"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button, EmptyState, Icon } from "@devdigest/ui";
import { ContextDocList } from "../context-doc-list";
import { ContextDocPreview } from "../context-doc-preview";
import { TOKEN_BUDGET } from "../context-doc-list/constants";
import { isListingComplete, summarizeBudget, tokensByPath, toggleAttached, type InheritedDoc } from "../context-doc-list/helpers";
import { useContextFiles } from "@/lib/hooks/core";
import { s } from "./styles";

export interface ContextAttachPanelProps {
  repoId: string | null;
  title: string;
  hint: string;
  /** Saved ordered attached paths of the agent or skill. */
  attached: string[];
  /** Skill-contributed documents (agent tab only). */
  inherited?: InheritedDoc[];
  /** Agent tab shows "N of M attached"; skill tab shows "N attached". */
  showTotal: boolean;
  /** A save is in flight: checkboxes and Move controls are disabled (EC-23). */
  saving: boolean;
  /** Persist the full ordered list; there is no separate Save button (AC-13). */
  onSave: (paths: string[]) => void;
}

/** Body of both Context tabs: badge, hint, filterable document list with
 *  attach/reorder, preview drawer with an Attached toggle, and a footer with
 *  the `≈ N tokens per call` total and the over-budget warning (EC-13). */
export function ContextAttachPanel({
  repoId,
  title,
  hint,
  attached,
  inherited = [],
  showTotal,
  saving,
  onSave,
}: ContextAttachPanelProps) {
  const t = useTranslations("context");
  const format = useFormatter();
  const listing = useContextFiles(repoId);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  if (!repoId) {
    return <EmptyState icon="Folder" title={t("attach.noRepo.title")} body={t("attach.noRepo.body")} />;
  }

  const data = listing.data;
  const files = data?.files ?? [];
  const total = data?.total ?? files.length;
  const complete = isListingComplete(files.length, total);
  const attachedCount = attached.length;

  const merged = [...attached, ...inherited.map((d) => d.path)];
  const budget = summarizeBudget(merged, tokensByPath(files));
  const isAttachedPreview = previewPath != null && attached.includes(previewPath);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{title}</h2>
        {data && data.state !== "not_cloned" && (
          <Badge color="var(--accent-text)">
            {showTotal
              ? t("attach.ofTotal", { attached: attachedCount, total: complete ? files.length : total })
              : t("attach.attachedCount", { attached: attachedCount })}
          </Badge>
        )}
      </div>
      <p style={s.hint}>{hint}</p>

      <ContextDocList
        files={files}
        total={total}
        isLoading={listing.isLoading}
        isError={listing.isError}
        onRetry={() => listing.refetch()}
        notCloned={data?.state === "not_cloned"}
        attached={attached}
        inherited={inherited}
        disabled={saving}
        onChange={onSave}
        onPreview={setPreviewPath}
        previewPath={previewPath}
      />

      {previewPath && (
        <ContextDocPreview
          key={previewPath}
          repoId={repoId}
          path={previewPath}
          layout="drawer"
          onClose={() => setPreviewPath(null)}
          action={
            <Button
              kind={isAttachedPreview ? "secondary" : "primary"}
              size="sm"
              icon={isAttachedPreview ? "Check" : "Plus"}
              disabled={saving}
              aria-pressed={isAttachedPreview}
              onClick={() => onSave(toggleAttached(attached, previewPath, !isAttachedPreview))}
            >
              {isAttachedPreview ? t("attach.attached") : t("attach.attach")}
            </Button>
          }
        />
      )}

      <div style={s.footer}>
        <div aria-live="polite" aria-atomic="true">
          <strong>{t("attach.tokensPerCall", { tokens: format.number(budget.total) })}</strong>
          {budget.skipped.length > 0 && (
            <div style={s.warning}>
              <Icon.AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                {t("attach.overBudget", {
                  budget: format.number(TOKEN_BUDGET),
                  paths: budget.skipped.join(", "),
                })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
