import type { CSSProperties } from "react";

export const s = {
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  meta: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    margin: "6px 0 0",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  sep: { color: "var(--text-muted)" } satisfies CSSProperties,
  badges: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 8 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } satisfies CSSProperties,
} as const;
