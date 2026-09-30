"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { DEFAULT_KIND, KIND_COLORS } from "../context-doc-list/constants";
import type { DocRow } from "../context-doc-list/helpers";
import { s } from "./styles";

export interface ContextDocRowProps {
  row: DocRow;
  /** Attach mode shows checkboxes and Move controls; page mode does not. */
  attachMode: boolean;
  /** True while a save is in flight (EC-23): checkboxes and Move controls off. */
  disabled: boolean;
  selected: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: (path: string, attach: boolean) => void;
  onMove: (path: string, direction: -1 | 1) => void;
  onRemove: (path: string) => void;
  onPreview: (path: string) => void;
}

function KindChip({ file }: { file: SpecFile }) {
  const t = useTranslations("context");
  const kind = file.kind ?? DEFAULT_KIND;
  const c = KIND_COLORS[kind];
  return (
    <Badge color={c.color} bg={c.bg}>
      {t(`kind.${kind}`)}
    </Badge>
  );
}

/** One document row: path, kind chip, `≈ tokens`, injection/unattachable
 *  notices, Preview, and (attach mode) checkbox + Move up/down. */
export function ContextDocRow({
  row,
  attachMode,
  disabled,
  selected,
  canMoveUp,
  canMoveDown,
  onToggle,
  onMove,
  onRemove,
  onPreview,
}: ContextDocRowProps) {
  const t = useTranslations("context");

  if (row.type === "missing") {
    return (
      <li style={s.rowMissing}>
        <span style={s.checkboxSpacer} aria-hidden="true" />
        <span className="mono" style={s.pathMuted} title={row.path}>
          {row.path}
        </span>
        <Badge color="var(--warn, var(--text-secondary))" icon="AlertTriangle">
          {t("row.missing")}
        </Badge>
        <button
          type="button"
          style={disabled ? { ...s.textBtn, opacity: 0.5, cursor: "default" } : s.textBtn}
          disabled={disabled}
          aria-label={t("row.removeNamed", { path: row.path })}
          onClick={() => onRemove(row.path)}
        >
          {t("row.remove")}
        </button>
      </li>
    );
  }

  if (row.type === "inherited") {
    const file = row.file;
    return (
      <li style={s.row}>
        <span style={s.checkboxSpacer} aria-hidden="true" />
        <span className="mono" style={s.path} title={row.path}>
          {row.path}
        </span>
        {file && <KindChip file={file} />}
        {file?.tokens != null && <span style={s.tokens}>{t("row.tokens", { tokens: file.tokens })}</span>}
        <Badge color="var(--text-secondary)" icon="Link">
          {t("row.viaSkill", { skill: row.skillName })}
        </Badge>
        {file && (
          <div style={s.actions}>
            <button
              type="button"
              style={s.textBtn}
              aria-label={t("row.previewNamed", { path: row.path })}
              onClick={() => onPreview(row.path)}
            >
              {t("row.preview")}
            </button>
          </div>
        )}
      </li>
    );
  }

  const { file, attachedIndex } = row;
  const isAttached = attachedIndex >= 0;
  const unattachable = file.attachable === false;
  const reason = file.unattachable_reason;
  // An already-attached document that turned unattachable stays uncheckable-off
  // so the user can still remove it; only an unattached one is locked.
  const checkboxDisabled = disabled || (unattachable && !isAttached);
  const patterns = file.injection_patterns ?? [];

  return (
    <li style={selected ? s.rowSelected : s.row} aria-current={selected ? "true" : undefined}>
      {attachMode ? (
        <input
          type="checkbox"
          style={s.checkbox}
          checked={isAttached}
          disabled={checkboxDisabled}
          aria-label={file.path}
          onChange={(e) => onToggle(file.path, e.target.checked)}
        />
      ) : null}
      <span className="mono" style={s.path} title={file.path}>
        {file.path}
      </span>
      <KindChip file={file} />
      {file.tokens != null && <span style={s.tokens}>{t("row.tokens", { tokens: file.tokens })}</span>}
      {unattachable && reason && (
        <Badge color="var(--text-muted)" icon="Lock">
          {t(`row.unattachable.${reason}`)}
        </Badge>
      )}
      {file.injection_flagged && (
        <span title={patterns.length > 0 ? t("row.injectionNamed", { patterns: patterns.join(", ") }) : undefined}>
          <Badge color="var(--crit)" bg="var(--crit-bg)" icon="Shield">
            {t("row.injection")}
          </Badge>
        </span>
      )}
      {!attachMode && file.used_by != null && <span style={s.meta}>{t("row.usedBy", { count: file.used_by })}</span>}
      <div style={s.actions}>
        <button
          type="button"
          style={s.textBtn}
          aria-label={t("row.previewNamed", { path: file.path })}
          onClick={() => onPreview(file.path)}
        >
          {t("row.preview")}
        </button>
        {attachMode && isAttached && (
          <>
            <button
              type="button"
              aria-label={t("row.moveUpNamed", { path: file.path })}
              style={disabled || !canMoveUp ? s.iconBtnDisabled : s.iconBtn}
              disabled={disabled || !canMoveUp}
              onClick={() => onMove(file.path, -1)}
            >
              <Icon.ArrowUp size={13} />
            </button>
            <button
              type="button"
              aria-label={t("row.moveDownNamed", { path: file.path })}
              style={disabled || !canMoveDown ? s.iconBtnDisabled : s.iconBtn}
              disabled={disabled || !canMoveDown}
              onClick={() => onMove(file.path, 1)}
            >
              <Icon.ArrowDown size={13} />
            </button>
          </>
        )}
      </div>
    </li>
  );
}
