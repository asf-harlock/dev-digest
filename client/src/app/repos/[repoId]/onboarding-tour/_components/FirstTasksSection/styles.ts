import type { CSSProperties } from "react";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 } satisfies CSSProperties,
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 14,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    minWidth: 0,
  } satisfies CSSProperties,
  title: { margin: 0, fontSize: 14, fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  desc: { margin: 0, color: "var(--text-secondary)" } satisfies CSSProperties,
  path: { fontSize: 12, color: "var(--text-muted)", overflowWrap: "anywhere" } satisfies CSSProperties,
  chip: { alignSelf: "flex-start" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
