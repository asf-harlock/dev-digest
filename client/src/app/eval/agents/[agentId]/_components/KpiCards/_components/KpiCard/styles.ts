import type { CSSProperties } from "react";

export const s = {
  card: {
    flex: 1,
    minWidth: 220,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 18,
  } satisfies CSSProperties,
  top: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  bottom: { display: "flex", alignItems: "baseline", gap: 10, marginTop: 12 } satisfies CSSProperties,
  value: (color: string): CSSProperties => ({
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color,
  }),
} as const;
