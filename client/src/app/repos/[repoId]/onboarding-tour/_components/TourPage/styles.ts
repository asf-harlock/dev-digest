import type { CSSProperties } from "react";

export const s = {
  page: { padding: 28, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 } satisfies CSSProperties,
  layout: {
    display: "grid",
    gridTemplateColumns: "200px minmax(0, 1fr)",
    gap: 32,
    alignItems: "start",
  } satisfies CSSProperties,
  content: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 } satisfies CSSProperties,
  notice: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  skeletonBlock: { display: "flex", flexDirection: "column", gap: 12, padding: 28 } satisfies CSSProperties,
} as const;
