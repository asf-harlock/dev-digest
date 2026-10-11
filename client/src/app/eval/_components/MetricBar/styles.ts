import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 8, minWidth: 130 } satisfies CSSProperties,
  track: {
    flex: 1,
    minWidth: 56,
    height: 8,
    background: "var(--bg-hover)",
    borderRadius: 4,
    overflow: "hidden",
  } satisfies CSSProperties,
  fill: (color: string, pct: number): CSSProperties => ({
    width: `${pct}%`,
    height: "100%",
    background: color,
    borderRadius: 4,
  }),
  text: {
    width: 40,
    textAlign: "right",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
