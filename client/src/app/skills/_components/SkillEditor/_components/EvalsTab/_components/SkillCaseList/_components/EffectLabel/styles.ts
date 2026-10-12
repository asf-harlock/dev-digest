import type { CSSProperties } from "react";

/** Co-located styles for EffectLabel. */
export const s = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  effect: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color,
    whiteSpace: "nowrap",
  }),
  arms: { fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
