import type { CSSProperties } from "react";

/** Co-located styles for InstallationRow. */
export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    width: "100%",
    padding: "14px 16px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    textAlign: "left",
    cursor: "pointer",
  } satisfies CSSProperties,
  rowSelected: { borderColor: "var(--accent)", background: "var(--bg-elevated)" } satisfies CSSProperties,
  icon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  repo: {
    fontSize: 14,
    fontWeight: 600,
    flex: 1,
    minWidth: 160,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  meta: { display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  version: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  time: {
    fontSize: 13,
    color: "var(--text-muted)",
    minWidth: 64,
    textAlign: "right",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
