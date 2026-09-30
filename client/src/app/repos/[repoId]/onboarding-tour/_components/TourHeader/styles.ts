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
  actions: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  link: { fontSize: 13, color: "var(--accent-text)", textDecoration: "underline", minHeight: 24 } satisfies CSSProperties,
} as const;
