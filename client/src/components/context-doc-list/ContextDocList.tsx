"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { SKELETON_ROWS } from "./constants";
import { buildRows, filterPaths, isListingComplete, moveAttached, toggleAttached, type InheritedDoc } from "./helpers";
import { ContextDocRow } from "../context-doc-row";
import { s } from "./styles";

export interface ContextDocListProps {
  files: SpecFile[];
  /** Pre-cap match count from the listing; `files.length < total` means capped. */
  total?: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Listing `state: 'not_cloned'` (EC-1). */
  notCloned?: boolean;
  /** Attach mode: the saved ordered attached paths. Omit for the read-only page list. */
  attached?: string[];
  /** Documents contributed by skills (agent tab), rendered read-only. */
  inherited?: InheritedDoc[];
  /** True while a save is in flight (EC-23). */
  disabled?: boolean;
  /** Attach mode: the full next ordered list after a toggle, move or remove. */
  onChange?: (next: string[]) => void;
  onPreview: (path: string) => void;
  /** Path currently shown in the preview panel (page mode highlight). */
  previewPath?: string | null;
}

/** Document list shared by the Project Context page and both Context tabs.
 *  Owns the filter box and every list state: skeleton, error + Retry,
 *  not-cloned, empty, "No documents match", rows. */
export function ContextDocList({
  files,
  total,
  isLoading,
  isError,
  onRetry,
  notCloned,
  attached,
  inherited,
  disabled = false,
  onChange,
  onPreview,
  previewPath,
}: ContextDocListProps) {
  const t = useTranslations("context");
  const [query, setQuery] = React.useState("");
  const attachMode = attached != null;

  if (isLoading) {
    return (
      <div style={s.skeletonStack} aria-busy="true" aria-label={t("loading")}>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Skeleton key={i} height={s.skeletonRow.height} />
        ))}
      </div>
    );
  }
  if (isError) return <ErrorState body={t("loadError")} onRetry={onRetry} />;
  if (notCloned) {
    return <EmptyState icon="Folder" title={t("notCloned.title")} body={t("notCloned.body")} />;
  }

  const allRows = buildRows({
    files,
    attached,
    inherited,
    listingComplete: isListingComplete(files.length, total),
  });
  if (allRows.length === 0) {
    return <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.body")} />;
  }

  const rows = filterPaths(
    allRows.map((r) => ({ ...r, path: r.type === "file" ? r.file.path : r.path })),
    query,
  );
  const lastAttached = (attached?.length ?? 0) - 1;

  const change = (next: string[] | null) => {
    if (next && onChange) onChange(next);
  };

  return (
    <div style={s.wrap}>
      <div style={s.search}>
        <Icon.Search size={13} style={s.searchIcon} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("filter.placeholder")}
          aria-label={t("filter.label")}
          style={s.searchInput}
        />
      </div>
      {rows.length === 0 ? (
        <div style={s.noMatch}>
          <span>{t("filter.noMatch")}</span>
          <Button kind="ghost" size="sm" onClick={() => setQuery("")}>
            {t("filter.clear")}
          </Button>
        </div>
      ) : (
        <ul style={s.list}>
          {rows.map((row) => (
            <ContextDocRow
              key={`${row.type}:${row.path}`}
              row={row}
              attachMode={attachMode}
              disabled={disabled}
              selected={previewPath === row.path}
              canMoveUp={row.type === "file" && row.attachedIndex > 0}
              canMoveDown={row.type === "file" && row.attachedIndex >= 0 && row.attachedIndex < lastAttached}
              onToggle={(path, attach) => change(toggleAttached(attached ?? [], path, attach))}
              onMove={(path, dir) => change(moveAttached(attached ?? [], path, dir))}
              onRemove={(path) => change(toggleAttached(attached ?? [], path, false))}
              onPreview={onPreview}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
