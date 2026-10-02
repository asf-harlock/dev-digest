import type { CSSProperties } from "react";

export const s = {
  stack: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  heading: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 8,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg-hover)",
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  filter: {
    minHeight: 32,
    padding: "4px 10px",
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  skeletonStack: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
