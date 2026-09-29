import type { CSSProperties } from "react";

export const s = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minWidth: 0,
    padding: 20,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  head: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  path: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", wordBreak: "break-all" } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { fontSize: 14, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
