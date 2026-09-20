import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  } satisfies CSSProperties,
  label: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  dot: (color: string): CSSProperties => ({
    width: 6,
    height: 6,
    borderRadius: 99,
    background: color,
  }),
  nav: { display: "flex", alignItems: "center", gap: 4 } satisfies CSSProperties,
} as const;
