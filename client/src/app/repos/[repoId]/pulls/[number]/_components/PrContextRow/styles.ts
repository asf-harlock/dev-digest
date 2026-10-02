import type { CSSProperties } from "react";

const MIN_TARGET = 24;

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg-surface)",
    fontSize: 13,
  } satisfies CSSProperties,
  checkbox: { width: 16, height: 16, margin: 0, cursor: "pointer", flexShrink: 0 } satisfies CSSProperties,
  checkboxHit: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: MIN_TARGET,
    minHeight: MIN_TARGET,
    flexShrink: 0,
  } satisfies CSSProperties,
  path: { flex: 1, minWidth: 0, overflowWrap: "anywhere", color: "var(--text-primary)" } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: MIN_TARGET,
    minHeight: MIN_TARGET,
    border: "1px solid var(--border)",
    borderRadius: 5,
    background: "var(--bg-surface)",
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
  } satisfies CSSProperties,
  pathBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: MIN_TARGET,
    border: "none",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    padding: 0,
    overflowWrap: "anywhere",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
