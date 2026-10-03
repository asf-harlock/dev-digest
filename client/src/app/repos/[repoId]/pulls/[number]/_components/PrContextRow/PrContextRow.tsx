/* PrContextRow — one document in the Context tab. The checkbox's accessible
   name is the path; attached rows add keyboard Move up / Move down buttons
   (no drag-only reordering). All targets are >= 24x24 px. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { PrContextAttachable, PrContextEntry } from "@devdigest/shared";
import { STATUS_COLORS } from "./constants";
import { s } from "./styles";

export interface PrContextRowProps {
  path: string;
  origin: PrContextAttachable["origin"];
  /** Present on attached rows only. */
  entry?: PrContextEntry;
  checked: boolean;
  disabled: boolean;
  /** Attached rows only: position for the Move buttons. */
  index?: number;
  count?: number;
  onToggle: () => void;
  onMove?: (delta: -1 | 1) => void;
  onPreview: () => void;
}

export function PrContextRow({
  path,
  origin,
  entry,
  checked,
  disabled,
  index,
  count,
  onToggle,
  onMove,
  onPreview,
}: PrContextRowProps) {
  const t = useTranslations("prContext");
  const c = entry ? STATUS_COLORS[entry.status] : null;
  const canMove = checked && onMove != null && index != null && count != null;
  return (
    <li style={s.row}>
      <span style={s.checkboxHit}>
        <input
          type="checkbox"
          style={s.checkbox}
          checked={checked}
          disabled={disabled}
          onChange={onToggle}
          aria-label={path}
        />
      </span>
      <button type="button" className="mono" style={s.pathBtn} onClick={onPreview} title={t("row.preview")}>
        {path}
      </button>
      <Badge color="var(--text-muted)">{t(`origin.${origin}`)}</Badge>
      {entry && (
        <>
          <span style={s.meta}>{t("row.tokens", { tokens: entry.tokens })}</span>
          {c && <Badge color={c.color} bg={c.bg}>{t(`status.${entry.status}`)}</Badge>}
          {entry.warnings.length > 0 && (
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("row.warning")}
            </Badge>
          )}
        </>
      )}
      {canMove && (
        <>
          <button
            type="button"
            style={s.iconBtn}
            disabled={disabled || index === 0}
            onClick={() => onMove(-1)}
            aria-label={t("row.moveUp", { path })}
            title={t("row.moveUpShort")}
          >
            <Icon.ArrowUp size={14} />
          </button>
          <button
            type="button"
            style={s.iconBtn}
            disabled={disabled || index === count - 1}
            onClick={() => onMove(1)}
            aria-label={t("row.moveDown", { path })}
            title={t("row.moveDownShort")}
          >
            <Icon.ArrowDown size={14} />
          </button>
        </>
      )}
    </li>
  );
}
