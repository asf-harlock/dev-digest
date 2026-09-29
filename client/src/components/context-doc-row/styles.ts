import type { CSSProperties } from "react";
import { ROW_HEIGHT } from "../context-doc-list/constants";

const rowBase = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: ROW_HEIGHT,
  boxSizing: "border-box",
  padding: "6px 12px",
  borderRadius: 7,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
} satisfies CSSProperties;

const iconBtn = {
  display: "grid",
  placeItems: "center",
  width: 24,
  height: 24,
  padding: 0,
  borderRadius: 5,
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
} satisfies CSSProperties;

export const s = {
  row: rowBase,
  rowSelected: { ...rowBase, borderColor: "var(--accent)" } satisfies CSSProperties,
  rowMissing: { ...rowBase, borderStyle: "dashed", background: "transparent" } satisfies CSSProperties,
  checkbox: { width: 16, height: 16, margin: 0, flexShrink: 0, accentColor: "var(--accent)" } satisfies CSSProperties,
  checkboxSpacer: { width: 16, flexShrink: 0 } satisfies CSSProperties,
  path: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  pathMuted: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 2, flexShrink: 0 } satisfies CSSProperties,
  iconBtn,
  iconBtnDisabled: { ...iconBtn, color: "var(--text-muted)", opacity: 0.4, cursor: "default" } satisfies CSSProperties,
  textBtn: {
    ...iconBtn,
    width: "auto",
    padding: "0 8px",
    fontSize: 12,
    height: 24,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
