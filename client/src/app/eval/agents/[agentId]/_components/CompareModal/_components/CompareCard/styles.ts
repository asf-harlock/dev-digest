import type { CSSProperties } from "react";

export const s = {
  card: {
    flex: 1,
    minWidth: 150,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 14,
  } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  values: { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginTop: 10 } satisfies CSSProperties,
  next: { fontSize: 22, fontWeight: 700 } satisfies CSSProperties,
  scope: { marginTop: 6, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
