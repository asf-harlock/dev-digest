import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--code-bg)",
    minWidth: 0,
  } satisfies CSSProperties,
  index: { color: "var(--text-muted)", fontSize: 12, minWidth: 14 } satisfies CSSProperties,
  command: { flex: 1, minWidth: 0, color: "var(--text-primary)", fontSize: 13, overflowWrap: "anywhere" } satisfies CSSProperties,
  desc: { color: "var(--text-muted)" } satisfies CSSProperties,
  copy: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 24,
    minHeight: 24,
    padding: 4,
    background: "transparent",
    border: "none",
    borderRadius: 5,
    color: "var(--text-secondary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  env: { margin: "10px 0 0", fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  live: { margin: "8px 0 0", minHeight: 16, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
