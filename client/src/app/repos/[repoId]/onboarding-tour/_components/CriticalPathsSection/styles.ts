import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    minWidth: 0,
  } satisfies CSSProperties,
  path: { color: "var(--text-primary)", fontSize: 13, overflowWrap: "anywhere" } satisfies CSSProperties,
  reason: { flex: 1, minWidth: 0, color: "var(--text-secondary)" } satisfies CSSProperties,
  active: { color: "var(--text-primary)", fontWeight: 650 } satisfies CSSProperties,
  open: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
    minWidth: 24,
    padding: "4px 12px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    color: "var(--text-primary)",
    fontSize: 12.5,
    textDecoration: "none",
    flexShrink: 0,
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
