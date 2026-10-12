import type { CSSProperties } from "react";

/** Co-located styles for CaseRunStatus. */
export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 } satisfies CSSProperties,
  live: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  warn: { fontSize: 13, color: "var(--warn)" } satisfies CSSProperties,
} as const;
