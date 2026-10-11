import type { CSSProperties } from "react";

/** Co-located styles for RunStatus. */
export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minHeight: 20 } satisfies CSSProperties,
  live: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  warn: { fontSize: 13, color: "var(--warn)" } satisfies CSSProperties,
  reason: { fontSize: 13, color: "var(--crit)", overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
